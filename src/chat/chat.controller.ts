import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateSessionDto, SendMessageDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post('session')
  async createSession(@Body() dto: CreateSessionDto) {
    try {
      return await this.chatService.createSession(dto.userId, dto.number);
    } catch (error: any) {
      this.logger.error(
        `createSession xatosi: ${error?.message}`,
        error?.stack,
      );
      throw new HttpException(
        error?.message || 'Sessiya yaratishda xatolik',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.chatService.getSession(sessionId);
    if (!session) {
      throw new HttpException('Session topilmadi', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    if (!dto?.sessionId || !dto?.content?.trim()) {
      throw new HttpException(
        'sessionId va content majburiy',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.chatService.sendMessage(dto.sessionId, dto.content);
    } catch (error: any) {
      this.logger.error(`sendMessage xatosi: ${error?.message}`, error?.stack);
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
