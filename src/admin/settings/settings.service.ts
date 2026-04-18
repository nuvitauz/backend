
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await this.prisma.settings.create({ data: { id: 1, deliverySumm: 30000 } });
    }
    return settings;
  }

  async updateSettings(deliverySumm: number) {
    return this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, deliverySumm: Number(deliverySumm) },
      update: { deliverySumm: Number(deliverySumm) },
    });
  }
}

