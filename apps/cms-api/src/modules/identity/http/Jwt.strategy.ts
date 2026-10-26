import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { RequestWithId } from '../../../common/middleware/request-id.middleware';
import {
  type AuthenticatedAccount,
  AccessSessionService,
} from '../application/AccessSession.service';
import {
  accessTokenClaimsSchema,
  AccessTokenService,
} from '../application/AccessToken.service';
import { JWT_ALGORITHM } from '../domain/Identity.constants';
import { JWT_STRATEGY_NAME } from './IdentityHttp.constants';

export type { AuthenticatedAccount };

export interface AuthenticatedRequest extends RequestWithId {
  user: AuthenticatedAccount;
}

/**
 * Bearer access tokens (D9, D14). HS256 only: passport-jwt passes
 * `algorithms` to jsonwebtoken, which rejects every other alg and `none`.
 * Passport glue only: the version checks live in `AccessSessionService`,
 * and `validate` never returns before calling it.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    tokens: AccessTokenService,
    private readonly sessions: AccessSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      algorithms: [JWT_ALGORITHM],
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _req: unknown,
        rawToken: string,
        done: (error: unknown, key?: string) => void,
      ) => {
        const key = tokens.keyFor(rawToken);
        if (key === undefined) done(new UnauthorizedException());
        else done(null, key);
      },
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedAccount> {
    const parsed = accessTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) throw new UnauthorizedException();
    return await this.sessions.authenticate(parsed.data);
  }
}

/** Requires a valid Bearer access token; 401 in the unified error shape otherwise. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {}
