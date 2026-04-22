import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AdminUserService } from './user.service';

@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  // Oxirgi N ta userni olish
  @Get('recent')
  getRecentUsers(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.adminUserService.findRecent(parsedLimit);
  }

  // Barcha userlarni olish (pagination bilan)
  @Get()
  getAllUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.adminUserService.findAll(parsedPage, parsedLimit);
  }

  // Userlar sonini olish
  @Get('count')
  getUsersCount() {
    return this.adminUserService.getCount();
  }

  // Bitta userni asosiy ma'lumotlari bilan olish
  @Get(':id')
  getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.findOne(id);
  }

  // Userning barcha buyurtmalari
  @Get(':id/orders')
  getUserOrders(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.getUserOrders(id);
  }

  // Userning savati
  @Get(':id/cart')
  getUserCart(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.getUserCart(id);
  }

  // Userning saqlangan mahsulotlari
  @Get(':id/saved')
  getUserSaved(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.getUserSavedProducts(id);
  }

  // Userning NuvitaAI chat sessiyalari
  @Get(':id/chats')
  getUserChats(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.getUserChatSessions(id);
  }

  // Bitta chat sessiyasining xabarlari
  @Get(':id/chats/:sessionId')
  getUserChatMessages(
    @Param('id', ParseIntPipe) _id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.adminUserService.getChatSessionMessages(sessionId);
  }

  // Foydalanuvchi statusini yangilash (ACTIVE / NOCASH / BANNED)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.adminUserService.updateStatus(id, status);
  }
}
