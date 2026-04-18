import { Controller, Get, Patch, Post, Body, UseGuards, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TelegramService } from '../telegram/telegram.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly telegramService: TelegramService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req) {
    // req.user has { sub: userId, number }
    return this.userService.getProfile(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Req() req, @Body() body: any) {
    return this.userService.updateProfile(req.user.sub, body);
  }

  // Generate Telegram link token for current user
  @UseGuards(JwtAuthGuard)
  @Post('telegram-link')
  async generateTelegramLink(@Req() req) {
    const user = await this.userService.getProfile(req.user.sub);
    
    // User already has Telegram connected
    if (user.userId) {
      return { 
        linked: true, 
        username: user.username,
        message: 'Telegram allaqachon ulangan' 
      };
    }

    // Generate link token
    const token = this.telegramService.generateLinkToken(user.number, user.id);
    const botLink = `https://t.me/nuvitauzbot?start=${token}`;
    
    return { 
      linked: false, 
      link: botLink 
    };
  }
}
