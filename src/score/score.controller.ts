import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ScoreService } from './score.service';
import { CreateScoreDto } from './dto/create-score.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('score')
export class ScoreController {
  constructor(private readonly scoreService: ScoreService) {}

  // Create or update a review (requires auth)
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createScoreDto: CreateScoreDto, @Request() req: any) {
    // Use user's number and fullName from JWT token
    const data = {
      ...createScoreDto,
      number: req.user.number,
      fullName: req.user.fullName || req.user.number,
    };
    return this.scoreService.create(data);
  }

  // Get all reviews for a product (public)
  @Get('product/:productId')
  async findByProductId(@Param('productId') productId: string) {
    return this.scoreService.findByProductId(productId);
  }

  // Get product rating (public)
  @Get('rating/:productId')
  async getProductRating(@Param('productId') productId: string) {
    return this.scoreService.getProductRating(productId);
  }

  // Get product with all info including reviews and rating (public)
  @Get('product-detail/:productId')
  async getProductWithRating(@Param('productId') productId: string) {
    return this.scoreService.getProductWithRating(productId);
  }

  // Delete own review (requires auth)
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.scoreService.delete(parseInt(id), req.user.number);
  }
}
