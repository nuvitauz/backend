import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const MAX_BANNERS = 5;
const MIN_BANNERS = 0; // o'chirish uchun minimum

@Injectable()
export class BannerService {
  constructor(private prisma: PrismaService) {}

  // Barcha bannerlarni olish (tartib bo'yicha)
  async findAll() {
    return this.prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });
  }

  // Faqat faol bannerlarni olish (frontend uchun)
  async findActive() {
    return this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  // Bitta bannerni olish
  async findOne(id: number) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
    });
    
    if (!banner) {
      throw new NotFoundException(`Banner #${id} topilmadi`);
    }
    
    return banner;
  }

  // Yangi banner yaratish
  async create(data: { image: string; title?: string; link?: string }) {
    // Bannerlar sonini tekshirish
    const count = await this.prisma.banner.count();
    if (count >= MAX_BANNERS) {
      throw new BadRequestException(`Maksimum ${MAX_BANNERS} ta banner qo'shish mumkin`);
    }

    // Tartib raqamini avtomatik belgilash
    const lastBanner = await this.prisma.banner.findFirst({
      orderBy: { order: 'desc' },
    });
    const nextOrder = lastBanner ? lastBanner.order + 1 : 0;

    return this.prisma.banner.create({
      data: {
        ...data,
        order: nextOrder,
      },
    });
  }

  // Bannerni yangilash
  async update(id: number, data: { title?: string; link?: string; isActive?: boolean }) {
    await this.findOne(id); // Mavjudligini tekshirish
    
    return this.prisma.banner.update({
      where: { id },
      data,
    });
  }

  // Banner rasmini almashtirish
  async updateImage(id: number, newImage: string) {
    const banner = await this.findOne(id);
    
    // Eski rasmni o'chirish
    this.deleteImageFile(banner.image);
    
    return this.prisma.banner.update({
      where: { id },
      data: { image: newImage },
    });
  }

  // Bannerni o'chirish
  async remove(id: number) {
    const banner = await this.findOne(id);
    
    // Rasmni o'chirish
    this.deleteImageFile(banner.image);
    
    // Bannerni o'chirish
    await this.prisma.banner.delete({
      where: { id },
    });

    // Tartib raqamlarini qayta hisoblash
    await this.reorderBanners();
    
    return { message: 'Banner muvaffaqiyatli o\'chirildi' };
  }

  // Bannerlar tartibini yangilash
  async reorder(orderedIds: number[]) {
    const updates = orderedIds.map((id, index) => 
      this.prisma.banner.update({
        where: { id },
        data: { order: index },
      })
    );
    
    await this.prisma.$transaction(updates);
    return this.findAll();
  }

  // Yordamchi: Tartibni qayta hisoblash
  private async reorderBanners() {
    const banners = await this.prisma.banner.findMany({
      orderBy: { order: 'asc' },
    });
    
    const updates = banners.map((banner, index) =>
      this.prisma.banner.update({
        where: { id: banner.id },
        data: { order: index },
      })
    );
    
    await this.prisma.$transaction(updates);
  }

  // Yordamchi: Rasm faylini o'chirish
  private deleteImageFile(imagePath: string) {
    if (!imagePath) return;
    
    // /BannerPhoto/filename.jpg -> ./BannerPhoto/filename.jpg
    const relativePath = imagePath.startsWith('/') ? '.' + imagePath : imagePath;
    const fullPath = join(process.cwd(), relativePath);
    
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch (error) {
        console.error('Rasmni o\'chirishda xatolik:', error);
      }
    }
  }
}
