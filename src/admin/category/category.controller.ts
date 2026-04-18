import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { Lang } from '../../../generated/prisma';

interface TranslationInput {
  name: string;
  description?: string;
}

interface CreateCategoryDto {
  name: string;
  description?: string;
  translations?: {
    ru?: TranslationInput;
    en?: TranslationInput;
  };
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  translations?: {
    ru?: TranslationInput;
    en?: TranslationInput;
  };
}

@Controller('admin/category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  findAll(@Query('lang') lang?: Lang) {
    return this.categoryService.findAll(lang);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(+id);
  }
}
