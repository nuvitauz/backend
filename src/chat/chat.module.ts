import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { OptionalJwtAuthGuard } from './optional-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, OptionalJwtAuthGuard, JwtAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
