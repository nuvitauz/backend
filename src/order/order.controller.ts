import { Controller, Post, Get, Patch, Body, UseGuards, Req, Param } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.create(req.user.number, createOrderDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMyOrders(@Req() req) {
    return this.orderService.findUserOrders(req.user.number);
  }

  @Get('admin')
  findAllAdmin() {
    // Actually you should use RoleGuard to protect this
    return this.orderService.findAll();
  }

  @Patch('admin/:id')
  updateOrderStatus(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
     return this.orderService.update(id, updateOrderDto);
  }
}