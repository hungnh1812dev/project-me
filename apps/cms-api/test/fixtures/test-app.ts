import type { DynamicModule, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/App.module';
import { configureApp } from '../../src/App.setup';
import { loadAppConfig } from '../../src/config/AppConfig.setup';

/** A provider value to replace, e.g. a small store cap. */
export interface ProviderOverride {
  /** A DI token: a symbol or a provider class. */
  readonly token: symbol | Type;
  readonly value: unknown;
}

/**
 * Builds the app exactly like `bootstrap`, without listening on a port.
 * `overrides` swap provider values through `@nestjs/testing`; `testModules`
 * add test-only modules (e.g. a probe controller), never production routes.
 */
export async function createTestApp(
  rawEnv: Record<string, string | undefined>,
  overrides: readonly ProviderOverride[] = [],
  testModules: readonly (Type | DynamicModule)[] = [],
): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const app = await createApp(
    AppModule.forRoot(config),
    overrides,
    testModules,
  );
  configureApp(app, config);
  await app.init();
  return app;
}

async function createApp(
  root: ReturnType<typeof AppModule.forRoot>,
  overrides: readonly ProviderOverride[],
  testModules: readonly (Type | DynamicModule)[],
): Promise<NestExpressApplication> {
  if (overrides.length === 0 && testModules.length === 0) {
    return NestFactory.create<NestExpressApplication>(root, { logger: false });
  }
  let builder = Test.createTestingModule({ imports: [root, ...testModules] });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  return moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
}
