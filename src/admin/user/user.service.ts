import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminUserService {
  constructor(private prisma: PrismaService) {}

  // Oxirgi 10 userni olish
  async findRecent(limit: number = 10) {
    return this.prisma.user.findMany({
      where: {
        role: 'USER'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      select: {
        id: true,
        number: true,
        fullName: true,
        username: true,
        email: true,
        createdAt: true,
        profileComplete: true,
      }
    });
  }

  // Barcha userlarni olish (pagination bilan)
  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: 'USER'
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit,
        select: {
          id: true,
          number: true,
          fullName: true,
          username: true,
          email: true,
          createdAt: true,
          profileComplete: true,
        }
      }),
      this.prisma.user.count({
        where: {
          role: 'USER'
        }
      })
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Bitta userni to'liq ma'lumotlari bilan olish
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        userId: true,
        username: true,
        fullName: true,
        email: true,
        address: true,
        dateOfBirth: true,
        gender: true,
        lang: true,
        profileComplete: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 5,
          select: {
            id: true,
            orderId: true,
            summ: true,
            orderStatus: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    return user;
  }

  // Jami userlar soni
  async getCount() {
    return this.prisma.user.count({
      where: {
        role: 'USER'
      }
    });
  }
}
