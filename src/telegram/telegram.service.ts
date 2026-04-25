import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenType } from '../../generated/prisma';
import * as crypto from 'crypto';
import { normalizeUzbekPhone } from '../common/uzbek-phone';

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
  private readonly OTP_TTL_MS = 2 * 60 * 1000;

  private readonly TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

  /** /start link_… dan keyin — kontakt yuborilguncha saqlanadi; token DB da tekshiriladi */
  private pendingWebLink = new Map<
    string,
    { token: string; createdAt: number }
  >();

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

  private normalizePhone(phone: string): string {
    return (phone || '').replace(/[^\d]/g, '');
  }

  private maskPhone(phone: string): string {
    const digits = this.normalizePhone(phone);
    if (digits.length < 6) return phone;
    const last = digits.slice(-2);
    const first = digits.slice(0, 3);
    return `+${first}•••••${last}`;
  }

  private cleanupExpiredTokens() {
    const now = Date.now();
    for (const [tgId, data] of this.pendingWebLink.entries()) {
      if (now - data.createdAt > this.TOKEN_EXPIRY) {
        this.pendingWebLink.delete(tgId);
      }
    }
    void this.clearExpiredWebLoginOtps();
    void this.prisma.authFlowToken
      .deleteMany({
        where: {
          expiresAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      })
      .catch(() => {});
  }

  private botUsername(): string {
    return (process.env.TELEGRAM_BOT_USERNAME || 'nuvitauzbot').replace(
      /^@/,
      '',
    );
  }

  private generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /** Muddati o'tgan brauzer kirish kodlarini tozalaydi */
  private async clearExpiredWebLoginOtps() {
    const cutoff = new Date();
    await this.prisma.user.updateMany({
      where: { loginOtpExpiresAt: { lt: cutoff } },
      data: { loginOtp: null, loginOtpExpiresAt: null },
    });
    await this.prisma.tgUser.updateMany({
      where: { loginOtpExpiresAt: { lt: cutoff } },
      data: { loginOtp: null, loginOtpExpiresAt: null },
    });
  }

  private linkRowToData(row: {
    phone: string | null;
    userId: number | null;
    createdAt: Date;
  }): LinkToken | null {
    if (!row.phone || row.userId == null) return null;
    return {
      phone: row.phone,
      userId: row.userId,
      createdAt: row.createdAt.getTime(),
    };
  }

  public async generateLinkToken(phone: string, userId: number): Promise<string> {
    const token = 'link_' + this.generateToken();
    await this.prisma.authFlowToken.create({
      data: {
        token,
        type: AuthTokenType.LINK,
        userId,
        phone,
        expiresAt: new Date(Date.now() + this.TOKEN_EXPIRY),
      },
    });
    return token;
  }

  public async getLinkToken(token: string): Promise<LinkToken | null> {
    const row = await this.prisma.authFlowToken.findFirst({
      where: {
        token,
        type: AuthTokenType.LINK,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) return null;
    return this.linkRowToData(row);
  }

  public async deleteLinkToken(token: string): Promise<void> {
    await this.prisma.authFlowToken.updateMany({
      where: { token, type: AuthTokenType.LINK },
      data: { consumedAt: new Date() },
    });
  }

  private async sendWebLoginOtpDm(
    chatId: string,
    code: string,
  ): Promise<void> {
    await this.bot.telegram.sendMessage(
      chatId,
      `🔑 *Saytga kirish kodingiz:* \`${code}\`\n\n` +
        `⏱ Kod *2 daqiqa* davomida amal qiladi.\n` +
        `🌐 *nuvita.uz* → Kirish yoki ro'yxatdan o'tish: telefon va kod.\n\n` +
        `_Yangi kod:_ /code`,
      { parse_mode: 'Markdown' },
    );
  }

  /** Brauzer kirish OTP — `users` yoki `tg_users` (/code va inline «Kodni yangilash»). */
  private async refreshWebLoginOtpForTelegramId(
    tgId: string,
  ): Promise<'user' | 'tg' | 'none'> {
    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + this.OTP_TTL_MS);

    const user = await this.prisma.user.findUnique({
      where: { userId: tgId },
    });
    if (user?.number) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginOtp: otp, loginOtpExpiresAt: otpExpires },
      });
      try {
        await this.sendWebLoginOtpDm(tgId, otp);
      } catch (e) {
        this.logger.error('sendWebLoginOtpDm refresh user', e);
      }
      return 'user';
    }

    const tg = await this.prisma.tgUser.findUnique({
      where: { telegramId: tgId },
    });
    if (tg) {
      await this.prisma.tgUser.update({
        where: { id: tg.id },
        data: { loginOtp: otp, loginOtpExpiresAt: otpExpires },
      });
      try {
        await this.sendWebLoginOtpDm(tgId, otp);
      } catch (e) {
        this.logger.error('sendWebLoginOtpDm refresh tg', e);
      }
      return 'tg';
    }
    return 'none';
  }

  /** Profil → Telegram ulash havolasi: \`https://t.me/<bot>?start=link_...\` */
  public getBotDeepLinkStartParam(startParam: string): string {
    return `https://t.me/${this.botUsername()}?start=${startParam}`;
  }

  onModuleInit() {
    // /start command handler
    this.bot.start(async (ctx) => {
      const telegramUserId = String(ctx.from.id);
      const telegramUsername = ctx.from.username || null;
      const telegramFullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || null;
      
      // Web profil → Telegram ulash: token DB da; xato faqat kontakt yuborilgach
      const startParam = (ctx as any).startPayload || '';
      if (startParam.startsWith('link_')) {
        const linkToken = startParam;
        this.pendingWebLink.set(telegramUserId, {
          token: linkToken,
          createdAt: Date.now(),
        });
        const linkData = await this.getLinkToken(linkToken);
        const extraHint = linkData
          ? `📱 Profilingizdagi raqam: *${this.maskPhone(linkData.phone)}*\n\n`
          : '';
        await ctx.reply(
          `🔐 *Nuvita* hisobingizni Telegram bilan ulash uchun quyidagi tugma orqali *o'z telefon raqamingizni* yuboring.\n\n` +
            extraHint +
            `Kontakt qabul qilingach, havola (va raqam) tekshiriladi.`,
          {
            parse_mode: 'Markdown',
            ...Markup.keyboard([
              [Markup.button.contactRequest('📱 Telefon raqamni ulashish')],
            ])
              .resize()
              .oneTime(),
          },
        );
        return;
      }
      
      const user = await this.prisma.user.findUnique({
        where: { userId: telegramUserId },
      });

      if (user) {
        if (user.number) {
          const otp = this.generateOtp();
          const otpExpires = new Date(Date.now() + this.OTP_TTL_MS);
          const updated = await this.prisma.user.update({
            where: { id: user.id },
            data: {
              loginOtp: otp,
              loginOtpExpiresAt: otpExpires,
              username: telegramUsername || user.username,
              fullName: user.fullName || telegramFullName,
            },
          });
          try {
            await this.sendWebLoginOtpDm(telegramUserId, otp);
          } catch (e) {
            this.logger.error('sendWebLoginOtpDm /start', e);
          }
          await ctx.reply(
            '🔑 *Kod yuborildi* (shaxsiy xabar). `/code` — yangi kod.',
            { parse_mode: 'Markdown' },
          );
          return this.handleRegisteredUser(ctx, updated);
        }
        return this.handleRegisteredUser(ctx, user);
      }

      await ctx.reply(
        "👋 *Nuvita*\n\nPastdagi tugma orqali *o'z telefon kontactingizni* yuboring.",
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
          ])
            .resize()
            .oneTime(),
        },
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
      const telegramFullName =
        [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
        null;

      // Security: contact must belong to the user who sent it
      if (
        contact.user_id &&
        String(contact.user_id) !== telegramUserId
      ) {
        await ctx.reply(
          "❌ Iltimos, o'zingizning telefon raqamingizni ulashing (boshqa odamning kontaktini emas).",
          Markup.keyboard([
            [Markup.button.contactRequest('📱 Telefon raqamni ulashish')],
          ])
            .resize()
            .oneTime(),
        );
        return;
      }

      // /start link_… — web ulanish: tekshiruv faqat kontaktdan keyin
      const webPending = this.pendingWebLink.get(telegramUserId);
      if (webPending) {
        this.pendingWebLink.delete(telegramUserId);
        if (Date.now() - webPending.createdAt > this.TOKEN_EXPIRY) {
          await ctx.reply(
            "⌛ Ulanish muddati tugagan. *nuvita.uz* → *Profil* → Telegramga ulash dan yangi havola oling.",
            { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
          );
          return;
        }

        const linkData = await this.getLinkToken(webPending.token);
        if (!linkData) {
          await ctx.reply(
            '❌ Ulash havolasi yaroqsiz yoki muddati tugagan.\n\n' +
              'Iltimos, *nuvita.uz* → *Profil* → «Telegramga ulash» dan yangi havola oling.',
            { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
          );
          return;
        }

        const existingTgOnOther = await this.prisma.user.findUnique({
          where: { userId: telegramUserId },
        });
        if (existingTgOnOther && existingTgOnOther.id !== linkData.userId) {
          await ctx.reply(
            '⚠️ Bu Telegram hisob boshqa foydalanuvchiga ulangan.\n\nBoshqa hisobdan foydalaning.',
            Markup.removeKeyboard(),
          );
          return;
        }

        const linkPhoneNorm = normalizeUzbekPhone(linkData.phone || '');
        const contactPhoneNorm = normalizeUzbekPhone(phoneNumber);
        if (
          !linkPhoneNorm ||
          !contactPhoneNorm ||
          linkPhoneNorm !== contactPhoneNorm
        ) {
          await ctx.reply(
            `❌ Ulangan raqam profildagi raqam bilan mos emas.\n\n` +
              `📱 Kutilayotgan: *${this.maskPhone(linkData.phone || '')}*\n` +
              `📱 Yuborildi: *${this.maskPhone(phoneNumber)}*`,
            { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
          );
          return;
        }

        const linkedUser = await this.prisma.user.update({
          where: { id: linkData.userId },
          data: {
            userId: telegramUserId,
            username: telegramUsername,
            fullName: telegramFullName || undefined,
          },
        });
        await this.deleteLinkToken(webPending.token);
        await ctx.reply(
          `✅ Telefon tasdiqlandi va Telegram hisobingiz *Nuvita* profilga ulandi!`,
          { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
        );
        return this.handleRegisteredUser(ctx, linkedUser);
      }

      const canonical = normalizeUzbekPhone(phoneNumber);
      if (!canonical) {
        await ctx.reply(
          "❌ Telefon raqami tanilmadi. Faqat *O'zbekiston* raqami (+998…) qabul qilinadi.",
          { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
        );
        return;
      }

      let user = await this.prisma.user.findUnique({
        where: { number: canonical },
      });

      const otp = this.generateOtp();
      const otpExpires = new Date(Date.now() + this.OTP_TTL_MS);

      if (user) {
        if (user.userId && user.userId !== telegramUserId) {
          await ctx.reply(
            "❌ Bu telefon raqami boshqa Telegram akkauntiga ulangan.",
            Markup.removeKeyboard(),
          );
          return;
        }

        user = await this.prisma.user.update({
          where: { number: canonical },
          data: {
            userId: telegramUserId,
            username: telegramUsername || user.username,
            fullName: user.fullName || telegramFullName,
            loginOtp: otp,
            loginOtpExpiresAt: otpExpires,
          },
        });

        try {
          await this.sendWebLoginOtpDm(telegramUserId, otp);
        } catch (e) {
          this.logger.error('sendWebLoginOtpDm', e);
        }

        await ctx.reply(
          '✅ *Kod yuborildi* (shaxsiy xabar). Saytda kiriting. ⏱ *2 daqiqa*',
          { parse_mode: 'Markdown', ...Markup.removeKeyboard() },
        );
        return this.handleRegisteredUser(ctx, user);
      }

      const otherTg = await this.prisma.tgUser.findFirst({
        where: {
          number: canonical,
          telegramId: { not: telegramUserId },
        },
      });
      if (otherTg) {
        await ctx.reply(
          "❌ Bu telefon raqami boshqa Telegram akkauntda ro'yxatdan o'tish uchun ishlatilmoqda.",
          Markup.removeKeyboard(),
        );
        return;
      }

      await this.prisma.tgUser.upsert({
        where: { telegramId: telegramUserId },
        create: {
          telegramId: telegramUserId,
          number: canonical,
          username: telegramUsername,
          fullName: telegramFullName,
          loginOtp: otp,
          loginOtpExpiresAt: otpExpires,
        },
        update: {
          number: canonical,
          username: telegramUsername,
          fullName: telegramFullName,
          loginOtp: otp,
          loginOtpExpiresAt: otpExpires,
        },
      });

      try {
        await this.sendWebLoginOtpDm(telegramUserId, otp);
      } catch (e) {
        this.logger.error('sendWebLoginOtpDm tg staging', e);
      }

      await ctx.reply(
        '✅ *Kod* shaxsiy xabarda.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🔄 Kodni yangilash', 'refresh_web_otp'),
              Markup.button.webApp("🛒 Do'konga kirish", this.MINI_APP_URL),
            ],
          ]),
        },
      );
    });

    this.bot.action('refresh_web_otp', async (ctx) => {
      const q = ctx.callbackQuery;
      if (!q?.id) return;
      const tgId = String(ctx.from?.id ?? '');
      const kind = await this.refreshWebLoginOtpForTelegramId(tgId);
      if (kind === 'none') {
        await ctx.telegram.answerCbQuery(q.id, "Avval /start va kontakt yuboring", {
          show_alert: true,
        });
        return;
      }
      await ctx.telegram.answerCbQuery(q.id, 'Yangi kod yuborildi');
    });

    this.bot.command('code', async (ctx) => {
      const tgId = String(ctx.from.id);
      const kind = await this.refreshWebLoginOtpForTelegramId(tgId);
      if (kind === 'user') {
        await ctx.reply(
          "✅ Yangi kod yuborildi (shaxsiy xabar). *2 daqiqa* amal qiladi.",
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (kind === 'tg') {
        await ctx.reply(
          '✅ Yangi kod shaxsiy xabarda. *nuvita.uz* da kiriting.',
          { parse_mode: 'Markdown' },
        );
        return;
      }

      await ctx.reply(
        "Avval /start bosing va o'z telefon raqamingizni ulashing.",
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

    const KB_COURIER_NEW = '📦 Yangi buyurtmalar';
    const KB_COURIER_DONE = '✅ Yetkazilganlar';
    const KB_SHARED_PROFILE = '👤 Mening profilim';
    const KB_ADMIN_STATS = '📈 Statistika';

    this.bot.hears(KB_SHARED_PROFILE, async (ctx) => {
      const tgId = String(ctx.from?.id ?? '');
      const user = await this.prisma.user.findUnique({
        where: { userId: tgId },
      });
      if (!user) {
        await ctx.reply('Foydalanuvchi topilmadi. /start bosing.');
        return;
      }
      if (user.role === 'ADMIN') {
        await this.replyAdminProfile(ctx, user);
      } else if (user.role === 'COURIER') {
        await this.replyCourierProfile(ctx, tgId);
      } else {
        await ctx.reply('Bu bo‘lim faqat admin va kuryerlar uchun.');
      }
    });

    this.bot.hears(KB_ADMIN_STATS, async (ctx) => {
      const tgId = String(ctx.from?.id ?? '');
      await this.replyAdminStats(ctx, tgId);
    });

    this.bot.hears(KB_COURIER_NEW, async (ctx) => {
      const tgId = String(ctx.from?.id ?? '');
      await this.replyCourierActiveOrders(ctx, tgId);
    });

    this.bot.hears(KB_COURIER_DONE, async (ctx) => {
      const tgId = String(ctx.from?.id ?? '');
      await this.replyCourierDeliveredList(ctx, tgId);
    });

    this.bot.launch().catch((err) => this.logger.error('Telegram bot launch error:', err));

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  /** Kuryer emas yoki topilmasa null */
  private async getCourierByTelegramId(telegramUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId: telegramUserId },
    });
    if (!user || user.role !== 'COURIER') return null;
    return user;
  }

  /** Admin emas yoki topilmasa null */
  private async getAdminByTelegramId(telegramUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId: telegramUserId },
    });
    if (!user || user.role !== 'ADMIN') return null;
    return user;
  }

  private async replyAdminProfile(
    ctx: any,
    user: {
      fullName: string | null;
      number: string | null;
      username: string | null;
      createdAt: Date;
    },
  ) {
    const displayName = user.fullName?.trim() || '—';
    const phone = user.number || '—';
    const tgLine = user.username
      ? `@${user.username}`
      : '— (username yo‘q)';
    const regDate = user.createdAt.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const [totalOrders, newCnt, userCnt, productCnt] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { orderStatus: 'NEW' } }),
      this.prisma.user.count(),
      this.prisma.product.count({ where: { isActive: true } }),
    ]);

    const text =
      `👤 Mening profilim (admin)\n` +
      `────────────────\n` +
      `🔑 Rol: Administrator\n` +
      `📛 Ism: ${displayName}\n` +
      `📞 Telefon: ${phone}\n` +
      `✈️ Telegram: ${tgLine}\n` +
      `📅 Tizimda: ${regDate}\n\n` +
      `📌 Qisqa ko‘rinish\n` +
      `• Barcha buyurtmalar: ${totalOrders} ta\n` +
      `• Yangi (kutilmoqda): ${newCnt} ta\n` +
      `• Ro‘yxatdan foydalanuvchilar: ${userCnt} ta\n` +
      `• Faol mahsulotlar: ${productCnt} ta\n\n` +
      `💡 Batafsil: «📈 Statistika» tugmasi.\n` +
      `🌐 Panel: ${this.WEBSITE_URL}/admin`;

    await ctx.reply(text);
  }

  private async replyAdminStats(ctx: any, telegramUserId: string) {
    const user = await this.getAdminByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply('Bu bo‘lim faqat administratorlar uchun.');
      return;
    }

    const [
      totalOrders,
      cntNew,
      cntAccepted,
      cntWay,
      cntDelivered,
      cntCancelled,
      userCount,
      productCount,
      categoryCount,
    ] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { orderStatus: 'NEW' } }),
      this.prisma.order.count({ where: { orderStatus: 'ACCEPTED' } }),
      this.prisma.order.count({ where: { orderStatus: 'ON_THE_WAY' } }),
      this.prisma.order.count({ where: { orderStatus: 'DELIVERED' } }),
      this.prisma.order.count({ where: { orderStatus: 'CANCELLED' } }),
      this.prisma.user.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.category.count({ where: { isActive: true } }),
    ]);

    const text =
      `📈 Statistika (umumiy)\n` +
      `────────────────\n` +
      `📦 Buyurtmalar: ${totalOrders} ta\n` +
      `  · 🆕 Yangi: ${cntNew}\n` +
      `  · 📋 Qabul qilingan: ${cntAccepted}\n` +
      `  · 🛵 Yo‘lda: ${cntWay}\n` +
      `  · ✅ Yetkazilgan: ${cntDelivered}\n` +
      `  · ❌ Bekor: ${cntCancelled}\n\n` +
      `👥 Foydalanuvchilar: ${userCount} ta\n` +
      `🏷 Kategoriyalar: ${categoryCount} ta\n` +
      `💊 Faol mahsulotlar: ${productCount} ta\n\n` +
      `🌐 Panel: ${this.WEBSITE_URL}/admin`;

    await ctx.reply(text);
  }

  private async replyCourierProfile(ctx: any, telegramUserId: string) {
    const user = await this.getCourierByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply('Bu bo‘lim faqat kuryerlar uchun.');
      return;
    }

    const [activeCount, deliveredOrders] = await Promise.all([
      this.prisma.order.count({
        where: {
          courierUserId: user.id,
          orderStatus: { in: ['ACCEPTED', 'ON_THE_WAY'] },
        },
      }),
      this.prisma.order.findMany({
        where: { courierUserId: user.id, orderStatus: 'DELIVERED' },
        select: { summ: true, deliverySumm: true },
      }),
    ]);

    const deliveredCount = deliveredOrders.length;
    const totalTurnover = deliveredOrders.reduce(
      (acc, o) => acc + o.summ + o.deliverySumm,
      0,
    );

    const displayName = user.fullName?.trim() || '—';
    const phone = user.number || '—';
    const tgLine = user.username
      ? `@${user.username}`
      : '— (username yo‘q)';
    const regDate = user.createdAt.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const text =
      `👤 Mening profilim\n` +
      `────────────────\n` +
      `🛵 Rol: Kuryer\n` +
      `📛 Ism: ${displayName}\n` +
      `📞 Telefon: ${phone}\n` +
      `✈️ Telegram: ${tgLine}\n` +
      `📅 Tizimda: ${regDate}\n\n` +
      `📊 Statistika\n` +
      `• Faol buyurtmalar: ${activeCount} (yig'ilmoqda / yo'lda)\n` +
      `• Yetkazilgan: ${deliveredCount} ta\n` +
      `• Yetkazilganlar jami: ${totalTurnover.toLocaleString('uz-UZ')} so'm\n\n` +
      `💡 Yangi buyurtmalar sizga shu yerga xabar qilib keladi.`;

    await ctx.reply(text);
  }

  private async replyCourierActiveOrders(ctx: any, telegramUserId: string) {
    const user = await this.getCourierByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply('Bu bo‘lim faqat kuryerlar uchun.');
      return;
    }

    const orders = await this.prisma.order.findMany({
      where: {
        courierUserId: user.id,
        orderStatus: { in: ['ACCEPTED', 'ON_THE_WAY'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    if (orders.length === 0) {
      await ctx.reply(
        '📦 Faol buyurtmalar\n\n' +
          'Hozircha sizga biriktirilgan kutilayotgan yoki yo‘ldagi buyurtma yo‘q.',
      );
      return;
    }

    let block = '📦 Faol buyurtmalar\n────────────────\n';
    for (const o of orders) {
      const st =
        o.orderStatus === 'ACCEPTED' ? '⏳ Yig‘ilmoqda' : '🛵 Yo‘lda';
      const addr =
        o.address.length > 200 ? o.address.slice(0, 200) + '…' : o.address;
      block +=
        `\n🆔 #${o.id} · ${st}\n` +
        `👤 ${o.fullName}\n` +
        `📞 ${o.contactNumber}\n` +
        `📍 ${addr}\n` +
        `💰 ${(o.summ + o.deliverySumm).toLocaleString('uz-UZ')} so'm\n`;
    }

    await ctx.reply(block);
  }

  private async replyCourierDeliveredList(ctx: any, telegramUserId: string) {
    const user = await this.getCourierByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply('Bu bo‘lim faqat kuryerlar uchun.');
      return;
    }

    const orders = await this.prisma.order.findMany({
      where: { courierUserId: user.id, orderStatus: 'DELIVERED' },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        createdAt: true,
        summ: true,
        deliverySumm: true,
        fullName: true,
      },
    });

    if (orders.length === 0) {
      await ctx.reply(
        '✅ Yetkazilganlar\n\n' + 'Hozircha yakunlangan buyurtmalar yo‘q.',
      );
      return;
    }

    let block = '✅ Oxirgi yetkazilganlar\n────────────────\n';
    for (const o of orders) {
      const when = o.createdAt.toLocaleDateString('uz-UZ', {
        day: 'numeric',
        month: 'short',
      });
      const total = o.summ + o.deliverySumm;
      block +=
        `\n🆔 #${o.id} · ${when}\n` +
        `👤 ${o.fullName}\n` +
        `💰 ${total.toLocaleString('uz-UZ')} so'm\n`;
    }

    if (orders.length === 12) {
      block += '\n(oxirgi 12 ta)';
    }

    await ctx.reply(block);
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
        `🔑 Admin ${displayName}, xush kelibsiz!\n\n` +
          `📈 Statistika va 👤 Mening profilim tugmalari orqali ko‘rish mumkin.\n` +
          `🌐 Sayt: ${this.WEBSITE_URL}/admin`,
        Markup.keyboard([
          ['📈 Statistika', '👤 Mening profilim'],
        ]).resize(),
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
