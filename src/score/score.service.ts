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

    // Har bir user istagancha izoh qoldirishi mumkin — har doim yangi yozuv yaratamiz
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

    if (scores.length === 0) return [];

    // Tegishli userlarning hozirgi fullName'ini olib (users jadvalidan)
    // har bir izohga moslab qaytaramiz — user ismini o'zgartirgan bo'lsa yangisi ko'rinadi
    const numbers = Array.from(new Set(scores.map((s) => s.number)));
    const users = await this.prisma.user.findMany({
      where: { number: { in: numbers } },
      select: { number: true, fullName: true },
    });
    const nameMap = new Map(users.map((u) => [u.number, u.fullName]));

    return scores.map((s) => ({
      ...s,
      fullName: nameMap.get(s.number) || s.fullName,
    }));
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

  async getAllRatings(): Promise<
    Record<string, { average: number; count: number }>
  > {
    const scores = await this.prisma.productScore.findMany({
      select: { productId: true, grade: true },
    });

    const map: Record<string, { sum: number; count: number }> = {};
    for (const s of scores) {
      if (!map[s.productId]) map[s.productId] = { sum: 0, count: 0 };
      map[s.productId].sum += s.grade;
      map[s.productId].count += 1;
    }

    const result: Record<string, { average: number; count: number }> = {};
    for (const [pid, { sum, count }] of Object.entries(map)) {
      result[pid] = {
        average: Math.round((sum / count) * 10) / 10,
        count,
      };
    }
    return result;
  }

  async getProductWithRating(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [scores, rating] = await Promise.all([
      this.findByProductId(productId),
      this.getProductRating(productId),
    ]);

    return {
      ...product,
      scores,
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
