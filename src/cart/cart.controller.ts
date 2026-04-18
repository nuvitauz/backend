import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Req() req) {
    return this.cartService.getCart(req.user.number);
  }

  @Post('add')
  async addToCart(@Req() req, @Body() body: { productId: string; count?: number }) {
    try {
      return await this.cartService.addToCart(
        req.user.number,
        body.productId,
        body.count || 1,
      );
    } catch (e: any) {
      console.error(e);
      throw new HttpException(e.message || 'Error', 500);
    }

    }

  @Patch('item/:id')
  updateItemCount(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { action: 'increment' | 'decrement' },
  ) {
    return this.cartService.updateItemCount(req.user.number, +id, body.action);
  }

  @Delete('item/:id')
  removeItem(@Req() req, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.number, +id);
  }

  @Delete('clear')
  clearCart(@Req() req) {
    return this.cartService.clearCart(req.user.number);
  }
}
