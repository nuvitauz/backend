import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

interface UpdateSettingsPayload {
  deliverySumm?: number;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
}

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

  async updateSettings(payload: UpdateSettingsPayload) {
    const data: Record<string, unknown> = {};

    if (payload.deliverySumm !== undefined && payload.deliverySumm !== null) {
      data.deliverySumm = Number(payload.deliverySumm);
    }
    if (payload.maintenanceMode !== undefined) {
      data.maintenanceMode = Boolean(payload.maintenanceMode);
    }
    if (payload.maintenanceMessage !== undefined) {
      data.maintenanceMessage = payload.maintenanceMessage
        ? String(payload.maintenanceMessage)
        : null;
    }

    return this.prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        deliverySumm: (data.deliverySumm as number) ?? 30000,
        maintenanceMode: (data.maintenanceMode as boolean) ?? false,
        maintenanceMessage: (data.maintenanceMessage as string | null) ?? null,
      },
      update: data,
    });
  }

  async getPublicStatus() {
    const s = await this.getSettings();
    return {
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
    };
  }
}
