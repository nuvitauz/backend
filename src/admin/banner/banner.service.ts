import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const MAX_BANNERS = 5;
const DEFAULT_LINK = 'https://nuvita.uz/';

function normalizeLink(link?: string | null): string {
  const trimmed = (link || '').trim();
  if (!trimmed) return DEFAULT_LINK;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Agar faqat path yoki domen bo'lsa https:// qo'shamiz
  return `https://${trimmed}`;
}

@Injectable()
export class BannerService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async findActive() {
    return this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: number) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException(`Banner #${id} topilmadi`);
    }

    return banner;
  }

  async create(data: { image: string; link?: string }) {
    const count = await this.prisma.banner.count();
    if (count >= MAX_BANNERS) {
      throw new BadRequestException(
        `Maksimum ${MAX_BANNERS} ta banner qo'shish mumkin`,
      );
    }

    const lastBanner = await this.prisma.banner.findFirst({
      orderBy: { order: 'desc' },
    });
    const nextOrder = lastBanner ? lastBanner.order + 1 : 0;

    return this.prisma.banner.create({
      data: {
        image: data.image,
        link: normalizeLink(data.link),
        order: nextOrder,
      },
    });
  }

  async update(
    id: number,
    data: { link?: string; isActive?: boolean },
  ) {
    await this.findOne(id);

    const updateData: { link?: string; isActive?: boolean } = {};
    if (data.link !== undefined) {
      updateData.link = normalizeLink(data.link);
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    return this.prisma.banner.update({
      where: { id },
      data: updateData,
    });
  }

  async updateImage(id: number, newImage: string) {
    const banner = await this.findOne(id);

    this.deleteImageFile(banner.image);

    return this.prisma.banner.update({
      where: { id },
      data: { image: newImage },
    });
  }

  async remove(id: number) {
    const banner = await this.findOne(id);

    this.deleteImageFile(banner.image);

    await this.prisma.banner.delete({
      where: { id },
    });

    await this.reorderBanners();

    return { message: "Banner muvaffaqiyatli o'chirildi" };
  }

  async reorder(orderedIds: number[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.banner.update({
        where: { id },
        data: { order: index },
      }),
    );

    await this.prisma.$transaction(updates);
    return this.findAll();
  }

  private async reorderBanners() {
    const banners = await this.prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });

    const updates = banners.map((banner, index) =>
      this.prisma.banner.update({
        where: { id: banner.id },
        data: { order: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }

  private deleteImageFile(imagePath: string) {
    if (!imagePath) return;

    const relativePath = imagePath.startsWith('/')
      ? '.' + imagePath
      : imagePath;
    const fullPath = join(process.cwd(), relativePath);

    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch (error) {
        console.error("Rasmni o'chirishda xatolik:", error);
      }
    }
  }
}
