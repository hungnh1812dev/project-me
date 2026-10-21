import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  JWT_ALGORITHM,
  JWT_STRATEGY_NAME,
} from '../../common/constants/auth.constants';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { type ActorContext, accountActor } from '../access/actor-context';
import { VersionCache } from '../access/version-cache';
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
  /** The role's current `policy_version` (may be newer than the token's `pv`). */
  readonly policyVersion: number;
  /** Who is asking, with the role's current permissions (T14/T15). */
  readonly actor: ActorContext;
}

export interface AuthenticatedRequest extends RequestWithId {
  user: AuthenticatedAccount;
}

/**
 * Bearer access tokens (D9, D14). HS256 only: passport-jwt passes
 * `algorithms` to jsonwebtoken, which rejects every other alg and `none`.
 * D9 / T15: `tv` and `pv` are compared with the database through
 * VersionCache on every request.
 * - `tv` below the account's token_version (password write, refresh-token
 *   reuse, 2FA reset), or an account that is not active -> 401.
 * - `pv` never rejects: the request is evaluated with the role's current
 *   permissions, so a permission change applies on the next request with
 *   the same token (§12-11). A `pv` above the cached version forces a
 *   re-read of the role.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    tokens: AccessTokenService,
    private readonly versions: VersionCache,
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
    const account = await this.versions.account(claims.sub, claims.tv);
    if (
      account === null ||
      account.tokenVersion !== claims.tv ||
      account.status !== 'active' ||
      account.deleted
    ) {
      throw new UnauthorizedException();
    }
    const role = await this.versions.rolePolicy(account.roleId, claims.pv);
    if (role === null) throw new UnauthorizedException();
    return {
      accountId: claims.sub,
      tokenVersion: claims.tv,
      policyVersion: role.policyVersion,
      actor: accountActor(account.id, role),
    };
  }
}

/** Requires a valid Bearer access token; 401 in the unified error shape otherwise. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {}
