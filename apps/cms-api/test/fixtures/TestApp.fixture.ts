import type { DynamicModule, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/App.module';
import { configureApp } from '../../src/App.setup';
import { loadAppConfig } from '../../src/config/AppConfig.setup';
import { HumanCheckGuard } from '../../src/modules/human-check/http/HumanCheck.guard';

/** A provider value to replace, e.g. a small store cap. */
export interface ProviderOverride {
  /** A DI token: a symbol or a provider class. */
  readonly token: symbol | Type;
  readonly value: unknown;
}

export interface TestAppOptions {
  /**
   * `bypass` (default) lets every `@RequireHumanCheck` route through so the
   * specs that log in keep their bodies; `real` keeps the guard (pair it with
   * a fake `TURNSTILE_VERIFIER` override).
   */
  readonly humanCheck?: 'bypass' | 'real';
}

const PASSING_GUARD = { canActivate: () => true };

/**
 * Builds the app exactly like `bootstrap`, without listening on a port.
 * `overrides` swap provider values through `@nestjs/testing`; `testModules`
 * add test-only modules (e.g. a probe controller), never production routes.
 */
export async function createTestApp(
  rawEnv: Record<string, string | undefined>,
  overrides: readonly ProviderOverride[] = [],
  testModules: readonly (Type | DynamicModule)[] = [],
  options: TestAppOptions = {},
): Promise<NestExpressApplication> {
  const config = loadAppConfig(rawEnv);
  const app = await createApp(
    AppModule.forRoot(config),
    overrides,
    testModules,
    options.humanCheck !== 'real',
  );
  configureApp(app, config);
  await app.init();
  return app;
}

async function createApp(
  root: ReturnType<typeof AppModule.forRoot>,
  overrides: readonly ProviderOverride[],
  testModules: readonly (Type | DynamicModule)[],
  isHumanCheckBypassed: boolean,
): Promise<NestExpressApplication> {
  if (overrides.length === 0 && testModules.length === 0 && !isHumanCheckBypassed) {
    return NestFactory.create<NestExpressApplication>(root, { logger: false });
  }
  let builder = Test.createTestingModule({ imports: [root, ...testModules] });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  if (isHumanCheckBypassed)
    builder = builder.overrideGuard(HumanCheckGuard).useValue(PASSING_GUARD);
  const moduleRef = await builder.compile();
  return moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
}
