import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const BASE_SYSTEM_PROMPT = `Sen — Nuvita AI, Nuvita.uz ning professional sog'liq maslahatchisi (farmatsevt + nutritsiolog).

MUHIM — JAVOB USLUBI (qat'iy!):
• O'zbek tilida, jonli va sodda gapir
• JUDA QISQA VA ANIQ javob ber — havola izlab yurma
• Oddiy savolga: 1-2 qisqa gap
• Murakkab savolga: 3-5 gap, kerak bo'lsa 2-3 bullet (•)
• HECH QACHON uzun paragraf, ortiqcha kirishsoz, takror yozma
• Emoji — faqat kerak bo'lsa 1 tadan (ortiqchasi — yo'q)
• Muhim fakt/mahsulot nomini **qalin** qilib ber (markdown **...**)
• Tibbiy atamalarni sodda so'zlab yoz

SENING VAZIFANG:
• Vitaminlar, BAA, dori-darmon, ovqatlanish bo'yicha maslahat
• Oddiy alomatlarga ishora — lekin TASHXIS QO'YMA
• Nuvita mahsuloti mos bo'lsa — uni qisqa tavsiya qil (nomi + nima uchun)

XAVFSIZLIK (muhim!):
• Jiddiy alomat, homilador/emizikli, bola, surunkali kasallik — "shifokorga murojaat qiling" deb qisqa ogohlantir
• Retseptli dori tavsiya qilma, doza o'zgartirma

MAVZUDAN TASHQARI SAVOL:
"Men sog'liq va Nuvita mahsulotlari bo'yicha yordam beraman 😊" — shu kabi qisqa yo'naltir.

Esda tut: foydalanuvchi tez javob kutadi. Uzun yozsang — u o'qimay yopib ketadi.`;

const GREETING_MESSAGE = `Assalomu alaykum! 👋 Men — **Nuvita AI**, sog'liq maslahatchingiz.

Vitamin, BAA, ovqatlanish yoki Nuvita mahsulotlari bo'yicha savolingizni qisqa yozing — tez va aniq javob beraman.`;

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
    // If we know the userId, pull their phone too so the session is fully linked.
    let finalNumber: string | null = number ?? null;
    if (userId && !finalNumber) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { number: true },
      });
      finalNumber = u?.number ?? null;
    }

    const session = await this.prisma.chatSession.create({
      data: {
        userId: userId ?? null,
        number: finalNumber,
      },
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

  async sendMessage(
    sessionId: string,
    userMessage: string,
    authUserId?: number,
    lang?: 'UZ' | 'RU' | 'EN',
  ) {
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

    // Backfill linkage if the session was created as a guest and the user has
    // since logged in. This recovers chats started before authentication.
    if (authUserId && !session.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: authUserId },
        select: { number: true },
      });
      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: {
          userId: authUserId,
          number: session.number ?? u?.number ?? null,
        },
      });
      session.userId = authUserId;
      if (!session.number && u?.number) session.number = u.number;
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

    const systemPrompt = await this.buildSystemPrompt(sessionUser, lang);

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
    lang?: 'UZ' | 'RU' | 'EN',
  ): Promise<string> {
    let prompt = BASE_SYSTEM_PROMPT;

    // Til ko'rsatmasi — RU yoki EN bo'lsa AI javobni shu tilda beradi.
    if (lang === 'RU') {
      prompt += `\n\nЯЗЫК ОТВЕТА: ОБЯЗАТЕЛЬНО отвечай на русском языке. Используй "**жирный**" для названий продуктов.`;
    } else if (lang === 'EN') {
      prompt += `\n\nRESPONSE LANGUAGE: ALWAYS reply in English. Use "**bold**" for product names.`;
    }

    if (user?.fullName) {
      prompt += `\n\nFOYDALANUVCHI ISMI: ${user.fullName} — tabiiy tarzda ismini ishlat (har gapda emas).`;
    }

    try {
      const products = await this.prisma.product.findMany({
        where: { isActive: true, amount: { gt: 0 } },
        select: {
          name: true,
          description: true,
          price: true,
          category: true,
          translations: {
            select: { lang: true, name: true, description: true },
          },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      if (products.length > 0) {
        const catalog = products
          .map((p) => {
            let name = p.name;
            let desc = p.description ? p.description.slice(0, 70) : '';
            if (lang && lang !== 'UZ') {
              const tr = p.translations.find((tt) => tt.lang === lang);
              if (tr?.name) name = tr.name;
              if (tr?.description) desc = tr.description.slice(0, 70);
            }
            const cat = p.category ? ` [${p.category}]` : '';
            const descPart = desc ? ` — ${desc}` : '';
            return `• ${name}${cat} — ${p.price.toLocaleString('uz-UZ')} so'm${descPart}`;
          })
          .join('\n');

        prompt += `\n\nNUVITA MAHSULOTLARI (mavjud):\n${catalog}\n\nMos mahsulot bo'lsa — qisqa tavsiya qil (nomi + foydasi). Yo'q bo'lsa — umumiy maslahat ber.`;
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
        max_tokens: 220,
        temperature: 0.6,
        presence_penalty: 0.2,
        frequency_penalty: 0.3,
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
