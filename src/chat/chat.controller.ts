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
import { CreateSessionDto, SendMessageDto } from './dto/chat.dto';
import { OptionalJwtAuthGuard } from './optional-auth.guard';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('session')
  async createSession(@Body() dto: CreateSessionDto, @Req() req: any) {
    try {
      // Prefer the authenticated user (from JWT) over client-supplied fields —
      // this guarantees every logged-in user's chat is correctly linked.
      const authUserId: number | undefined = req?.user?.sub;
      const finalUserId = authUserId ?? dto.userId;
      return await this.chatService.createSession(finalUserId, dto.number);
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

  @UseGuards(OptionalJwtAuthGuard)
  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto, @Req() req: any) {
    if (!dto?.sessionId || !dto?.content?.trim()) {
      throw new HttpException(
        'sessionId va content majburiy',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const authUserId: number | undefined = req?.user?.sub;
      return await this.chatService.sendMessage(
        dto.sessionId,
        dto.content,
        authUserId,
        dto.lang,
      );
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
