// Salon working hours ("09:00") are local wall-clock times. Servers (Render)
// run in UTC, which made slots start at 2:30 PM IST. All date maths in the
// API assumes the salon timezone, so pin it before anything reads the clock.
process.env.TZ ||= 'Asia/Kolkata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // On-device photo uploads arrive as (already downscaled) data URLs.
  app.useBodyParser('json', { limit: '3mb' });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // WEB_APP_URL may be a comma-separated list (e.g. deployed web URL + localhost).
  // WEB_APP_URL_PATTERN optionally allows a regex of origins too (e.g. Render's
  // suffixed service URLs, which aren't known until the service is created).
  const origins: (string | RegExp)[] = (config.get<string>('WEB_APP_URL') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const pattern = config.get<string>('WEB_APP_URL_PATTERN');
  if (pattern) origins.push(new RegExp(pattern));
  app.enableCors({ origin: origins, credentials: true });

  await app.listen(config.get<number>('PORT', 4000));
}
await bootstrap();
