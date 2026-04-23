import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramService } from '../telegram/telegram.service';
import { JwtAuthGuard } from './jwt-auth.guard';

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

    this.telegramService.deleteRegistrationToken(body.token);

    return result;
  }

  /**
   * Request a password-setup link via Telegram bot for a phone number
   * that exists in DB but has no password yet. Bot will DM a one-time link.
   */
  @Post('request-password-link')
  async requestPasswordLink(@Body('number') number: string) {
    if (!number) throw new BadRequestException('number is required');
    const sent = await this.telegramService.sendPasswordSetupLinkByPhone(number);
    return sent;
  }

  /**
   * Set password for the authenticated user (e.g. TG-onboarded user
   * enabling website login from the profile page).
   */
  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  setPassword(@Req() req, @Body('password') password: string) {
    return this.authService.setPassword(req.user.sub, password);
  }

  /**
   * Validate a password-setup token (pw_XXX) issued by the bot
   * and return minimal user context for the Mini App page.
   */
  @Get('password-token/:token')
  getPasswordToken(@Param('token') token: string) {
    const data = this.telegramService.getPasswordSetupToken(token);
    if (!data) {
      throw new NotFoundException('Token topilmadi yoki muddati tugagan');
    }
    return {
      phone: data.phone,
      telegramId: data.telegramId,
    };
  }

  /**
   * Consume a one-time password-setup token (pw_XXX) and set the user's
   * password. Returns fresh JWTs so the Mini App can transition to the
   * logged-in state without a second call.
   */
  @Post('set-password-with-token')
  async setPasswordWithToken(
    @Body() body: { token: string; password: string },
  ) {
    const data = this.telegramService.getPasswordSetupToken(body.token);
    if (!data) {
      throw new NotFoundException('Token topilmadi yoki muddati tugagan');
    }

    await this.authService.setPassword(data.userId, body.password);
    this.telegramService.deletePasswordSetupToken(body.token);

    // Also issue fresh tokens so the Mini App can auto-login after setup.
    const tokens = await this.authService.issueTokensForUser(data.userId);
    return { ...tokens, success: true };
  }
}
