import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Multer orqali rasmlarni saqlash konfiguratsiyasi
const storage = diskStorage({
  destination: (req, file, cb) => {
    // ProductPhoto/product_name/ papkasiga saqlash
    const productName = req.body.name?.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'unknown';
    const uploadPath = join('./ProductPhoto', productName);
    
    // Papka mavjud bo'lmasa yaratish
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Unique nom yaratish (timestamp + random)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// Helper function to parse translation data from form-data
function parseTranslationData(body: any) {
  const translationRu = body.nameRu ? {
    name: body.nameRu,
    ingredients: body.ingredientsRu || undefined,
    uses: body.usesRu || undefined,
    description: body.descriptionRu || undefined,
  } : undefined;

  const translationEn = body.nameEn ? {
    name: body.nameEn,
    ingredients: body.ingredientsEn || undefined,
    uses: body.usesEn || undefined,
    description: body.descriptionEn || undefined,
  } : undefined;

  return { translationRu, translationEn };
}

@Controller('admin/product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('photos', 5, { 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
  }))
  create(@UploadedFiles() files: Express.Multer.File[], @Body() body: any) {
    // Rasmlar yo'llarini massiv sifatida yaratish
    const photos: string[] = [];
    if (files && files.length > 0) {
      const productName = body.name?.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'unknown';
      files.forEach((file, index) => {
        photos.push(`/ProductPhoto/${productName}/${file.filename}`);
      });
    }
    
    const { translationRu, translationEn } = parseTranslationData(body);
    
    return this.productService.create({
      ...body,
      price: Number(body.price),
      amount: Number(body.amount),
      photos,
      translationRu,
      translationEn,
    });
  }

  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(+id);
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('photos', 5, { 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
  }))
  async update(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
  ) {
    const data = { ...body };
    
    // Mavjud rasmlarni olish
    let photos: string[] = [];
    
    // Eski rasmlarni saqlash (existingPhotos)
    if (body.existingPhotos) {
      try {
        const existing = JSON.parse(body.existingPhotos);
        if (Array.isArray(existing)) {
          photos = [...existing];
        }
      } catch (e) {
        // JSON parse xatosi
      }
    }
    
    // Yangi rasmlarni qo'shish
    if (files && files.length > 0) {
      const productName = body.name?.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'unknown';
      files.forEach(file => {
        photos.push(`/ProductPhoto/${productName}/${file.filename}`);
      });
    }
    
    // Faqat rasmlar o'zgargan bo'lsa yangilash
    if (photos.length > 0 || body.existingPhotos !== undefined) {
      data.photos = photos;
    }
    
    // existingPhotos ni data'dan olib tashlash
    delete data.existingPhotos;

    // Only parse numbers if they are present as strings in form-data
    if (data.price !== undefined) data.price = Number(data.price);
    if (data.amount !== undefined) data.amount = Number(data.amount);

    // Check if it's just a boolean update for isActive which might come as string or boolean
    if (data.isActive !== undefined) {
      data.isActive = String(data.isActive) === 'true';
    }

    // Parse translation data
    const { translationRu, translationEn } = parseTranslationData(body);
    data.translationRu = translationRu;
    data.translationEn = translationEn;

    // Remove individual translation fields from data
    delete data.nameRu;
    delete data.ingredientsRu;
    delete data.usesRu;
    delete data.descriptionRu;
    delete data.nameEn;
    delete data.ingredientsEn;
    delete data.usesEn;
    delete data.descriptionEn;

    return this.productService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productService.remove(+id);
  }
}
