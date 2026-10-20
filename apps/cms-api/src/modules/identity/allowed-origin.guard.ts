import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  ORIGIN_HEADER,
} from '../../common/constants/auth.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';

/**
 * D14 CSRF defence for the cookie endpoints (`/auth/refresh`, `/auth/logout`):
 * the `Origin` header must exactly match the web or admin origin. A missing
 * Origin is refused too, so non-browser replays of a stolen cookie need the
 * header spelled out.
 */
@Injectable()
export class AllowedOriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.allowed = new Set(config.auth.cookieOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const origin = context
      .switchToHttp()
      .getRequest<Request>()
      .get(ORIGIN_HEADER);
    if (origin !== undefined && this.allowed.has(origin)) return true;
    throw new ForbiddenException({
      errorCode: AUTH_ERROR_CODES.ORIGIN_NOT_ALLOWED,
      message: AUTH_ERROR_MESSAGES.ORIGIN_NOT_ALLOWED,
    });
  }
}
