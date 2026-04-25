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
        role: true,
        profileComplete: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    return user;
  }

  async updateProfile(userId: number, data: any) {
    // Do not allow client to change sensitive fields via profile patch.
    const allowed: Record<string, any> = {};
    const allowKeys = [
      'fullName',
      'email',
      'address',
      'dateOfBirth',
      'gender',
      'lang',
      'profileComplete',
    ];
    for (const key of allowKeys) {
      if (data[key] !== undefined) allowed[key] = data[key];
    }

    if (allowed.dateOfBirth) {
      allowed.dateOfBirth = new Date(allowed.dateOfBirth);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: allowed,
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
        role: true,
        profileComplete: true,
        createdAt: true,
      },
    });

    return updatedUser;
  }
}
