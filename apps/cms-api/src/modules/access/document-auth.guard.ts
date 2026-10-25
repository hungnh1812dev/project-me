import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, isObservable } from 'rxjs';

import { JwtAuthGuard } from '../identity';
import { type ActorContext } from './domain/ActorContext.entity';
import { AnonymousActorService } from './anonymous-actor.service';
import { API_TOKEN } from './domain/ApiToken.rules';
import { ApiTokenAuthenticator, BEARER_PATTERN } from './api-token.guard';

/** What this guard leaves on `req.user` for `PermissionGuard` and the controller. */
export interface DocumentRequest extends Request {
  user: { actor: ActorContext };
}

/**
 * Who is reading content (SPEC §1, D5). One guard for the three kinds:
 * - no `Authorization` header: the anonymous `public` actor;
 * - `Bearer ak_live_...`: an API token (`ApiTokenAuthenticator`);
 * - any other `Authorization` header: a JWT session (`JwtAuthGuard`).
 * A credential that is present but invalid is always 401: it never falls
 * back to anonymous, so a broken or revoked token cannot be mistaken for a
 * public read.
 * Use it before `PermissionGuard`: `@UseGuards(DocumentAuthGuard, PermissionGuard)`.
 */
@Injectable()
export class DocumentAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly tokens: ApiTokenAuthenticator,
    private readonly anonymous: AnonymousActorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (header === undefined) {
      (request as DocumentRequest).user = {
        actor: await this.anonymous.actor(),
      };
      return true;
    }
    if (BEARER_PATTERN.exec(header)?.[1]?.startsWith(API_TOKEN.PREFIX)) {
      await this.tokens.authenticate(request);
      return true;
    }
    const result = this.jwt.canActivate(context);
    return isObservable(result) ? firstValueFrom(result) : result;
  }
}
