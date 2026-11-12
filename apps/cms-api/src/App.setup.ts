import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { API_PREFIX } from './common/constants/Api.constants';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_PREFLIGHT_MAX_AGE_SECONDS,
  EXPRESS_SETTINGS,
} from './common/constants/Http.constants';
import { HttpExceptionFilter } from './common/filters/HttpException.filter';
import { requestIdMiddleware } from './common/middleware/RequestId.middleware';
import { createRequestTimingMiddleware } from './common/middleware/RequestTiming.middleware';
import { securityHeadersMiddleware } from './common/middleware/SecurityHeaders.middleware';
import { type IAppConfig } from './config/AppConfig.setup';
import { APP_LOGGER, type AppLogger } from './infrastructure/logging/AppLogger.port';
import { BULK_BODY_LIMIT_MOUNT_PATH, bulkBodyLimit } from './modules/documents';
import { GRAPHQL_BODY_LIMIT_MOUNT_PATH, graphqlBodyLimit } from './modules/graphql';
import { HEALTH_ROUTES } from './modules/health';

/**
 * Pipeline shared by `main.ts` and the integration tests, so tests run
 * against exactly what production boots.
 */
export function configureApp(app: NestExpressApplication, config: IAppConfig): void {
  // Trailing slash tolerated (SPEC §6); clients strip it, Traefik never rewrites.
  app.set(EXPRESS_SETTINGS.STRICT_ROUTING, false);
  // D7: trust exactly N proxy hops, never `true`.
  app.set(EXPRESS_SETTINGS.TRUST_PROXY, config.http.trustProxyHops);
  // D17: no framework fingerprint on any response.
  app.set(EXPRESS_SETTINGS.X_POWERED_BY, false);
  // API-1: first of all, so the duration covers every other middleware and parser errors are logged.
  app.use(
    createRequestTimingMiddleware({
      logger: app.get<AppLogger>(APP_LOGGER),
      skippedPathPrefixes: [`/${API_PREFIX}/${HEALTH_ROUTES.ROOT}`],
    }),
  );
  // D17: first header-setting middleware, so parser errors (413/415) and CORS preflights carry it too.
  app.use(securityHeadersMiddleware);
  app.use(requestIdMiddleware);
  // Populates req.cookies; only the auth refresh/logout routes read it (D14).
  app.use(cookieParser());
  // D18: the GraphQL body cap (32 KiB) applies before Nest's JSON parser.
  app.use(GRAPHQL_BODY_LIMIT_MOUNT_PATH, graphqlBodyLimit);
  // SPEC §6: bulk bodies may be up to 1 MB (the global parser stops at 100 KB).
  app.use(BULK_BODY_LIMIT_MOUNT_PATH, bulkBodyLimit);
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
