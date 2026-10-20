import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { loadAppConfig } from '../../src/config/app-config';

/** Builds the app exactly like `bootstrap`, without listening on a port. */
export async function createTestApp(
  rawEnv: Record<string, string | undefined>,
): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { logger: false },
  );
  configureApp(app, config);
  await app.init();
  return app;
}
