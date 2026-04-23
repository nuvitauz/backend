import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Post('session')
  async createSession(@Req() req: any) {
    try {
      return await this.chatService.createSession(req.user.sub);
    } catch (error: any) {
      this.logger.error(
        `createSession xatosi: ${error?.message}`,
        error?.stack,
      );
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Sessiya yaratishda xatolik',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string, @Req() req: any) {
    const session = await this.chatService.getSessionForUser(
      sessionId,
      req.user.sub,
    );
    if (!session) {
      throw new HttpException('Session topilmadi', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @UseGuards(JwtAuthGuard)
  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto, @Req() req: any) {
    if (!dto?.sessionId || !dto?.content?.trim()) {
      throw new HttpException(
        'sessionId va content majburiy',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.chatService.sendMessage(
        dto.sessionId,
        dto.content,
        req.user.sub,
        dto.lang,
      );
    } catch (error: any) {
      this.logger.error(`sendMessage xatosi: ${error?.message}`, error?.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Xabar yuborishda xatolik',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('user/:userId/sessions')
  async getUserSessions(@Param('userId') userId: string) {
    return this.chatService.getSessionsByUser(parseInt(userId, 10));
  }

  @Post('session/:sessionId/close')
  async closeSession(@Param('sessionId') sessionId: string) {
    return this.chatService.closeSession(sessionId);
  }
}
