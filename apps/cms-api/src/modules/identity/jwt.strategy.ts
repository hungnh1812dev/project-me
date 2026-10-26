import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JWT_ALGORITHM } from './domain/Identity.constants';
import { JWT_STRATEGY_NAME } from './http/IdentityHttp.constants';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import {
  type ActorContext,
  accountActor,
  reviewerActor,
  REVIEWER_ROLE_SLUG,
  VersionCache,
} from '../access';
import {
  type AccessTokenClaims,
  accessTokenClaimsSchema,
  AccessTokenService,
} from './application/AccessToken.service';

/** What `JwtAuthGuard` puts on `req.user`. */
export interface AuthenticatedAccount {
  /** `accounts.document_id`. */
  readonly accountId: string;
  readonly tokenVersion: number;
  /** The role's current `policy_version` (may be newer than the token's `pv`). */
  readonly policyVersion: number;
  /** Who is asking, with the role's current permissions. */
  readonly actor: ActorContext;
}

export interface AuthenticatedRequest extends RequestWithId {
  user: AuthenticatedAccount;
}

/**
 * Bearer access tokens (D9, D14). HS256 only: passport-jwt passes
 * `algorithms` to jsonwebtoken, which rejects every other alg and `none`.
 * D9: `tv` and `pv` are compared with the database through
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
    const account = await this.versions.getAccountVersions(
      claims.sub,
      claims.tv,
    );
    if (
      account === null ||
      account.tokenVersion !== claims.tv ||
      account.status !== 'active' ||
      account.isDeleted
    ) {
      throw new UnauthorizedException();
    }
    const role = await this.versions.getRolePolicy(account.roleId, claims.pv);
    if (role === null) throw new UnauthorizedException();
    // D2: a reviewer-role account is always the read-only reviewer actor,
    // whatever the role rows say. No session row = no access.
    let actor = accountActor(account.id, role);
    if (role.slug === REVIEWER_ROLE_SLUG) {
      if (account.reviewerSessionId === null) throw new UnauthorizedException();
      actor = reviewerActor(account.id, account.reviewerSessionId, role);
    }
    return {
      accountId: claims.sub,
      tokenVersion: claims.tv,
      policyVersion: role.policyVersion,
      actor,
    };
  }
}

/** Requires a valid Bearer access token; 401 in the unified error shape otherwise. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {}
