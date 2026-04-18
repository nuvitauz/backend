import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpException,
} from '@nestjs/common';
import { SavedService } from './saved.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('saved')
@UseGuards(JwtAuthGuard)
export class SavedController {
  constructor(private readonly savedService: SavedService) {}

  // Barcha saqlangan mahsulotlarni olish
  @Get()
  getSavedProducts(@Req() req) {
    return this.savedService.getSavedProducts(req.user.number);
  }

  // Saqlangan mahsulotlar sonini olish (header badge)
  @Get('count')
  getSavedCount(@Req() req) {
    return this.savedService.getSavedCount(req.user.number);
  }

  // Mahsulot saqlangan yoki yo'qligini tekshirish
  @Get('check/:productId')
  checkSaved(@Req() req, @Param('productId') productId: string) {
    return this.savedService.checkSaved(req.user.number, productId);
  }

  // Bir nechta mahsulotlarni tekshirish
  @Post('check-multiple')
  checkMultipleSaved(@Req() req, @Body() body: { productIds: string[] }) {
    return this.savedService.checkMultipleSaved(req.user.number, body.productIds);
  }

  // Mahsulotni saqlash/o'chirish (toggle)
  @Post('toggle/:productId')
  async toggleSave(@Req() req, @Param('productId') productId: string) {
    try {
      return await this.savedService.toggleSave(req.user.number, productId);
    } catch (e: any) {
      throw new HttpException(e.message || 'Xatolik', e.status || 500);
    }
  }

  // Mahsulotni saqlash
  @Post(':productId')
  async saveProduct(@Req() req, @Param('productId') productId: string) {
    try {
      return await this.savedService.saveProduct(req.user.number, productId);
    } catch (e: any) {
      throw new HttpException(e.message || 'Xatolik', e.status || 500);
    }
  }

  // Mahsulotni saqlashdan o'chirish
  @Delete(':productId')
  async unsaveProduct(@Req() req, @Param('productId') productId: string) {
    try {
      return await this.savedService.unsaveProduct(req.user.number, productId);
    } catch (e: any) {
      throw new HttpException(e.message || 'Xatolik', e.status || 500);
    }
  }
}
