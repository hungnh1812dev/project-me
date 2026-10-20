import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { loadAppConfig } from '../../src/config/app-config';

/** A provider value to replace, e.g. a small store cap. */
export interface ProviderOverride {
  readonly token: symbol;
  readonly value: unknown;
}

/**
 * Builds the app exactly like `bootstrap`, without listening on a port.
 * `overrides` swap provider values through `@nestjs/testing`.
 */
export async function createTestApp(
  rawEnv: Record<string, string | undefined>,
  overrides: readonly ProviderOverride[] = [],
): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const app = await createApp(AppModule.forRoot(config), overrides);
  configureApp(app, config);
  await app.init();
  return app;
}

async function createApp(
  root: ReturnType<typeof AppModule.forRoot>,
  overrides: readonly ProviderOverride[],
): Promise<NestExpressApplication> {
  if (overrides.length === 0) {
    return NestFactory.create<NestExpressApplication>(root, { logger: false });
  }
  let builder = Test.createTestingModule({ imports: [root] });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  return moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
}
