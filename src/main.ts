import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as bodyParser from 'body-parser';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://nuvita.uz',
  'https://www.nuvita.uz',
];

function getAllowedOrigins() {
  const configuredOrigins = process.env.FRONTEND_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}

async function bootstrap() {
  process.env.TZ = 'Asia/Tashkent';

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Body parser limitlarini oshirish (rasmlar uchun)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.setGlobalPrefix('api');

  // Static assets should be served under /api/ProductPhoto to match API_BASE_URL
  app.useStaticAssets(join(__dirname, '..', 'ProductPhoto'), {
    prefix: '/api/ProductPhoto/',
  });

  app.useStaticAssets(join(__dirname, '..', 'BannerPhoto'), {
    prefix: '/api/BannerPhoto/',
  });

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
