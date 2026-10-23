import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  formatCardTestSummary,
  loadCardTestEnv,
} from './common/card-test-env';

async function bootstrap() {
  if (process.env.AFTER_CARD_TEST === '1') {
    try {
      const summary = loadCardTestEnv();
      console.log(`[card-test] ${formatCardTestSummary(summary)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao carregar .env.card-test.';
      console.error(message);
      process.exit(1);
    }
  }

  const uploadDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads/' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
