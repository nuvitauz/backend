import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SavedService {
  constructor(private readonly prisma: PrismaService) {}

  // Barcha saqlangan mahsulotlarni olish
  async getSavedProducts(userNumber: string) {
    const savedProducts = await this.prisma.savedProduct.findMany({
      where: { number: userNumber },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            translations: true,
            scores: true,
          },
        },
      },
    });

    return {
      count: savedProducts.length,
      items: savedProducts.map((sp) => ({
        id: sp.id,
        savedAt: sp.createdAt,
        product: sp.product,
      })),
    };
  }

  // Saqlangan mahsulotlar sonini olish (header badge uchun)
  async getSavedCount(userNumber: string): Promise<{ count: number }> {
    const count = await this.prisma.savedProduct.count({
      where: { number: userNumber },
    });
    return { count };
  }

  // Mahsulotni saqlash (yurakcha bosish)
  async saveProduct(userNumber: string, productId: string) {
    // Mahsulot mavjudligini tekshirish
    const product = await this.prisma.product.findUnique({
      where: { productId },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot topilmadi');
    }

    // Allaqachon saqlangan bo'lsa
    const existing = await this.prisma.savedProduct.findUnique({
      where: {
        number_productId: {
          number: userNumber,
          productId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Mahsulot allaqachon saqlangan');
    }

    await this.prisma.savedProduct.create({
      data: {
        number: userNumber,
        productId,
      },
    });

    return { message: 'Mahsulot saqlandi', saved: true };
  }

  // Mahsulotni saqlashdan o'chirish
  async unsaveProduct(userNumber: string, productId: string) {
    const existing = await this.prisma.savedProduct.findUnique({
      where: {
        number_productId: {
          number: userNumber,
          productId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Saqlangan mahsulot topilmadi');
    }

    await this.prisma.savedProduct.delete({
      where: { id: existing.id },
    });

    return { message: "Mahsulot o'chirildi", saved: false };
  }

  // Toggle - saqlash yoki o'chirish
  async toggleSave(userNumber: string, productId: string) {
    const existing = await this.prisma.savedProduct.findUnique({
      where: {
        number_productId: {
          number: userNumber,
          productId,
        },
      },
    });

    if (existing) {
      await this.prisma.savedProduct.delete({
        where: { id: existing.id },
      });
      return { saved: false, message: "Mahsulot o'chirildi" };
    } else {
      // Mahsulot mavjudligini tekshirish
      const product = await this.prisma.product.findUnique({
        where: { productId },
      });

      if (!product) {
        throw new NotFoundException('Mahsulot topilmadi');
      }

      await this.prisma.savedProduct.create({
        data: {
          number: userNumber,
          productId,
        },
      });
      return { saved: true, message: 'Mahsulot saqlandi' };
    }
  }

  // Mahsulot saqlangan yoki yo'qligini tekshirish
  async checkSaved(userNumber: string, productId: string): Promise<{ saved: boolean }> {
    const existing = await this.prisma.savedProduct.findUnique({
      where: {
        number_productId: {
          number: userNumber,
          productId,
        },
      },
    });

    return { saved: !!existing };
  }

  // Bir nechta mahsulotlarni tekshirish (ProductCard list uchun)
  async checkMultipleSaved(
    userNumber: string,
    productIds: string[],
  ): Promise<{ savedIds: string[] }> {
    const saved = await this.prisma.savedProduct.findMany({
      where: {
        number: userNumber,
        productId: { in: productIds },
      },
      select: { productId: true },
    });

    return { savedIds: saved.map((s) => s.productId) };
  }
}
