import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Dashboard umumiy statistika
  @Get('dashboard')
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  // Kunlik sotuvlar
  @Get('sales/daily')
  getDailySales(@Query('days') days?: string) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getDailySales(parsedDays);
  }

  // Haftalik sotuvlar
  @Get('sales/weekly')
  getWeeklySales(@Query('weeks') weeks?: string) {
    const parsedWeeks = weeks ? parseInt(weeks, 10) : 12;
    return this.analyticsService.getWeeklySales(parsedWeeks);
  }

  // Oylik sotuvlar
  @Get('sales/monthly')
  getMonthlySales(@Query('months') months?: string) {
    const parsedMonths = months ? parseInt(months, 10) : 12;
    return this.analyticsService.getMonthlySales(parsedMonths);
  }

  // Eng ko'p sotilgan mahsulotlar
  @Get('products/top')
  getTopProducts(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.analyticsService.getTopProducts(parsedLimit);
  }

  // Buyurtma statuslari taqsimoti
  @Get('orders/status')
  getOrderStatusDistribution() {
    return this.analyticsService.getOrderStatusDistribution();
  }

  // To'lov turlari taqsimoti
  @Get('orders/payment-types')
  getPaymentTypeDistribution() {
    return this.analyticsService.getPaymentTypeDistribution();
  }

  // Kategoriyalar bo'yicha sotuvlar
  @Get('categories/sales')
  getCategorySales() {
    return this.analyticsService.getCategorySales();
  }

  // Kunlik faollik (soatlar bo'yicha)
  @Get('activity/hourly')
  getHourlyActivity() {
    return this.analyticsService.getHourlyActivity();
  }

  // Yangi foydalanuvchilar statistikasi
  @Get('users/new')
  getNewUsersStats(@Query('days') days?: string) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getNewUsersStats(parsedDays);
  }

  // Dostavka statistikasi
  @Get('delivery')
  getDeliveryStats() {
    return this.analyticsService.getDeliveryStats();
  }

  // O'rtacha buyurtma qiymati
  @Get('orders/average')
  getAverageOrderValue() {
    return this.analyticsService.getAverageOrderValue();
  }

  // Mahsulotlar sotuvlari analitikasi (PAID buyurtmalar)
  @Get('products/sales')
  getProductSalesAnalytics(@Query('period') period?: string) {
    const validPeriods = ['day', 'week', 'month', 'all'];
    const parsedPeriod = validPeriods.includes(period || '') 
      ? (period as 'day' | 'week' | 'month' | 'all') 
      : 'all';
    return this.analyticsService.getProductSalesAnalytics(parsedPeriod);
  }
}
