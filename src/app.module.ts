import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { CategoryModule } from './admin/category/category.module';
import { ProductModule } from './admin/product/product.module';
import { UserModule } from './user/user.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { StaffModule } from './admin/staff/staff.module';
import { SettingsModule } from './admin/settings/settings.module';
import { ScoreModule } from './score/score.module';
import { AdminUserModule } from './admin/user/user.module';
import { AnalyticsModule } from './admin/analytics/analytics.module';
import { BannerModule } from './admin/banner/banner.module';
import { SavedModule } from './saved/saved.module';
import { ChatModule } from './chat/chat.module';

import { SettingsController } from './settings.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    PrismaModule,
    TelegramModule,
    CategoryModule,
    ProductModule,
    UserModule,
    CartModule,
    OrderModule,
    StaffModule,
    SettingsModule,
    ScoreModule,
    AdminUserModule,
    AnalyticsModule,
    BannerModule,
    SavedModule,
    ChatModule,
  ],
  controllers: [AppController, SettingsController],
  providers: [AppService],
})
export class AppModule {}
