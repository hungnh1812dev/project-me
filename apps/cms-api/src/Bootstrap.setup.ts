import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './App.module';
import { configureApp } from './App.setup';
import { loadAppConfig } from './config/AppConfig.setup';
import { summarizeConfig } from './config/ConfigSummary.rules';

/** Slow media uploads on poor links must finish; Node's default is 5 min. headersTimeout stays default. */
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

type RawEnv = Readonly<Record<string, string | undefined>>;

/** Validates config first (fail fast), then builds and starts the app. */
export async function bootstrap(rawEnv: RawEnv): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
  });
  configureApp(app, config);

  app.getHttpServer().requestTimeout = REQUEST_TIMEOUT_MS;

  logger.log(`Config: ${JSON.stringify(summarizeConfig(config))}`);
  await app.listen(config.http.port);
  logger.log(`Listening on port ${config.http.port}`);
  return app;
}
