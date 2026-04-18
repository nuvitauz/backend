import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { PaymentType } from '../../../generated/prisma';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  contactNumber: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(PaymentType)
  @IsNotEmpty()
  paymentType: PaymentType;

  @IsString()
  @IsOptional()
  comment?: string; // Mijoz izohi (ixtiyoriy)
}
