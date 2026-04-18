import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(createStaffDto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({
      where: { number: createStaffDto.number }
    });

    if (existing) {
      // User mavjud bo'lsa uni roliga tegishli o'zgarishlarni kiritib qo'yamiz
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role: createStaffDto.role,
          fullName: createStaffDto.fullName,
        },
      });
    }

    const staff = await this.prisma.user.create({
      data: {
        number: createStaffDto.number,
        fullName: createStaffDto.fullName,
        role: createStaffDto.role,
        profileComplete: true
      }
    });

    return staff;
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'COURIER']
        }
      },
      select: {
        id: true,
        number: true,
        fullName: true,
        role: true,
        createdAt: true
      }
    });
  }
}
