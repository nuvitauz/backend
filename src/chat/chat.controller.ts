import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateSessionDto, SendMessageDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('session')
  async createSession(@Body() dto: CreateSessionDto) {
    return this.chatService.createSession(dto.userId, dto.number);
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.chatService.getSession(sessionId);
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    try {
      return await this.chatService.sendMessage(dto.sessionId, dto.content);
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Failed to send message',
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
