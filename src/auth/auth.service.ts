import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Yangi akkaunt: saytda raqam kiritilgach chaqiriladi — bot kontakti bilan moslash uchun.
   */
  async registerPendingSitePhone(raw: string) {
    const number = this.normalizeUzbekPhone(raw);
    if (!number) {
      throw new BadRequestException(
        "Telefon +998XXXXXXXXX ko'rinishida bo'lishi kerak",
      );
    }
    const user = await this.prisma.user.findUnique({ where: { number } });
    if (user) {
      throw new BadRequestException('Bu raqam allaqachon ro\'yxatdan o\'tgan');
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.pendingSitePhone.upsert({
      where: { number },
      create: { number, expiresAt },
      update: { expiresAt },
    });
    return { ok: true as const };
  }

  private normalizeUzbekPhone(raw: string): string | null {
    const d = (raw || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('998')) return `+${d}`;
    if (d.length === 9) return `+998${d}`;
    return null;
  }

  /**
   * Kirish UI: telefon kiritilgach qaysi oqim — mavjud (TG bog'langan), TG yo'q, yoki yangi.
   */
  async checkPhone(number: string) {
    const user = await this.prisma.user.findUnique({ where: { number } });
    if (user) {
      if (user.userId) {
        return { flow: 'EXISTING_LINKED' as const };
      }
      return { flow: 'EXISTING_NO_TELEGRAM' as const };
    }
    return { flow: 'NEW_USER' as const };
  }

  /** Brauzer kirish: telefon + bot yuborgan 6 xonali kod (`loginOtp`). */
  async login(number: string, passwordString: string) {
    const code = (passwordString || '').trim();
    const now = new Date();

    const user = await this.prisma.user.findUnique({ where: { number } });

    if (user) {
      if (
        user.loginOtp &&
        user.loginOtpExpiresAt &&
        user.loginOtpExpiresAt > now &&
        code === user.loginOtp
      ) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { loginOtp: null, loginOtpExpiresAt: null },
        });
        return this.generateTokens(user.id, user.number || String(user.id));
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    const tg = await this.prisma.tgUser.findUnique({ where: { number } });
    if (
      tg &&
      tg.loginOtp &&
      tg.loginOtpExpiresAt &&
      tg.loginOtpExpiresAt > now &&
      code === tg.loginOtp
    ) {
      const created = await this.prisma.user.create({
        data: {
          number: tg.number,
          userId: tg.telegramId,
          username: tg.username,
          fullName: tg.fullName,
        },
      });
      await this.prisma.tgUser.delete({ where: { id: tg.id } });
      await this.prisma.pendingSitePhone
        .deleteMany({ where: { number: tg.number } })
        .catch(() => undefined);
      return this.generateTokens(
        created.id,
        created.number || String(created.id),
      );
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  private async generateTokens(userId: number, number: string) {
    const payload = { sub: userId, number };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET || 'secretKey',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user.id, user.number || String(user.id));
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Telegram Mini App authentication
  async telegramAuth(initData: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new HttpException('Telegram bot token not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckArr: string[] = [];
    params.sort();
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram data');
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('Telegram data expired');
    }

    const userDataStr = params.get('user');
    if (!userDataStr) {
      throw new UnauthorizedException('No user data in Telegram init data');
    }

    const tgUser: TelegramUser = JSON.parse(userDataStr);
    const tgUserId = String(tgUser.id);
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');

    // Find user by TG userId — NEVER create placeholder accounts here.
    const user = await this.prisma.user.findUnique({
      where: { userId: tgUserId },
    });

    if (!user) {
      const staging = await this.prisma.tgUser.findUnique({
        where: { telegramId: tgUserId },
      });
      if (staging) {
        const created = await this.prisma.user.create({
          data: {
            number: staging.number,
            userId: staging.telegramId,
            username: tgUser.username || staging.username,
            fullName: staging.fullName || fullName || null,
          },
        });
        await this.prisma.tgUser.delete({ where: { id: staging.id } });
        const tokens = await this.generateTokens(
          created.id,
          created.number || String(created.id),
        );
        return {
          ...tokens,
          needsOnboarding: false,
          user: {
            id: created.id,
            number: created.number,
            userId: created.userId,
            username: created.username,
            fullName: created.fullName,
            email: created.email,
            address: created.address,
            dateOfBirth: created.dateOfBirth,
            gender: created.gender,
            lang: created.lang,
            role: created.role,
            profileComplete: created.profileComplete,
            photoUrl: tgUser.photo_url || null,
          },
        };
      }

      return {
        needsOnboarding: true,
        message:
          "Akkaunt topilmadi. Iltimos, botda /start bosib, telefon raqamingizni ulashing.",
        tgUser: {
          id: tgUserId,
          username: tgUser.username || null,
          fullName: fullName || null,
          photoUrl: tgUser.photo_url || null,
        },
      };
    }

    // Keep username/fullName fresh (non-destructive).
    const refreshed = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        username: tgUser.username || user.username,
        fullName: user.fullName || fullName || null,
      },
    });

    const tokens = await this.generateTokens(refreshed.id, refreshed.number || String(refreshed.id));

    return {
      ...tokens,
      needsOnboarding: false,
      user: {
        id: refreshed.id,
        number: refreshed.number,
        userId: refreshed.userId,
        username: refreshed.username,
        fullName: refreshed.fullName,
        email: refreshed.email,
        address: refreshed.address,
        dateOfBirth: refreshed.dateOfBirth,
        gender: refreshed.gender,
        lang: refreshed.lang,
        role: refreshed.role,
        profileComplete: refreshed.profileComplete,
        photoUrl: tgUser.photo_url || null,
      },
    };
  }

}
