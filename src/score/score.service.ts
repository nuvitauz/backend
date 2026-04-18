import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScoreDto } from './dto/create-score.dto';

@Injectable()
export class ScoreService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateScoreDto) {
    // Validate grade
    if (data.grade < 0 || data.grade > 5) {
      throw new BadRequestException('Grade must be between 0 and 5');
    }

    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { productId: data.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if user already reviewed this product
    const existingScore = await this.prisma.productScore.findFirst({
      where: {
        productId: data.productId,
        number: data.number,
      },
    });

    if (existingScore) {
      // Update existing review
      return this.prisma.productScore.update({
        where: { id: existingScore.id },
        data: {
          fullName: data.fullName,
          comment: data.comment,
          grade: data.grade,
        },
      });
    }

    // Create new review
    return this.prisma.productScore.create({
      data: {
        productId: data.productId,
        number: data.number,
        fullName: data.fullName,
        comment: data.comment,
        grade: data.grade,
      },
    });
  }

  async findByProductId(productId: string) {
    const scores = await this.prisma.productScore.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    return scores;
  }

  async getProductRating(productId: string) {
    const scores = await this.prisma.productScore.findMany({
      where: { productId },
      select: { grade: true },
    });

    if (scores.length === 0) {
      return { average: 0, count: 0 };
    }

    const total = scores.reduce((sum, score) => sum + score.grade, 0);
    const average = total / scores.length;

    return {
      average: Math.round(average * 10) / 10, // Round to 1 decimal
      count: scores.length,
    };
  }

  async getProductWithRating(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { productId },
      include: {
        scores: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const rating = await this.getProductRating(productId);

    return {
      ...product,
      rating: rating.average,
      reviewCount: rating.count,
    };
  }

  async delete(id: number, userNumber: string) {
    const score = await this.prisma.productScore.findUnique({
      where: { id },
    });

    if (!score) {
      throw new NotFoundException('Review not found');
    }

    if (score.number !== userNumber) {
      throw new BadRequestException('You can only delete your own reviews');
    }

    return this.prisma.productScore.delete({
      where: { id },
    });
  }
}
