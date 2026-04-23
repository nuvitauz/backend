import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  number?: string;
}

export class SendMessageDto {
  @IsString()
  sessionId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  lang?: 'UZ' | 'RU' | 'EN';
}

export class ChatMessageResponse {
  id!: number;
  role!: 'USER' | 'ASSISTANT';
  content!: string;
  createdAt!: Date;
}

export class ChatSessionResponse {
  sessionId!: string;
  messages!: ChatMessageResponse[];
  createdAt!: Date;
}
