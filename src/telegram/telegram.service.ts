import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

interface RegistrationToken {
  phone: string;
  telegramId: string;
  username: string;
  fullName: string;
  createdAt: number;
}

interface LinkToken {
  phone: string;
  userId: number;
  createdAt: number;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private readonly MINI_APP_URL: string;
  private readonly WEBSITE_URL = 'https://nuvita.uz';
  
  // Registration tokens storage (expires after 1 hour)
  private registrationTokens = new Map<string, RegistrationToken>();
  private readonly TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

  // Link tokens storage - for linking existing web users to Telegram
  private linkTokens = new Map<string, LinkToken>();

  constructor(private readonly prisma: PrismaService) {
    this.bot = new Telegraf(
      process.env.TELEGRAM_BOT_TOKEN || '8379782597:AAE4jSnqLDn9dVRkn4bUX2uGGtHsxFNJzZc'
    );
    this.MINI_APP_URL = process.env.MINI_APP_URL || 'https://nuvita.uz';
    
    // Clean up expired tokens every 10 minutes
    setInterval(() => this.cleanupExpiredTokens(), 10 * 60 * 1000);
  }

  private generateToken(): string {
    return crypto.randomBytes(6).toString('hex'); // 12 character token
  }

  private cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of this.registrationTokens.entries()) {
      if (now - data.createdAt > this.TOKEN_EXPIRY) {
        this.registrationTokens.delete(token);
      }
    }
    // Also cleanup link tokens
    for (const [token, data] of this.linkTokens.entries()) {
      if (now - data.createdAt > this.TOKEN_EXPIRY) {
        this.linkTokens.delete(token);
      }
    }
  }

  // Public method to validate and get token data
  public getRegistrationToken(token: string): RegistrationToken | null {
    const data = this.registrationTokens.get(token);
    if (!data) return null;
    
    // Check if expired
    if (Date.now() - data.createdAt > this.TOKEN_EXPIRY) {
      this.registrationTokens.delete(token);
      return null;
    }
    
    return data;
  }

  // Delete token after successful registration
  public deleteRegistrationToken(token: string) {
    this.registrationTokens.delete(token);
  }

  // Generate link token for existing web user to connect Telegram
  public generateLinkToken(phone: string, userId: number): string {
    const token = 'link_' + this.generateToken();
    this.linkTokens.set(token, {
      phone,
      userId,
      createdAt: Date.now(),
    });
    return token;
  }

  // Get link token data
  public getLinkToken(token: string): LinkToken | null {
    const data = this.linkTokens.get(token);
    if (!data) return null;
    
    if (Date.now() - data.createdAt > this.TOKEN_EXPIRY) {
      this.linkTokens.delete(token);
      return null;
    }
    
    return data;
  }

  // Delete link token after successful linking
  public deleteLinkToken(token: string) {
    this.linkTokens.delete(token);
  }

  onModuleInit() {
    // /start command handler
    this.bot.start(async (ctx) => {
      const telegramUserId = String(ctx.from.id);
      const telegramUsername = ctx.from.username || null;
      const telegramFullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || null;
      
      // Check if this is a link request from web profile
      const startParam = (ctx as any).startPayload || '';
      if (startParam.startsWith('link_')) {
        const linkToken = startParam;
        const linkData = this.getLinkToken(linkToken);
        
        if (!linkData) {
          await ctx.reply(
            "❌ Havola yaroqsiz yoki muddati tugagan.\n\nIltimos, profil sahifasidan qaytadan ulash tugmasini bosing.",
            Markup.removeKeyboard()
          );
          return;
        }

        // Check if this TG account is already linked to another user
        const existingTgUser = await this.prisma.user.findUnique({
          where: { userId: telegramUserId }
        });

        if (existingTgUser && existingTgUser.id !== linkData.userId) {
          await ctx.reply(
            "⚠️ Bu Telegram hisob boshqa foydalanuvchiga ulangan.\n\nIltimos, boshqa Telegram hisobdan foydalaning.",
            Markup.removeKeyboard()
          );
          return;
        }

        // Link the Telegram account to the web user
        await this.prisma.user.update({
          where: { id: linkData.userId },
          data: {
            userId: telegramUserId,
            username: telegramUsername,
            fullName: telegramFullName,
          },
        });

        this.deleteLinkToken(linkToken);

        await ctx.reply(
          `✅ Telegram hisobingiz muvaffaqiyatli ulandi!\n\n🎉 Endi siz botdan to'liq foydalanishingiz mumkin.`,
          Markup.inlineKeyboard([
            [Markup.button.webApp("🛒 Do'konga kirish", this.MINI_APP_URL)]
          ])
        );
        return;
      }
      
      // Check if user is registered by TG userId
      const user = await this.prisma.user.findUnique({
        where: { userId: telegramUserId }
      });

      if (user) {
        // User is registered - show welcome message based on role
        return this.handleRegisteredUser(ctx, user);
      }

      // User not registered - ask for contact
      await ctx.reply(
        "👋 Assalomu alaykum!\n\n🏥 Nuvita online dorixonasiga xush kelibsiz!\n\nTizimdan foydalanish uchun telefon raqamingizni yuboring:",
        Markup.keyboard([
          [Markup.button.contactRequest('📱 Telefon raqamni yuborish')]
        ]).resize().oneTime()
      );
    });

    // Contact handler
    this.bot.on('contact', async (ctx) => {
      const contact = ctx.message.contact;
      let phoneNumber = contact.phone_number;

      // Normalize phone number
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }

      const telegramUserId = String(ctx.from.id);
      const telegramUsername = ctx.from.username || null;
      const telegramFullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || null;

      // Check if user exists with this phone number
      let user = await this.prisma.user.findUnique({
        where: { number: phoneNumber },
      });

      if (user) {
        // Phone exists in DB - link TG account and welcome
        user = await this.prisma.user.update({
          where: { number: phoneNumber },
          data: {
            userId: telegramUserId,
            username: telegramUsername || user.username,
            fullName: user.fullName || telegramFullName,
          },
        });
        
        await ctx.reply(
          `✅ Telegram hisobingiz muvaffaqiyatli bog'landi!`,
          Markup.removeKeyboard()
        );
        
        return this.handleRegisteredUser(ctx, user);
      }

      // New user - generate registration token and send Mini App link
      const token = this.generateToken();
      this.registrationTokens.set(token, {
        phone: phoneNumber,
        telegramId: telegramUserId,
        username: telegramUsername || '',
        fullName: telegramFullName || '',
        createdAt: Date.now(),
      });

      await ctx.reply(
        `📝 Siz yangi foydalanuvchisiz!\n\nRo'yxatdan o'tish uchun parol o'rnating.\nBu parol saytga kirishda ishlatiladi.`,
        Markup.removeKeyboard()
      );

      // Send one-time link to Mini App
      const miniAppLink = `https://t.me/nuvitauzbot/nuvitauz?startapp=${token}`;
      await ctx.reply(
        `👇 Quyidagi havola orqali parol o'rnating:\n\n${miniAppLink}\n\n⏱ Havola 1 soat amal qiladi.`,
        Markup.inlineKeyboard([
          [Markup.button.url("🔐 Parol o'rnatish", miniAppLink)]
        ])
      );
    });

    // Handling inline buttons for COURIER
    this.bot.action(/got_order_(.+)/, async (ctx) => {
      const orderId = ctx.match[1];
      const order = await this.prisma.order.update({
        where: { orderId },
        data: { orderStatus: 'ON_THE_WAY' },
        include: { user: true }
      });

      // Update bot message
      await ctx.editMessageText(
        `✅ Buyurtma (#${order.id}) kuryer tomonidan olindi va yo'lda!\nMijoz: ${order.fullName}\nTel: ${order.contactNumber}\nManzil: ${order.address}`,
        Markup.inlineKeyboard([
          Markup.button.callback("📍 Mijozga topshirdim (Yetkazdim)", `delivered_${orderId}`)
        ])
      );

      // Notify User
      if (order.user.userId) {
        await this.bot.telegram.sendMessage(
          order.user.userId,
          `🛵 Sizning buyurtmangiz (#${order.id}) kuryer tomonidan olindi. Buyurtma yo'lda!`
        );
      }
    });

    this.bot.action(/delivered_(.+)/, async (ctx) => {
      const orderId = ctx.match[1];
      const order = await this.prisma.order.findUnique({ where: { orderId }});
      if (!order) return;

      if (order.paymentType === 'CASH' && order.paymentStatus !== 'PAID') {
         await ctx.editMessageText(
          `💰 Buyurtma yetkazildi (#${order.id}).\n\nDIQQAT! To'lov naqd pulda ko'rsatilgan.\nMijozdan ${order.summ + order.deliverySumm} so'm qabul qilib oling!`,
          Markup.inlineKeyboard([
            Markup.button.callback("💸 Naqd pulni oldim (Tugatish)", `cash_received_${orderId}`)
          ])
        );
      } else {
        await this.completeOrderDelivery(ctx, orderId);
      }
    });

    this.bot.action(/cash_received_(.+)/, async (ctx) => {
      const orderId = ctx.match[1];
      await this.prisma.order.update({
        where: { orderId },
        data: { paymentStatus: 'PAID' }
      });
      await this.completeOrderDelivery(ctx, orderId);
    });

    this.bot.action(/grade_(.+)_(.+)/, async (ctx) => {
      const orderId = ctx.match[1];
      const grade = parseInt(ctx.match[2], 10);
      await this.prisma.order.update({
        where: { orderId },
        data: { grade }
      });
      await ctx.editMessageText(`Siz yetkazib berish xizmatini ${grade} ⭐️ yulduz bilan baholadingiz. Bahoyingiz uchun rahmat!`);
    });

    this.bot.launch().catch((err) => this.logger.error('Telegram bot launch error:', err));

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  private async completeOrderDelivery(ctx: any, orderId: string) {
    const order = await this.prisma.order.update({
      where: { orderId },
      data: { orderStatus: 'DELIVERED' },
      include: { user: true }
    });

    await ctx.editMessageText(`✅ Buyurtma (#${order.id}) muvaffaqiyatli topshirildi va jarayon yakunlandi.`);

    if (order.user.userId) {
      await this.bot.telegram.sendMessage(
        order.user.userId,
        `🎉 Sizning buyurtmangiz (#${order.id}) muvaffaqiyatli yetkazildi!\n\nIltimos, xizmatimizni baholang:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("1 ⭐️", `grade_${orderId}_1`),
            Markup.button.callback("2 ⭐️", `grade_${orderId}_2`),
            Markup.button.callback("3 ⭐️", `grade_${orderId}_3`),
            Markup.button.callback("4 ⭐️", `grade_${orderId}_4`),
            Markup.button.callback("5 ⭐️", `grade_${orderId}_5`),
          ]
        ])
      );
    }
  }

  public async notifyCourierNewOrder(telegramId: string, order: any) {
    try {
      let totalCount = 0;
      const productDetails = (order.productItems as any[]).map((p, index) => {
        totalCount += p.count;
        return `${index + 1}. ${p.name} - ${p.count} ta (${(p.price * p.count).toLocaleString()} so'm)`;
      }).join('\n');

      const text = `🚨 Sizga yangi buyurtma biriktirildi!\n\n🆔 Buyurtma ID: #${order.id}\n👤 Mijoz: ${order.fullName}\n📞 Tel: ${order.contactNumber}\n📍 Manzil: ${order.address}\n💳 To'lov turi: ${order.paymentType} \n\n📦 Tarkibi:\n${productDetails}\n\n📊 Umumiy dorilar soni: ${totalCount} ta\n💰 Umumiy hisob: ${(order.summ + order.deliverySumm).toLocaleString()} so'm (Yetkazish ichida)`;    
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📦 Ombordan oldim (Tasdiqlash)", `got_order_${order.orderId}`)]
      ]);

      await this.bot.telegram.sendMessage(telegramId, text, keyboard);
    } catch (e) {
        this.logger.error("Could not notify courier bot", e);
    }
  }

  public async notifyUserStatusOrMessage(telegramId: string, message: string) {
    try {
        await this.bot.telegram.sendMessage(telegramId, message);
    } catch (e) {
        this.logger.error("Could not notify user", e);
    }
  }

  private async handleUserRole(ctx: any, user: any, phoneNumber: string) {      
    return this.handleRegisteredUser(ctx, user);
  }

  private async handleRegisteredUser(ctx: any, user: any) {      
    const displayName = user.fullName || user.number;
    
    if (user.role === 'ADMIN') {
      await ctx.reply(
        `🔑 Admin ${displayName}, xush kelibsiz!`,
        Markup.inlineKeyboard([
          [Markup.button.url("📊 Admin Panel", `${this.WEBSITE_URL}/admin`)]
        ])
      );
    } else if (user.role === 'COURIER') {
      await ctx.reply(
        `🛵 Xodim kuryer ${displayName}, xush kelibsiz!`,
        Markup.keyboard([
          ['📦 Yangi buyurtmalar', '✅ Yetkazilganlar'],
          ['👤 Mening profilim']
        ]).resize()
      );
    } else {
      // Regular USER - show inline button to mini app
      await ctx.reply(
        `🎉 Xush kelibsiz, ${displayName}!\n\n🏥 Nuvita online dorixonasiga xush kelibsiz!\n\nBizda sifatli dori-darmonlar va shifokorlar maslahatlarini olishingiz mumkin.`,
        Markup.inlineKeyboard([
          [Markup.button.webApp("🛒 Do'konga kirish", this.MINI_APP_URL)]
        ])
      );
    }
  }
}
