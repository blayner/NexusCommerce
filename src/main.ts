import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp } from './bootstrap';
import { appConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  // rawBody is required to verify HMAC signatures of payment webhooks.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  await app.listen(config.port);

  Logger.log(
    `NexusCommerce listening on http://localhost:${config.port}/${API_PREFIX}`,
    'Bootstrap',
  );
}

void bootstrap();
