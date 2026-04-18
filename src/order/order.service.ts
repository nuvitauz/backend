import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService
  ) {}

  async create(userNumber: string, createOrderDto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { number: userNumber },
      include: {
        cart: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    if (!user.cart || user.cart.items.length === 0) {
      throw new BadRequestException("Savat bo'sh, buyurtma berish mumkin emas");
    }

    const productItemsJson = user.cart.items.map(item => ({
      productId: item.productId,
      name: item.product.name,
      price: item.product.price,
      count: item.productCount,
      photoUrl: item.product.photos?.[0] || null,
      photos: item.product.photos || []
    }));

    const orderCount = user.cart.count;
    const orderSumm = user.cart.summ;
    
    // Get deliverySumm from settings
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const deliverySumm = settings ? settings.deliverySumm : 30000;

    return this.prisma.$transaction(async (prisma) => {
      const order = await prisma.order.create({
        data: {
          userId: user.id,
          userNumber: user.number,
          fullName: createOrderDto.fullName,
          contactNumber: createOrderDto.contactNumber,
          address: createOrderDto.address,
          comment: createOrderDto.comment || null,
          productItems: productItemsJson,
          count: orderCount,
          summ: orderSumm,
          deliverySumm: deliverySumm,
          paymentType: createOrderDto.paymentType,
          paymentStatus: 'PENDING',
          orderStatus: 'NEW',
        }
      });

      await prisma.cartItem.deleteMany({
        where: { cartId: user.cart!.id }
      });

      await prisma.cart.update({
        where: { id: user.cart!.id },
        data: {
          count: 0,
          summ: 0
        }
      });

      return {
        message: "Buyurtma muvaffaqiyatli yaratildi",
        order
      };
    });
  }

  async findAll() {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }
  
  async findUserOrders(userNumber: string) {
     return this.prisma.order.findMany({
         where: { userNumber },
         orderBy: { createdAt: 'desc' }
     });
  }

  async update(orderId: string, updateOrderDto: UpdateOrderDto) {
    const existingOrder = await this.prisma.order.findUnique({
      where: { orderId },
      include: { user: true }
    });

    if (!existingOrder) throw new BadRequestException("Buyurtma topilmadi");

    const data: any = {};
    if (updateOrderDto.orderStatus) data.orderStatus = updateOrderDto.orderStatus;
    if (updateOrderDto.courierUserId) data.courierUserId = updateOrderDto.courierUserId;

    const updatedOrder = await this.prisma.order.update({
      where: { orderId },
      data,
      include: { user: true }
    });

    // Handle Admin Action: If accepted and courier assigned
    if (updatedOrder.orderStatus === 'ACCEPTED' && updatedOrder.courierUserId) {
        const courier = await this.prisma.user.findUnique({ where: { id: updatedOrder.courierUserId }});
        if (courier && courier.userId) {
            await this.telegramService.notifyCourierNewOrder(courier.userId, updatedOrder);
        }
        
        if (updatedOrder.user.userId) {
             await this.telegramService.notifyUserStatusOrMessage(
               updatedOrder.user.userId, 
               `✅ Buyurtmangiz (#${updatedOrder.id}) qabul qilindi va ayni vaqtda yig'ilmoqda.`
             );
        }
    }

    if (updatedOrder.orderStatus === 'CANCELLED') {
         if (updatedOrder.user.userId) {
             await this.telegramService.notifyUserStatusOrMessage(
               updatedOrder.user.userId, 
               `❌ Buyurtmangiz (#${updatedOrder.id}) ma'muriyat tomonidan bekor qilindi.`
             );
        }
    }

    return updatedOrder;
  }
}
