import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { Role } from '../../../generated/prisma';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(createStaffDto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({
      where: { number: createStaffDto.number },
    });

    if (existing) {
      if (existing.role === 'ADMIN' || existing.role === 'COURIER') {
        throw new BadRequestException(
          "Bu raqam allaqachon xodim sifatida ro'yxatdan o'tgan",
        );
      }
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role: createStaffDto.role,
          fullName: createStaffDto.fullName,
          profileComplete: true,
        },
        select: {
          id: true,
          number: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        number: createStaffDto.number,
        fullName: createStaffDto.fullName,
        role: createStaffDto.role,
        profileComplete: true,
      },
      select: {
        id: true,
        number: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'COURIER'],
        },
      },
      select: {
        id: true,
        number: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: number,
    data: { fullName?: string; role?: Role },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }
    if (user.role === 'USER') {
      throw new BadRequestException('Bu foydalanuvchi xodim emas');
    }

    const payload: { fullName?: string; role?: Role } = {};
    if (data.fullName !== undefined) payload.fullName = data.fullName;
    if (data.role !== undefined) {
      if (data.role !== 'ADMIN' && data.role !== 'COURIER') {
        throw new BadRequestException("Rol faqat ADMIN yoki COURIER bo'lishi mumkin");
      }
      payload.role = data.role;
    }

    return this.prisma.user.update({
      where: { id },
      data: payload,
      select: {
        id: true,
        number: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Xodim #${id} topilmadi`);
    }
    if (user.role === 'USER') {
      throw new BadRequestException('Bu foydalanuvchi xodim emas');
    }

    // Xodimdan olib tashlaymiz (oddiy foydalanuvchiga aylantiramiz),
    // ammo buyurtma/izoh tarixini saqlab qolamiz.
    await this.prisma.user.update({
      where: { id },
      data: { role: 'USER' },
    });

    return { message: "Xodim muvaffaqiyatli olib tashlandi" };
  }
}
