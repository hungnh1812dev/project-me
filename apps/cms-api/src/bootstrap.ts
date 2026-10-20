import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadAppConfig, summarizeConfig } from './config/app-config';

type RawEnv = Readonly<Record<string, string | undefined>>;

/** Validates config first (fail fast), then builds and starts the app. */
export async function bootstrap(
  rawEnv: RawEnv,
): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { bufferLogs: true },
  );
  configureApp(app, config);

  logger.log(`Config: ${JSON.stringify(summarizeConfig(config))}`);
  await app.listen(config.http.port);
  logger.log(`Listening on port ${config.http.port}`);
  return app;
}
