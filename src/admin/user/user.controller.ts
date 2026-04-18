import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { AdminUserService } from './user.service';

@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  // Oxirgi 10 userni olish
  @Get('recent')
  getRecentUsers(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.adminUserService.findRecent(parsedLimit);
  }

  // Barcha userlarni olish (pagination bilan)
  @Get()
  getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.adminUserService.findAll(parsedPage, parsedLimit);
  }

  // Userlar sonini olish
  @Get('count')
  getUsersCount() {
    return this.adminUserService.getCount();
  }

  // Bitta userni to'liq ma'lumotlari bilan olish
  @Get(':id')
  getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.findOne(id);
  }
}
