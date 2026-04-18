import { Controller, Post, Body, Get, Param, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramService } from '../telegram/telegram.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telegramService: TelegramService,
  ) {}

  @Post('check-phone')
  checkPhone(@Body('number') number: string) {
    return this.authService.checkPhone(number);
  }

  @Post('register')
  register(@Body() body: any) {
    const telegramData = {
      userId: body.telegramId,
      username: body.username,
      fullName: body.fullName,
    };
    return this.authService.register(body.number, body.password, telegramData);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body.number, body.password);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('telegram')
  telegramAuth(@Body('initData') initData: string) {
    return this.authService.telegramAuth(initData);
  }

  // Get registration token data (for Mini App)
  @Get('register-token/:token')
  getRegisterToken(@Param('token') token: string) {
    const data = this.telegramService.getRegistrationToken(token);
    if (!data) {
      throw new NotFoundException('Token topilmadi yoki muddati tugagan');
    }
    return {
      phone: data.phone,
      fullName: data.fullName,
      telegramId: data.telegramId,
      username: data.username,
    };
  }

  // Register with token
  @Post('register-with-token')
  async registerWithToken(@Body() body: { token: string; password: string }) {
    const tokenData = this.telegramService.getRegistrationToken(body.token);
    if (!tokenData) {
      throw new NotFoundException('Token topilmadi yoki muddati tugagan');
    }

    const result = await this.authService.register(
      tokenData.phone,
      body.password,
      {
        userId: tokenData.telegramId,
        username: tokenData.username,
        fullName: tokenData.fullName,
      }
    );

    // Delete token after successful registration
    this.telegramService.deleteRegistrationToken(body.token);

    return result;
  }
}
