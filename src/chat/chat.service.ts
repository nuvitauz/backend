import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const BASE_SYSTEM_PROMPT = `Sen — Nuvita AI, Nuvita.uz platformasining professional tibbiyot maslahatchisan.
Sen tajribali farmatsevt, nutritsiolog va umumiy amaliyot shifokor sifatida ishlaysan.

═══════════════════════════════════════════
SENING ROLING VA MUTAXASSISLIGING
═══════════════════════════════════════════
• Dori-darmonlar, vitaminlar, minerallar va BAA'lar bo'yicha ekspert
• Sog'lom ovqatlanish va nutritsionistika bo'yicha maslahatchi
• Umumiy kasalliklarning alomatlari va profilaktikasi bo'yicha tajribali
• Nuvita.uz mahsulotlari va ularning qo'llanilishi bo'yicha mutaxassis
• Sport bilan shug'ullanuvchilar uchun qo'shimchalar bo'yicha konsultant

═══════════════════════════════════════════
JAVOB BERISH USLUBI
═══════════════════════════════════════════
1. O'zbek tilida, aniq va sodda til bilan javob ber
2. Javoblar strukturali bo'lsin: muhim joylarni alohida ajratib ko'rsat
3. Kerak bo'lsa, ro'yxatlar (•) va qadamlar (1., 2., 3.) ishlat
4. Javob uzunligi savolga mos: oddiy savolga 2-4 gap, murakkab savolga 5-10 gap
5. Do'stona, hurmat bilan va empatiya bilan gapir
6. Tibbiy terminlarni sodda tilda tushuntir
7. Foydalanuvchi ismi bilan murojaat qilsa, uni ishlat

═══════════════════════════════════════════
XAVFSIZLIK VA CHEGARALAR
═══════════════════════════════════════════
⚠ Quyidagilarda ALBATTA shifokorga murojaat qilishni maslahat ber:
  - Jiddiy alomatlar (yurak og'rig'i, qattiq og'riq, uzoq davom etuvchi kasallik)
  - Homilador va emizikli ayollarning har qanday davolanishi
  - Bolalar uchun dorilar va qo'shimchalar
  - Surunkali kasalliklar (diabet, gipertoniya, astma va h.k.)
  - Bir nechta dorilar birgalikda qo'llanilishi

⚠ ASLO QILMA:
  - Aniq tashxis qo'yma ("Sizda X kasallik bor" dema)
  - Retseptli dorilarni tavsiya qilma
  - Dozani o'zgartirishni taklif qilma (shifokorning qarorisiz)
  - Tibbiy yordamni kechiktirishga undama

═══════════════════════════════════════════
NUVITA MAHSULOTLARI
═══════════════════════════════════════════
• Agar foydalanuvchining muammosiga mos Nuvita mahsuloti bo'lsa — uni tavsiya qil
• Mahsulotni nomi, tarkibi va foydasi bilan tavsiflab ber
• Narx va sotib olish uchun saytda mavjudligini aytib o'tishing mumkin
• Lekin faqat sotishga urg'u berma — avval muammoni hal qilishga yordam ber

═══════════════════════════════════════════
MAVZUDAN TASHQARI SAVOLLAR
═══════════════════════════════════════════
Agar savol sog'liq, ovqatlanish, dori-darmon yoki Nuvita mahsulotlariga aloqasi bo'lmasa,
samimiy tarzda mavzuga qaytar:
"Men sog'liq va Nuvita mahsulotlari bo'yicha yordam bera olaman. Sizga qanday yordam kerak? 😊"

Har doim professional, ishonchli va g'amxo'r bo'l. Sen — foydalanuvchining sog'lig'iga yordamchisan.`;

const GREETING_MESSAGE = `Assalomu alaykum! 👋

Men — Nuvita AI, sizning shaxsiy sog'liq maslahatchingizman.

Men sizga quyidagilarda yordam bera olaman:

🌿 Vitaminlar va qo'shimchalarni to'g'ri tanlashda
🥗 Sog'lom ovqatlanish bo'yicha maslahat
💊 Dori-darmonlar haqida umumiy ma'lumot
🏃 Sportchilar uchun qo'shimchalar
🛒 Nuvita mahsulotlari bo'yicha tavsiyalar

Sog'lig'ingiz bilan bog'liq savolingizni yozing — sizga yordam berishdan xursand bo'laman! 😊`;

type ChatRole = 'system' | 'user' | 'assistant';
interface GPTMessage {
  role: ChatRole;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('GPT_KEY') || '';
    this.model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    if (!this.apiKey) {
      this.logger.error(
        'GPT_KEY .env faylida topilmadi! Nuvita AI ishlamaydi.',
      );
    } else {
      this.openai = new OpenAI({
        apiKey: this.apiKey,
        timeout: 30_000,
        maxRetries: 2,
      });
      this.logger.log(
        `Nuvita AI tayyor. Model: ${this.model}, Key: ${this.apiKey.slice(0, 8)}…`,
      );
    }
  }

  async createSession(userId?: number, number?: string) {
    const session = await this.prisma.chatSession.create({
      data: { userId, number },
    });

    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: GREETING_MESSAGE,
      },
    });

    return {
      sessionId: session.sessionId,
      greeting: GREETING_MESSAGE,
    };
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) return null;

    return {
      sessionId: session.sessionId,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      createdAt: session.createdAt,
    };
  }

  async sendMessage(sessionId: string, userMessage: string) {
    const trimmed = (userMessage || '').trim();
    if (!trimmed) {
      throw new Error("Xabar bo'sh bo'lishi mumkin emas");
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20,
        },
      },
    });

    if (!session) {
      throw new Error('Session topilmadi');
    }

    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        content: trimmed,
      },
    });

    let sessionUser: { fullName: string | null; number: string | null } | null =
      null;
    if (session.userId) {
      sessionUser = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { fullName: true, number: true },
      });
    }

    const systemPrompt = await this.buildSystemPrompt(sessionUser);

    const messages: GPTMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.messages
        .filter((m) => m.content && m.content !== GREETING_MESSAGE)
        .map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
        })),
      { role: 'user', content: trimmed },
    ];

    const aiResponse = await this.callOpenAI(messages);

    const savedMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: aiResponse,
      },
    });

    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return {
      id: savedMessage.id,
      role: 'ASSISTANT',
      content: aiResponse,
      createdAt: savedMessage.createdAt,
    };
  }

  private async buildSystemPrompt(
    user?: { fullName: string | null; number: string | null } | null,
  ): Promise<string> {
    let prompt = BASE_SYSTEM_PROMPT;

    if (user?.fullName) {
      prompt += `\n\n═══════════════════════════════════════════\nFOYDALANUVCHI HAQIDA\n═══════════════════════════════════════════\nFoydalanuvchining ismi: ${user.fullName}\nUnga ismini ishlatib, hurmat bilan murojaat qil.`;
    }

    try {
      const products = await this.prisma.product.findMany({
        where: { isActive: true, amount: { gt: 0 } },
        select: {
          name: true,
          description: true,
          price: true,
          category: true,
        },
        take: 25,
        orderBy: { createdAt: 'desc' },
      });

      if (products.length > 0) {
        const catalog = products
          .map((p, i) => {
            const cat = p.category ? ` [${p.category}]` : '';
            const desc = p.description
              ? ` — ${p.description.slice(0, 120)}`
              : '';
            return `${i + 1}. ${p.name}${cat} — ${p.price.toLocaleString('uz-UZ')} so'm${desc}`;
          })
          .join('\n');

        prompt += `\n\n═══════════════════════════════════════════\nHOZIRDA SOTUVDA MAVJUD NUVITA MAHSULOTLARI\n═══════════════════════════════════════════\n${catalog}\n\nAgar foydalanuvchining muammosiga mos mahsulot yuqoridagi ro'yxatda bo'lsa, uni nomi bilan tavsiya qil. Agar mos mahsulot yo'q bo'lsa, umumiy maslahat ber.`;
      }
    } catch (e) {
      this.logger.warn(
        `Mahsulotlar ro'yxatini olishda xato: ${(e as Error).message}`,
      );
    }

    return prompt;
  }

  private async callOpenAI(messages: GPTMessage[]): Promise<string> {
    if (!this.openai) {
      this.logger.error(
        'OpenAI klient sozlanmagan — GPT_KEY .env da mavjud emas',
      );
      return "Kechirasiz, AI xizmati hozircha sozlanmagan. Administratorga xabar bering yoki keyinroq urinib ko'ring.";
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 600,
        temperature: 0.7,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
      });

      const content = completion.choices?.[0]?.message?.content?.trim();
      if (!content) {
        this.logger.warn(
          'OpenAI bo\'sh javob qaytardi: ' + JSON.stringify(completion),
        );
        return 'Kechirasiz, javob hosil qilishda muammo yuzaga keldi. Iltimos, savolingizni boshqacha so\'zlar bilan yozib ko\'ring.';
      }

      return content;
    } catch (error: any) {
      return this.handleOpenAIError(error);
    }
  }

  private handleOpenAIError(error: any): string {
    const status: number | undefined = error?.status || error?.response?.status;
    const code: string | undefined = error?.code || error?.error?.code;
    const errMessage: string =
      error?.message || error?.error?.message || 'Noma\'lum xato';

    this.logger.error(
      `OpenAI xatosi: status=${status} code=${code} message=${errMessage}`,
      error?.stack,
    );

    if (status === 401 || code === 'invalid_api_key') {
      return "Kechirasiz, AI xizmatida autentifikatsiya muammosi. Administratorga xabar bering — OpenAI kaliti yangilanishi kerak.";
    }

    if (status === 429 || code === 'rate_limit_exceeded') {
      return "Hozir juda ko'p so'rovlar bor. Iltimos, bir necha soniyadan so'ng qayta urinib ko'ring.";
    }

    if (status === 429 && /quota/i.test(errMessage)) {
      return "Kechirasiz, AI xizmati kvotasiga yetdi. Administratorga xabar bering.";
    }

    if (code === 'insufficient_quota' || /quota|billing/i.test(errMessage)) {
      return "Kechirasiz, AI xizmati balansini to'ldirish kerak. Administratorga xabar bering.";
    }

    if (status === 404 || code === 'model_not_found') {
      return `Kechirasiz, AI modeli (${this.model}) topilmadi. Administratorga xabar bering.`;
    }

    if (
      error?.name === 'APIConnectionTimeoutError' ||
      error?.name === 'APIConnectionError' ||
      /timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(errMessage)
    ) {
      return "Internet aloqasida muammo bor. Iltimos, bir oz kutib, qayta urinib ko'ring.";
    }

    if (status && status >= 500) {
      return "OpenAI serverida vaqtinchalik nosozlik. Iltimos, bir necha daqiqadan keyin urinib ko'ring.";
    }

    return "Kechirasiz, javob berishda texnik xatolik yuz berdi. Iltimos, savolingizni qayta yuboring.";
  }

  async getSessionsByUser(userId: number) {
    return this.prisma.chatSession.findMany({
      where: { userId, isActive: true },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async closeSession(sessionId: string) {
    return this.prisma.chatSession.update({
      where: { sessionId },
      data: { isActive: false },
    });
  }
}
