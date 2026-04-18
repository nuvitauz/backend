import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Dashboard umumiy statistika
  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalUsers,
      todayUsers,
      totalOrders,
      totalRevenue,
      todayOrders,
      todayRevenue,
      weekOrders,
      weekRevenue,
      monthOrders,
      monthRevenue,
      newOrders,
      acceptedOrders,
      onTheWayOrders,
      deliveredOrders,
      cancelledOrders,
      totalProducts,
      activeProducts
    ] = await Promise.all([
      // Jami userlar
      this.prisma.user.count({ where: { role: 'USER' } }),
      // Bugun qo'shilgan userlar
      this.prisma.user.count({ where: { role: 'USER', createdAt: { gte: today } } }),
      // Jami buyurtmalar
      this.prisma.order.count(),
      // Jami daromad (faqat yetkazilgan)
      this.prisma.order.aggregate({
        where: { orderStatus: 'DELIVERED' },
        _sum: { summ: true }
      }),
      // Bugungi buyurtmalar
      this.prisma.order.count({
        where: { createdAt: { gte: today } }
      }),
      // Bugungi daromad
      this.prisma.order.aggregate({
        where: { 
          createdAt: { gte: today },
          orderStatus: 'DELIVERED'
        },
        _sum: { summ: true }
      }),
      // Haftalik buyurtmalar
      this.prisma.order.count({
        where: { createdAt: { gte: weekAgo } }
      }),
      // Haftalik daromad
      this.prisma.order.aggregate({
        where: { 
          createdAt: { gte: weekAgo },
          orderStatus: 'DELIVERED'
        },
        _sum: { summ: true }
      }),
      // Oylik buyurtmalar
      this.prisma.order.count({
        where: { createdAt: { gte: monthAgo } }
      }),
      // Oylik daromad
      this.prisma.order.aggregate({
        where: { 
          createdAt: { gte: monthAgo },
          orderStatus: 'DELIVERED'
        },
        _sum: { summ: true }
      }),
      // Yangi buyurtmalar (NEW)
      this.prisma.order.count({
        where: { orderStatus: 'NEW' }
      }),
      // Qabul qilingan buyurtmalar (ACCEPTED)
      this.prisma.order.count({
        where: { orderStatus: 'ACCEPTED' }
      }),
      // Yo'ldagi buyurtmalar (ON_THE_WAY)
      this.prisma.order.count({
        where: { orderStatus: 'ON_THE_WAY' }
      }),
      // Yetkazilgan buyurtmalar
      this.prisma.order.count({
        where: { orderStatus: 'DELIVERED' }
      }),
      // Bekor qilingan buyurtmalar
      this.prisma.order.count({
        where: { orderStatus: 'CANCELLED' }
      }),
      // Jami mahsulotlar
      this.prisma.product.count(),
      // Faol mahsulotlar
      this.prisma.product.count({ where: { isActive: true } })
    ]);

    return {
      users: {
        total: totalUsers,
        today: todayUsers
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        week: weekOrders,
        month: monthOrders,
        new: newOrders,
        accepted: acceptedOrders,
        onTheWay: onTheWayOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders
      },
      revenue: {
        total: totalRevenue._sum.summ || 0,
        today: todayRevenue._sum.summ || 0,
        week: weekRevenue._sum.summ || 0,
        month: monthRevenue._sum.summ || 0
      },
      products: {
        total: totalProducts,
        active: activeProducts
      }
    };
  }

  // Kunlik sotuvlar (oxirgi 30 kun)
  async getDailySales(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate },
        orderStatus: { not: 'CANCELLED' }
      },
      select: {
        createdAt: true,
        summ: true,
        count: true
      }
    });

    // Kunlar bo'yicha guruhlash
    const dailyData: { [key: string]: { date: string; orders: number; revenue: number; items: number } } = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { date: dateKey, orders: 0, revenue: 0, items: 0 };
    }

    orders.forEach(order => {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].orders++;
        dailyData[dateKey].revenue += order.summ;
        dailyData[dateKey].items += order.count;
      }
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Haftalik sotuvlar (oxirgi 12 hafta)
  async getWeeklySales(weeks: number = 12) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));
    startDate.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate },
        orderStatus: { not: 'CANCELLED' }
      },
      select: {
        createdAt: true,
        summ: true,
        count: true
      }
    });

    // Hafta bo'yicha guruhlash
    const weeklyData: { [key: string]: { week: string; orders: number; revenue: number; items: number } } = {};

    orders.forEach(order => {
      const date = order.createdAt;
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { week: weekKey, orders: 0, revenue: 0, items: 0 };
      }
      weeklyData[weekKey].orders++;
      weeklyData[weekKey].revenue += order.summ;
      weeklyData[weekKey].items += order.count;
    });

    return Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week));
  }

  // Oylik sotuvlar (oxirgi 12 oy)
  async getMonthlySales(months: number = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate },
        orderStatus: { not: 'CANCELLED' }
      },
      select: {
        createdAt: true,
        summ: true,
        count: true
      }
    });

    // Oy bo'yicha guruhlash
    const monthlyData: { [key: string]: { month: string; orders: number; revenue: number; items: number } } = {};

    const monthNames = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

    orders.forEach(order => {
      const date = order.createdAt;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthLabel, orders: 0, revenue: 0, items: 0 };
      }
      monthlyData[monthKey].orders++;
      monthlyData[monthKey].revenue += order.summ;
      monthlyData[monthKey].items += order.count;
    });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }

  // Eng ko'p sotilgan mahsulotlar
  async getTopProducts(limit: number = 10) {
    const orders = await this.prisma.order.findMany({
      where: {
        orderStatus: { not: 'CANCELLED' }
      },
      select: {
        productItems: true
      }
    });

    const productStats: { [key: string]: { productId: string; name: string; count: number; revenue: number; photoUrl: string | null } } = {};

    orders.forEach(order => {
      const items = order.productItems as any[];
      items.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            productId: item.productId,
            name: item.name,
            count: 0,
            revenue: 0,
            photoUrl: item.photos?.[0] || item.photoUrl || null
          };
        }
        productStats[item.productId].count += item.count;
        productStats[item.productId].revenue += item.price * item.count;
      });
    });

    return Object.values(productStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // Buyurtma statuslari taqsimoti
  async getOrderStatusDistribution() {
    const statuses = await this.prisma.order.groupBy({
      by: ['orderStatus'],
      _count: true
    });

    const statusLabels: { [key: string]: string } = {
      'NEW': 'Yangi',
      'ACCEPTED': 'Qabul qilindi',
      'ON_THE_WAY': "Yo'lda",
      'DELIVERED': 'Yetkazildi',
      'CANCELLED': 'Bekor qilindi'
    };

    return statuses.map(s => ({
      status: s.orderStatus,
      label: statusLabels[s.orderStatus] || s.orderStatus,
      count: s._count
    }));
  }

  // To'lov turlari taqsimoti
  async getPaymentTypeDistribution() {
    const types = await this.prisma.order.groupBy({
      by: ['paymentType'],
      _count: true,
      _sum: { summ: true }
    });

    const typeLabels: { [key: string]: string } = {
      'CASH': 'Naqd',
      'CLICK': 'Click',
      'PAYME': 'Payme'
    };

    return types.map(t => ({
      type: t.paymentType,
      label: typeLabels[t.paymentType] || t.paymentType,
      count: t._count,
      revenue: t._sum.summ || 0
    }));
  }

  // Kategoriyalar bo'yicha sotuvlar
  async getCategorySales() {
    const orders = await this.prisma.order.findMany({
      where: {
        orderStatus: { not: 'CANCELLED' }
      },
      select: {
        productItems: true
      }
    });

    // Avval mahsulotlarni olib, kategoriyalarini topamiz
    const products = await this.prisma.product.findMany({
      select: {
        productId: true,
        category: true
      }
    });

    const productCategoryMap: { [key: string]: string } = {};
    products.forEach(p => {
      productCategoryMap[p.productId] = p.category;
    });

    const categoryStats: { [key: string]: { category: string; count: number; revenue: number } } = {};

    orders.forEach(order => {
      const items = order.productItems as any[];
      items.forEach(item => {
        const category = productCategoryMap[item.productId] || 'Boshqa';
        if (!categoryStats[category]) {
          categoryStats[category] = { category, count: 0, revenue: 0 };
        }
        categoryStats[category].count += item.count;
        categoryStats[category].revenue += item.price * item.count;
      });
    });

    return Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);
  }

  // Kunlik faollik (soatlar bo'yicha)
  async getHourlyActivity() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: today }
      },
      select: {
        createdAt: true
      }
    });

    const hourlyData: { hour: number; orders: number }[] = [];
    for (let i = 0; i < 24; i++) {
      hourlyData.push({ hour: i, orders: 0 });
    }

    orders.forEach(order => {
      const hour = order.createdAt.getHours();
      hourlyData[hour].orders++;
    });

    return hourlyData;
  }

  // Yangi foydalanuvchilar statistikasi (oxirgi 30 kun)
  async getNewUsersStats(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const users = await this.prisma.user.findMany({
      where: {
        createdAt: { gte: startDate },
        role: 'USER'
      },
      select: {
        createdAt: true
      }
    });

    const dailyData: { [key: string]: { date: string; users: number } } = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { date: dateKey, users: 0 };
    }

    users.forEach(user => {
      const dateKey = user.createdAt.toISOString().split('T')[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].users++;
      }
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Dostavka statistikasi
  async getDeliveryStats() {
    const orders = await this.prisma.order.findMany({
      where: {
        orderStatus: 'DELIVERED'
      },
      select: {
        createdAt: true,
        deliverySumm: true
      }
    });

    const totalDeliveries = orders.length;
    const totalDeliveryRevenue = orders.reduce((sum, o) => sum + o.deliverySumm, 0);

    // Oxirgi 7 kun
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekDeliveries = orders.filter(o => o.createdAt >= weekAgo).length;

    // Oxirgi 30 kun
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthDeliveries = orders.filter(o => o.createdAt >= monthAgo).length;

    return {
      total: totalDeliveries,
      week: weekDeliveries,
      month: monthDeliveries,
      deliveryRevenue: totalDeliveryRevenue
    };
  }

  // O'rtacha buyurtma qiymati
  async getAverageOrderValue() {
    const result = await this.prisma.order.aggregate({
      where: {
        orderStatus: { not: 'CANCELLED' }
      },
      _avg: { summ: true },
      _min: { summ: true },
      _max: { summ: true }
    });

    return {
      average: Math.round(result._avg.summ || 0),
      min: result._min.summ || 0,
      max: result._max.summ || 0
    };
  }

  // To'langan buyurtmalar bo'yicha mahsulotlar analitikasi
  async getProductSalesAnalytics(period: 'day' | 'week' | 'month' | 'all' = 'all') {
    // Vaqt oralig'ini aniqlash
    let startDate: Date | null = null;
    const now = new Date();
    
    if (period === 'day') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    }

    // Faqat PAID buyurtmalarni olish
    const whereClause: any = {
      paymentStatus: 'PAID'
    };
    
    if (startDate) {
      whereClause.createdAt = { gte: startDate };
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      select: {
        productItems: true,
        summ: true,
        count: true,
        createdAt: true
      }
    });

    // Barcha mahsulotlarni olish (rasm uchun)
    const products = await this.prisma.product.findMany({
      select: {
        productId: true,
        name: true,
        photos: true,
        price: true,
        category: true
      }
    });

    const productMap: { [key: string]: { name: string; photoUrl: string | null; price: number; category: string } } = {};
    products.forEach(p => {
      productMap[p.productId] = {
        name: p.name,
        photoUrl: p.photos?.[0] || null,
        price: p.price,
        category: p.category
      };
    });

    // Mahsulotlar bo'yicha statistika
    const productStats: { [key: string]: { 
      productId: string; 
      name: string; 
      photoUrl: string | null; 
      count: number; 
      revenue: number;
      category: string;
    } } = {};

    // Jami statistika
    let totalOrders = orders.length;
    let totalItems = 0;
    let totalRevenue = 0;

    // Kunlik statistika (oxirgi 7 kun uchun)
    const dailyStats: { [key: string]: { date: string; orders: number; items: number; revenue: number } } = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyStats[dateKey] = { date: dateKey, orders: 0, items: 0, revenue: 0 };
    }

    orders.forEach(order => {
      const items = order.productItems as any[];
      totalRevenue += order.summ;
      
      // Kunlik statistikaga qo'shish
      const dateKey = order.createdAt.toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].orders++;
        dailyStats[dateKey].revenue += order.summ;
      }

      items.forEach(item => {
        totalItems += item.count;
        
        if (dailyStats[dateKey]) {
          dailyStats[dateKey].items += item.count;
        }

        const productInfo = productMap[item.productId];
        
        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            productId: item.productId,
            name: productInfo?.name || item.name || 'Noma\'lum',
            photoUrl: productInfo?.photoUrl || item.photos?.[0] || item.photoUrl || null,
            count: 0,
            revenue: 0,
            category: productInfo?.category || 'Boshqa'
          };
        }
        productStats[item.productId].count += item.count;
        productStats[item.productId].revenue += item.price * item.count;
      });
    });

    // Mahsulotlarni ko'p sotilganidan kamiga tartiblash
    const sortedProducts = Object.values(productStats).sort((a, b) => b.count - a.count);

    // Kunlik statistikani tartiblash (eskidan yangiga)
    const sortedDaily = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));

    return {
      summary: {
        totalOrders,
        totalItems,
        totalRevenue,
        period
      },
      products: sortedProducts,
      daily: sortedDaily
    };
  }
}
