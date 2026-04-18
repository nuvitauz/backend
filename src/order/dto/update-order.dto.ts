import { IsEnum, IsOptional, IsNumber } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma';

export class UpdateOrderDto {
  @IsEnum(OrderStatus)
  @IsOptional()
  orderStatus?: OrderStatus;

  @IsNumber()
  @IsOptional()
  courierUserId?: number;
}
