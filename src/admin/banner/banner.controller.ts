import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { BannerService } from './banner.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Tavsiya etilgan o'lcham
const RECOMMENDED_WIDTH = 2458;
const RECOMMENDED_HEIGHT = 1024;

// Multer konfiguratsiyasi
const storage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './BannerPhoto';
    
    // Papka mavjud bo'lmasa yaratish
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Unique nom yaratish (timestamp + random)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

// Fayl filteri - faqat rasmlar
const imageFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Faqat JPG, PNG yoki WebP formatdagi rasmlar qabul qilinadi'), false);
  }
};

@Controller('admin/banner')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  // Barcha bannerlarni olish (admin uchun)
  @Get()
  findAll() {
    return this.bannerService.findAll();
  }

  // Faqat faol bannerlarni olish (frontend uchun)
  @Get('active')
  findActive() {
    return this.bannerService.findActive();
  }

  // Bitta bannerni olish
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bannerService.findOne(id);
  }

  // Yangi banner qo'shish
  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; link?: string },
  ) {
    if (!file) {
      throw new BadRequestException('Banner rasmi majburiy');
    }

    const imagePath = `/BannerPhoto/${file.filename}`;
    
    return this.bannerService.create({
      image: imagePath,
      title: body.title,
      link: body.link,
    });
  }

  // Banner ma'lumotlarini yangilash
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; link?: string; isActive?: boolean },
  ) {
    // isActive string bo'lsa boolean ga o'girish
    if (body.isActive !== undefined) {
      body.isActive = String(body.isActive) === 'true';
    }
    return this.bannerService.update(id, body);
  }

  // Banner rasmini almashtirish
  @Patch(':id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async updateImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Yangi rasm majburiy');
    }

    const imagePath = `/BannerPhoto/${file.filename}`;
    return this.bannerService.updateImage(id, imagePath);
  }

  // Bannerni o'chirish
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.bannerService.remove(id);
  }

  // Bannerlar tartibini yangilash
  @Post('reorder')
  reorder(@Body() body: { orderedIds: number[] }) {
    if (!body.orderedIds || !Array.isArray(body.orderedIds)) {
      throw new BadRequestException('orderedIds massivi majburiy');
    }
    return this.bannerService.reorder(body.orderedIds);
  }

  // Tavsiya etilgan o'lchamni olish (frontend uchun)
  @Get('config/recommended-size')
  getRecommendedSize() {
    return {
      width: RECOMMENDED_WIDTH,
      height: RECOMMENDED_HEIGHT,
      aspectRatio: `${RECOMMENDED_WIDTH}:${RECOMMENDED_HEIGHT}`,
      message: `Tavsiya etilgan o'lcham: ${RECOMMENDED_WIDTH}x${RECOMMENDED_HEIGHT} piksel`,
    };
  }
}
