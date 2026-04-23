import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const ALLOWED_STATUSES = ['ACTIVE', 'NOCASH', 'BANNED'] as const;
type UserStatusValue = (typeof ALLOWED_STATUSES)[number];

@Injectable()
export class AdminUserService {
  constructor(private prisma: PrismaService) {}

  // Oxirgi N userni olish
  async findRecent(limit: number = 10) {
    return this.prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        number: true,
        fullName: true,
        username: true,
        email: true,
        createdAt: true,
        profileComplete: true,
        status: true,
      },
    });
  }

  // Barcha userlarni olish (pagination bilan)
  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'USER' },
        orderBy: { createdAt: 'desc' },
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
          status: true,
        },
      }),
      this.prisma.user.count({ where: { role: 'USER' } }),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Bitta userni to'liq ma'lumotlari bilan olish (profile + umumiy hisoblagichlar)
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
        status: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderId: true,
            summ: true,
            orderStatus: true,
            createdAt: true,
          },
        },
        _count: {
          select: { orders: true, savedProducts: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    return user;
  }

  // Userning barcha buyurtmalari (productItems bilan)
  async getUserOrders(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, number: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const orders = await this.prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        fullName: true,
        contactNumber: true,
        address: true,
        comment: true,
        count: true,
        summ: true,
        deliverySumm: true,
        productItems: true,
        paymentType: true,
        paymentStatus: true,
        orderStatus: true,
        grade: true,
        createdAt: true,
      },
    });

    return orders;
  }

  // Userning savati
  async getUserCart(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { number: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (!user.number) return { id: null, count: 0, summ: 0, items: [] };

    const cart = await this.prisma.cart.findUnique({
      where: { number: user.number },
      include: {
        items: {
          include: {
            product: {
              select: {
                productId: true,
                name: true,
                price: true,
                photos: true,
                category: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      return { id: null, count: 0, summ: 0, items: [] };
    }

    return cart;
  }

  // Userning saqlangan mahsulotlari
  async getUserSavedProducts(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { number: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (!user.number) return [];

    return this.prisma.savedProduct.findMany({
      where: { number: user.number },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            productId: true,
            name: true,
            price: true,
            photos: true,
            category: true,
            isActive: true,
          },
        },
      },
    });
  }

  // Userning NuvitaAI chat sessiyalari
  async getUserChatSessions(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, number: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    // Build an exact-match OR list. IMPORTANT: never include a `{ number: null }`
    // clause — that would match every orphan/guest session in the DB.
    const or: { userId?: number; number?: string }[] = [{ userId: id }];
    if (user.number) or.push({ number: user.number });

    const sessions = await this.prisma.chatSession.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });

    return sessions;
  }

  // Bitta sessiya ichidagi xabarlar (faqat shu foydalanuvchining raqam/sessiya ID si)
  async getChatSessionMessages(userId: number, sessionDbId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { number: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    const or: { userId?: number; number?: string }[] = [{ userId }];
    if (user.number) or.push({ number: user.number });

    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionDbId,
        OR: or,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException('Sessiya topilmadi yoki bu mijozga tegishli emas');
    }
    return session;
  }

  // Jami userlar soni
  async getCount() {
    return this.prisma.user.count({ where: { role: 'USER' } });
  }

  // Foydalanuvchi statusini yangilash
  async updateStatus(id: number, status: string) {
    const normalized = String(status || '').toUpperCase() as UserStatusValue;
    if (!ALLOWED_STATUSES.includes(normalized)) {
      throw new BadRequestException(
        `Noto'g'ri status. Ruxsat etilganlar: ${ALLOWED_STATUSES.join(', ')}`,
      );
    }

    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!exists) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (exists.role === 'ADMIN') {
      throw new BadRequestException('Admin statusini o\'zgartirib bo\'lmaydi');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: normalized },
      select: {
        id: true,
        number: true,
        fullName: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
