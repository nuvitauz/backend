import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { Lang } from '../../../generated/prisma';

interface TranslationData {
  name: string;
  ingredients?: string;
  uses?: string;
  description?: string;
}

interface CreateProductData {
  photos?: string[];
  category: string;
  name: string;
  ingredients?: string;
  uses?: string;
  description?: string;
  price: number;
  amount?: number;
  translationRu?: TranslationData;
  translationEn?: TranslationData;
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProductData) {
    const generatedProductId = randomUUID();

    const translations: { lang: Lang; name: string; ingredients?: string; uses?: string; description?: string }[] = [];

    if (data.translationRu?.name) {
      translations.push({
        lang: 'RU' as Lang,
        name: data.translationRu.name,
        ingredients: data.translationRu.ingredients,
        uses: data.translationRu.uses,
        description: data.translationRu.description,
      });
    }

    if (data.translationEn?.name) {
      translations.push({
        lang: 'EN' as Lang,
        name: data.translationEn.name,
        ingredients: data.translationEn.ingredients,
        uses: data.translationEn.uses,
        description: data.translationEn.description,
      });
    }

    return this.prisma.product.create({
      data: {
        productId: generatedProductId,
        photos: data.photos || [],
        category: data.category,
        name: data.name,
        ingredients: data.ingredients,
        uses: data.uses,
        description: data.description,
        price: data.price,
        amount: data.amount || 0,
        isActive: true,
        translations: translations.length > 0 ? {
          createMany: { data: translations }
        } : undefined,
      },
      include: { translations: true },
    });
  }

  async findAll() {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        categoryRel: true,
        translations: true,
      },
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!product) throw new NotFoundException('Mahsulot topilmadi');
    return product;
  }

  async update(id: number, data: any) {
    await this.findOne(id);

    const { translationRu, translationEn, ...productData } = data;

    // Mahsulotni yangilash
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: productData,
    });

    // RU tarjimani yangilash yoki yaratish
    if (translationRu?.name !== undefined) {
      await this.prisma.productTranslation.upsert({
        where: { productId_lang: { productId: id, lang: 'RU' } },
        update: {
          name: translationRu.name,
          ingredients: translationRu.ingredients,
          uses: translationRu.uses,
          description: translationRu.description,
        },
        create: {
          productId: id,
          lang: 'RU',
          name: translationRu.name,
          ingredients: translationRu.ingredients,
          uses: translationRu.uses,
          description: translationRu.description,
        },
      });
    }

    // EN tarjimani yangilash yoki yaratish
    if (translationEn?.name !== undefined) {
      await this.prisma.productTranslation.upsert({
        where: { productId_lang: { productId: id, lang: 'EN' } },
        update: {
          name: translationEn.name,
          ingredients: translationEn.ingredients,
          uses: translationEn.uses,
          description: translationEn.description,
        },
        create: {
          productId: id,
          lang: 'EN',
          name: translationEn.name,
          ingredients: translationEn.ingredients,
          uses: translationEn.uses,
          description: translationEn.description,
        },
      });
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
