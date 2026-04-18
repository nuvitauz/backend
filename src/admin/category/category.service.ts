import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Lang } from '../../../generated/prisma';

interface CategoryTranslationInput {
  name: string;
  description?: string;
}

interface CreateCategoryDto {
  name: string;
  description?: string;
  translations?: {
    ru?: CategoryTranslationInput;
    en?: CategoryTranslationInput;
  };
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  translations?: {
    ru?: CategoryTranslationInput;
    en?: CategoryTranslationInput;
  };
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictException('Bu nomdagi kategoriya allaqachon mavjud');
    }

    const translationsData: { lang: Lang; name: string; description?: string }[] = [];
    
    if (data.translations?.ru?.name) {
      translationsData.push({
        lang: Lang.RU,
        name: data.translations.ru.name,
        description: data.translations.ru.description,
      });
    }
    
    if (data.translations?.en?.name) {
      translationsData.push({
        lang: Lang.EN,
        name: data.translations.en.name,
        description: data.translations.en.description,
      });
    }

    return this.prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        isActive: true,
        translations: translationsData.length > 0 ? {
          createMany: {
            data: translationsData,
          },
        } : undefined,
      },
      include: {
        translations: true,
      },
    });
  }

  async findAll(lang?: Lang) {
    const categories = await this.prisma.category.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        translations: true,
      },
    });

    // Agar til berilgan bo'lsa va UZ emas bo'lsa, tarjimani qaytarish
    if (lang && lang !== Lang.UZ) {
      return categories.map(cat => {
        const translation = cat.translations.find(t => t.lang === lang);
        return {
          ...cat,
          name: translation?.name || cat.name,
          description: translation?.description || cat.description,
        };
      });
    }

    return categories;
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        translations: true,
      },
    });
    if (!category) throw new NotFoundException('Kategoriya topilmadi');
    return category;
  }

  async update(id: number, data: UpdateCategoryDto) {
    await this.findOne(id);
    
    if (data.name) {
      const existing = await this.prisma.category.findFirst({
        where: { name: data.name, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('Bu nomdagi kategoriya allaqachon mavjud');
      }
    }

    // Tarjimalarni yangilash
    if (data.translations) {
      for (const lang of [Lang.RU, Lang.EN] as const) {
        const langKey = lang.toLowerCase() as 'ru' | 'en';
        const translationData = data.translations[langKey];
        
        if (translationData?.name) {
          await this.prisma.categoryTranslation.upsert({
            where: {
              categoryId_lang: { categoryId: id, lang },
            },
            create: {
              categoryId: id,
              lang,
              name: translationData.name,
              description: translationData.description,
            },
            update: {
              name: translationData.name,
              description: translationData.description,
            },
          });
        }
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
      },
      include: {
        translations: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
