import { Injectable } from '@nestjs/common';

import {
  type ActorContext,
  accountActor,
  reviewerActor,
  REVIEWER_ROLE_SLUG,
  VersionCache,
} from '../../access';
import { notSignedIn } from '../domain/Identity.errors';
import type { AccessTokenClaims } from './AccessToken.service';

/** What a verified access token resolves to on every request. */
export interface AuthenticatedAccount {
  /** `accounts.document_id`. */
  readonly accountId: string;
  readonly tokenVersion: number;
  /** The role's current `policy_version` (may be newer than the token's `pv`). */
  readonly policyVersion: number;
  /** Who is asking, with the role's current permissions. */
  readonly actor: ActorContext;
}

/**
 * D9: `tv` and `pv` are compared with the database through VersionCache on
 * every request.
 * - `tv` below the account's token_version (password write, refresh-token
 *   reuse, 2FA reset), or an account that is not active -> 401.
 * - `pv` never rejects: the request is evaluated with the role's current
 *   permissions, so a permission change applies on the next request with
 *   the same token (§12-11). A `pv` above the cached version forces a
 *   re-read of the role.
 */
@Injectable()
export class AccessSessionService {
  constructor(private readonly versions: VersionCache) {}

  async authenticate(claims: AccessTokenClaims): Promise<AuthenticatedAccount> {
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
      throw notSignedIn();
    }
    const role = await this.versions.getRolePolicy(account.roleId, claims.pv);
    if (role === null) throw notSignedIn();
    // D2: a reviewer-role account is always the read-only reviewer actor,
    // whatever the role rows say. No session row = no access.
    let actor = accountActor(account.id, role);
    if (role.slug === REVIEWER_ROLE_SLUG) {
      if (account.reviewerSessionId === null) throw notSignedIn();
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
