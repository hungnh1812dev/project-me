import type { NestExpressApplication } from '@nestjs/platform-express';

import { API_PREFIX } from './common/constants/api.constants';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_PREFLIGHT_MAX_AGE_SECONDS,
  EXPRESS_SETTINGS,
} from './common/constants/http.constants';
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
  // D14: only the configured admin origin, never a wildcard or a reflected origin.
  if (config.cors.allowedOrigins.length > 0) {
    app.enableCors({
      origin: [...config.cors.allowedOrigins],
      credentials: true,
      methods: [...CORS_ALLOWED_METHODS],
      allowedHeaders: [...CORS_ALLOWED_HEADERS],
      exposedHeaders: [...CORS_EXPOSED_HEADERS],
      maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
    });
  }
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
