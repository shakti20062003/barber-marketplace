import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // WEB_APP_URL may be a comma-separated list (e.g. deployed web URL + localhost).
  const origins = (config.get<string>('WEB_APP_URL') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  await app.listen(config.get<number>('PORT', 4000));
}
await bootstrap();
