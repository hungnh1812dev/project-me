import type { NestExpressApplication } from '@nestjs/platform-express';

import { API_PREFIX } from './common/constants/api.constants';
import { EXPRESS_SETTINGS } from './common/constants/http.constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { type IAppConfig } from './config/app-config';

/**
 * Pipeline shared by `main.ts` and the integration tests, so tests run
 * against exactly what production boots.
 */
export function configureApp(
  app: NestExpressApplication,
  config: IAppConfig,
): void {
  // Trailing slash tolerated (SPEC §6); clients strip it, Traefik never rewrites.
  app.set(EXPRESS_SETTINGS.STRICT_ROUTING, false);
  // D7: trust exactly N proxy hops, never `true`.
  app.set(EXPRESS_SETTINGS.TRUST_PROXY, config.http.trustProxyHops);
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
