
import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller("settings")
export class SettingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getSettings() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    return settings || { deliverySumm: 30000 };
  }
}

