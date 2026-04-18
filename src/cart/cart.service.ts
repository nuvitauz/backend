import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userNumber: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { number: userNumber },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          number: userNumber,
          count: 0,
          summ: 0,
        },
        include: { items: { orderBy: { id: 'asc' }, include: { product: true } } },
      });
    }

    return this.calculateAndUpdateCartTotals(cart.id);
  }

  async addToCart(userNumber: string, productId: string, count: number = 1) {
    let cart = await this.prisma.cart.findUnique({
      where: { number: userNumber },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { number: userNumber, count: 0, summ: 0 },
      });
    }

    const product = await this.prisma.product.findUnique({
      where: { productId },
    });

    if (!product) throw new NotFoundException('Product not found');

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { productCount: existingItem.productCount + count },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          productCount: count,
        },
      });
    }

    return this.calculateAndUpdateCartTotals(cart.id);
  }

  async updateItemCount(
    userNumber: string,
    itemId: number,
    action: 'increment' | 'decrement',
  ) {
    const cart = await this.prisma.cart.findUnique({
      where: { number: userNumber },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });

    if (!item) throw new NotFoundException('Cart item not found');

    if (action === 'increment') {
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { productCount: item.productCount + 1 },
      });
    } else if (action === 'decrement') {
      if (item.productCount > 1) {
        await this.prisma.cartItem.update({
          where: { id: item.id },
          data: { productCount: item.productCount - 1 },
        });
      } else {
        await this.prisma.cartItem.delete({ where: { id: item.id } });
      }
    }

    return this.calculateAndUpdateCartTotals(cart.id);
  }

  async removeItem(userNumber: string, itemId: number) {
    const cart = await this.prisma.cart.findUnique({
      where: { number: userNumber },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });

    return this.calculateAndUpdateCartTotals(cart.id);
  }

  async clearCart(userNumber: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { number: userNumber },
    });
    if (!cart) return null;

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.calculateAndUpdateCartTotals(cart.id);
  }

  private async calculateAndUpdateCartTotals(cartId: number) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: { orderBy: { id: 'asc' }, include: { product: true } } },
    });

    if (!cart) throw new NotFoundException('Cart not found');

    let totalCount = 0;
    let totalSumm = 0;

    for (const item of cart.items) {
      totalCount += item.productCount;
      totalSumm += item.productCount * (item.product?.price || 0);
    }

    const updatedCart = await this.prisma.cart.update({
      where: { id: cartId },
      data: { count: totalCount, summ: totalSumm },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            product: true,
          },
        },
      },
    });

    return updatedCart;
  }
}
