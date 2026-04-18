import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      },
    });

    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  async updateProfile(userId: number, data: any) {
    if (data.dateOfBirth) {
      data.dateOfBirth = new Date(data.dateOfBirth);
    }
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
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
      },
    });
    return updatedUser;
  }
}
