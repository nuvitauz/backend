import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, JwtModule, TelegramModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
