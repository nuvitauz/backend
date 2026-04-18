import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'ok' },
        database: { status: 'unknown' as string },
      },
    };

    // Database ulanishini tekshirish
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.services.database.status = 'ok';
    } catch (error) {
      health.services.database.status = 'error';
      health.status = 'degraded';
    }

    return health;
  }
}
