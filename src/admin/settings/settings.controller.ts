
import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";

@Controller("admin/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Post()
  updateSettings(@Body("deliverySumm") deliverySumm: number) {
    return this.settingsService.updateSettings(deliverySumm);
  }
}

