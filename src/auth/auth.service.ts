import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
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
    return { exists: !!user };
  }

  async register(
    number: string,
    passwordString: string,
    telegramData?: { userId?: string; username?: string; fullName?: string },
  ) {
    // Check if phone number already exists
    const existingByPhone = await this.prisma.user.findUnique({ where: { number } });
    if (existingByPhone) {
      throw new HttpException('Bu telefon raqam allaqachon ro\'yxatdan o\'tgan', HttpStatus.CONFLICT);
    }

    // Check if Telegram userId already exists (if provided)
    if (telegramData?.userId) {
      const existingByTelegramId = await this.prisma.user.findUnique({ 
        where: { userId: telegramData.userId } 
      });
      if (existingByTelegramId) {
        throw new HttpException('Bu Telegram hisob allaqachon ro\'yxatdan o\'tgan', HttpStatus.CONFLICT);
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

      return this.generateTokens(user.id, user.number);
    } catch (error: any) {
      // Handle any Prisma unique constraint errors
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (target?.includes('user_id')) {
          throw new HttpException('Bu Telegram hisob allaqachon ro\'yxatdan o\'tgan', HttpStatus.CONFLICT);
        }
        if (target?.includes('number')) {
          throw new HttpException('Bu telefon raqam allaqachon ro\'yxatdan o\'tgan', HttpStatus.CONFLICT);
        }
        throw new HttpException('Ma\'lumotlar takrorlanmoqda', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async login(number: string, passwordString: string) {
    const user = await this.prisma.user.findUnique({ where: { number } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(passwordString, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.number);
  }

  private async generateTokens(userId: number, number: string) {
    const payload = { sub: userId, number };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    // Save refresh token to db
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

      return this.generateTokens(user.id, user.number);
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

    // Parse initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Sort and create data check string
    const dataCheckArr: string[] = [];
    params.sort();
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArr.join('\n');

    // Verify hash
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram data');
    }

    // Check auth_date (not older than 24 hours)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('Telegram data expired');
    }

    // Get user data
    const userDataStr = params.get('user');
    if (!userDataStr) {
      throw new UnauthorizedException('No user data in Telegram init data');
    }

    const tgUser: TelegramUser = JSON.parse(userDataStr);
    const tgUserId = String(tgUser.id);
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { userId: tgUserId },
    });

    if (!user) {
      // Create new user with TG data (without phone number initially)
      user = await this.prisma.user.create({
        data: {
          number: `tg_${tgUserId}`, // placeholder phone number
          userId: tgUserId,
          username: tgUser.username || null,
          fullName: fullName || null,
        },
      });
    } else {
      // Update user info from TG
      user = await this.prisma.user.update({
        where: { userId: tgUserId },
        data: {
          username: tgUser.username || user.username,
          fullName: fullName || user.fullName,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.number);

    return {
      ...tokens,
      user: {
        id: user.id,
        number: user.number,
        userId: user.userId,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        lang: user.lang,
        profileComplete: user.profileComplete,
        photoUrl: tgUser.photo_url || null,
      },
    };
  }
}
