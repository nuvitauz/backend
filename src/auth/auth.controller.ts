import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('check-phone')
  checkPhone(@Body('number') number: string) {
    return this.authService.checkPhone(number);
  }

  @Post('login')
  login(@Body() body: { number: string; password: string }) {
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
}
