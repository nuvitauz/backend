import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const SYSTEM_PROMPT = `Sen Nuvita AI - professional tibbiyot maslahatchi va ekspert doktorsan. 

O'zbekiston Nuvita.uz platformasida mijozlarga yordam berasan.

QOIDALAR:
1. Javoblar qisqa, aniq va professional bo'lsin (2-4 gap)
2. Faqat sog'liq, ovqatlanish, vitaminlar va Nuvita mahsulotlari haqida gapir
3. Mavzudan tashqari savollarga javob berma - "Kechirasiz, men faqat sog'liq va Nuvita mahsulotlari bo'yicha yordam bera olaman" de
4. Har doim o'zbek tilida javob ber
5. Jiddiy kasalliklar uchun shifokorga murojaat qilishni maslahat ber
6. Do'stona va samimiy bo'l

Sen professional tibbiyot maslahatchi va ekspert doktorsan.`;

const GREETING_MESSAGE = `Assalomu alaykum! 👋

Men Nuvita AI - sizning shaxsiy sog'liq maslahatchangizman.

Qanday yordam bera olaman:
• Vitaminlar va qo'shimchalar haqida maslahat
• Sog'lom ovqatlanish bo'yicha tavsiyalar  
• Nuvita mahsulotlarini tanlashda yordam

Savolingizni yozing! 😊`;

@Injectable()
export class ChatService {
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('GPT_KEY') || '';
    if (!this.apiKey) {
      console.warn('GPT_KEY is not defined in the environment variables.');
    }
  }

  async createSession(userId?: number, number?: string) {
    const session = await this.prisma.chatSession.create({
      data: {
        userId,
        number,
      },
    });

    // Add greeting message
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
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return null;
    }

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
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20, // Last 20 messages for context
        },
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Save user message
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        content: userMessage,
      },
    });

    // Build conversation history for GPT
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...session.messages.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    // Call OpenAI API
    const aiResponse = await this.callOpenAI(messages);

    // Save AI response
    const savedMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: aiResponse,
      },
    });

    return {
      id: savedMessage.id,
      role: 'ASSISTANT',
      content: aiResponse,
      createdAt: savedMessage.createdAt,
    };
  }

  private async callOpenAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);
        return "Kechirasiz, hozir javob bera olmayapman. Iltimos, keyinroq urinib ko'ring.";
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "Javob olishda xatolik yuz berdi.";
    } catch (error) {
      console.error('OpenAI API call failed:', error);
      return "Kechirasiz, texnik nosozlik yuz berdi. Iltimos, keyinroq urinib ko'ring.";
    }
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
