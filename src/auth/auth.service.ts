import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
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

  async checkPhone(number: string) {
    const user = await this.prisma.user.findUnique({ where: { number } });
    return {
      exists: !!user,
      hasPassword: !!(user && user.password),
      linkedToTelegram: !!(user && user.userId),
    };
  }

  async register(
    number: string,
    passwordString: string,
    telegramData?: { userId?: string; username?: string; fullName?: string },
  ) {
    const existingByPhone = await this.prisma.user.findUnique({ where: { number } });

    // If this phone already exists as a TG-only user (no password), just set the password
    // instead of throwing conflict. This allows the website to "claim" a TG-created account.
    if (existingByPhone) {
      if (!existingByPhone.password) {
        const hashedPassword = await bcrypt.hash(passwordString, 10);
        const updated = await this.prisma.user.update({
          where: { id: existingByPhone.id },
          data: {
            password: hashedPassword,
            userId: telegramData?.userId || existingByPhone.userId,
            username: telegramData?.username || existingByPhone.username,
            fullName: telegramData?.fullName || existingByPhone.fullName,
          },
        });
        return this.generateTokens(updated.id, updated.number || String(updated.id));
      }
      throw new HttpException("Bu telefon raqam allaqachon ro'yxatdan o'tgan", HttpStatus.CONFLICT);
    }

    if (telegramData?.userId) {
      const existingByTelegramId = await this.prisma.user.findUnique({
        where: { userId: telegramData.userId },
      });
      if (existingByTelegramId) {
        // Telegram-only account (no phone yet) → attach phone + password
        if (!existingByTelegramId.number) {
          const hashedPassword = await bcrypt.hash(passwordString, 10);
          const updated = await this.prisma.user.update({
            where: { id: existingByTelegramId.id },
            data: {
              number,
              password: hashedPassword,
              username: telegramData.username || existingByTelegramId.username,
              fullName: telegramData.fullName || existingByTelegramId.fullName,
            },
          });
          return this.generateTokens(updated.id, updated.number || String(updated.id));
        }
        throw new HttpException("Bu Telegram hisob allaqachon ro'yxatdan o'tgan", HttpStatus.CONFLICT);
      }
    }

    try {
      const hashedPassword = await bcrypt.hash(passwordString, 10);
      const user = await this.prisma.user.create({
        data: {
          number,
          password: hashedPassword,
          userId: telegramData?.userId || null,
          username: telegramData?.username || null,
          fullName: telegramData?.fullName || null,
        },
      });

      return this.generateTokens(user.id, user.number || String(user.id));
    } catch (error: any) {
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (target?.includes('user_id')) {
          throw new HttpException("Bu Telegram hisob allaqachon ro'yxatdan o'tgan", HttpStatus.CONFLICT);
        }
        if (target?.includes('number')) {
          throw new HttpException("Bu telefon raqam allaqachon ro'yxatdan o'tgan", HttpStatus.CONFLICT);
        }
        throw new HttpException("Ma'lumotlar takrorlanmoqda", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async login(number: string, passwordString: string) {
    const user = await this.prisma.user.findUnique({ where: { number } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Telegram-only user (no password set on website yet)
    if (!user.password) {
      throw new HttpException(
        {
          message:
            "Sizda hali parol o'rnatilmagan. Telegram botda /parol buyrug'ini yuboring yoki botdan kelgan havola orqali parol o'rnating.",
          code: 'PASSWORD_NOT_SET',
        },
        HttpStatus.CONFLICT,
      );
    }

    const isMatch = await bcrypt.compare(passwordString, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.number || String(user.id));
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
      // Not registered yet → ask the user to complete onboarding via the bot.
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
        hasPassword: !!refreshed.password,
        photoUrl: tgUser.photo_url || null,
      },
    };
  }

  /**
   * Set or change password for the currently authenticated user.
   * Used when a TG-onboarded user wants to enable website (phone+password) login.
   */
  async setPassword(userId: number, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (!user.number) {
      throw new BadRequestException(
        "Saytga kirish uchun avval telefon raqamingizni ulashing (Telegram botda /start).",
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { success: true, message: "Parol muvaffaqiyatli o'rnatildi" };
  }

  /**
   * Public helper to mint fresh tokens for a known user id
   * (e.g. right after a password-token consumption).
   */
  async issueTokensForUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return this.generateTokens(user.id, user.number || String(user.id));
  }
}
