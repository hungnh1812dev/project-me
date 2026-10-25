import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  ApiTokenAuthentication,
  type AuthenticatedApiToken,
} from './application/ApiTokenAuthentication.service';

/** `Authorization: Bearer <credential>`; group 1 is the credential. */
export const BEARER_PATTERN = /^Bearer (\S+)$/i;

export interface ApiTokenRequest extends Request {
  user: AuthenticatedApiToken;
}

/**
 * Reads the bearer credential off the request and leaves the token's
 * principal on `request.user`. The checks are `ApiTokenAuthentication`'s.
 */
@Injectable()
export class ApiTokenAuthenticator {
  constructor(private readonly authentication: ApiTokenAuthentication) {}

  /** Sets `request.user` to the token's principal. @throws UnauthorizedException */
  async authenticate(request: Request): Promise<void> {
    const header = request.headers.authorization;
    const raw =
      header === undefined ? undefined : BEARER_PATTERN.exec(header)?.[1];
    if (raw === undefined) throw new UnauthorizedException();
    (request as ApiTokenRequest).user =
      await this.authentication.authenticate(raw);
  }
}

/**
 * Guard for content routes that accept an API token: `@UseGuards(ApiTokenGuard,
 * PermissionGuard)`. It only delegates, so a module that imports AccessModule
 * can use it without providing the authenticator's dependencies itself.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly authenticator: ApiTokenAuthenticator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.authenticator.authenticate(
      context.switchToHttp().getRequest<Request>(),
    );
    return true;
  }
}
