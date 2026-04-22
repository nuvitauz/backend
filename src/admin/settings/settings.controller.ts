import { Body, Controller, Get, Post } from "@nestjs/common";
import { SettingsService } from "./settings.service";

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("admin/settings")
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Post("admin/settings")
  updateSettings(
    @Body()
    body: {
      deliverySumm?: number;
      maintenanceMode?: boolean;
      maintenanceMessage?: string | null;
    },
  ) {
    return this.settingsService.updateSettings(body);
  }

  // Public endpoint — barcha foydalanuvchilar tekshirib turishi uchun
  @Get("public/maintenance")
  getMaintenance() {
    return this.settingsService.getPublicStatus();
  }
}
