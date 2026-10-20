import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  JWT_ALGORITHM,
  JWT_STRATEGY_NAME,
} from '../../common/constants/auth.constants';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  type AccessTokenClaims,
  accessTokenClaimsSchema,
  AccessTokenService,
} from './access-token.service';

/** What `JwtAuthGuard` puts on `req.user`. */
export interface AuthenticatedAccount {
  /** `accounts.document_id`. */
  readonly accountId: string;
  readonly tokenVersion: number;
  readonly policyVersion: number;
}

export interface AuthenticatedRequest extends RequestWithId {
  user: AuthenticatedAccount;
}

/**
 * Bearer access tokens (D9, D14). HS256 only: passport-jwt passes
 * `algorithms` to jsonwebtoken, which rejects every other alg and `none`.
 * `tv` is checked against the database on every request (§12-10, T12), so
 * a password write or refresh-token reuse kills old access tokens at once.
 * Caching it and checking `pv` is T15.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    tokens: AccessTokenService,
    private readonly prisma: PrismaService,
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
    const claims: AccessTokenClaims = parsed.data;
    // TODO(T15): VersionCache (invalidated on write, 5 s TTL) instead of
    // this uncached lookup, and compare claims.pv with roles.policy_version.
    const account = await this.prisma.account.findUnique({
      where: { documentId: claims.sub },
      select: { tokenVersion: true, status: true, deletedAt: true },
    });
    if (
      account === null ||
      account.tokenVersion !== claims.tv ||
      account.status !== 'active' ||
      account.deletedAt !== null
    ) {
      throw new UnauthorizedException();
    }
    return {
      accountId: claims.sub,
      tokenVersion: claims.tv,
      policyVersion: claims.pv,
    };
  }
}

/** Requires a valid Bearer access token; 401 in the unified error shape otherwise. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {}
