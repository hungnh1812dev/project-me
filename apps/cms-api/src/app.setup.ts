import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { API_PREFIX, API_ROUTES } from './common/constants/api.constants';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  CORS_PREFLIGHT_MAX_AGE_SECONDS,
  EXPRESS_SETTINGS,
} from './common/constants/http.constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { securityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { type IAppConfig } from './config/app-config';
import { bulkBodyLimit } from './modules/documents/bulk-body-limit.middleware';
import { graphqlBodyLimit } from './modules/graphql/graphql-body-limit.middleware';

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
  // D17: no framework fingerprint on any response.
  app.set(EXPRESS_SETTINGS.X_POWERED_BY, false);
  // D17: first in the chain, so parser errors (413/415) and CORS preflights carry it too.
  app.use(securityHeadersMiddleware);
  app.use(requestIdMiddleware);
  // Populates req.cookies; only the auth refresh/logout routes read it (D14).
  app.use(cookieParser());
  // D18: the GraphQL body cap (32 KiB) applies before Nest's JSON parser.
  app.use(`/${API_PREFIX}/${API_ROUTES.GRAPHQL}`, graphqlBodyLimit);
  // SPEC §6: bulk bodies may be up to 1 MB (the global parser stops at 100 KB).
  app.use(
    `/${API_PREFIX}/${API_ROUTES.DOCUMENTS.ROOT}/${API_ROUTES.DOCUMENTS.BULK_PREFIX}`,
    bulkBodyLimit,
  );
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
