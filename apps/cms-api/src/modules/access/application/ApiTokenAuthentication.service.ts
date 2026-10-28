import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/Clock.service';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  API_TOKEN,
  hashApiToken,
  isApiTokenExpired,
} from '../domain/ApiToken.rules';
import {
  type ActorContext,
  apiTokenActor,
  InvalidPolicyDataError,
  parseTokenScope,
  unauthenticated,
} from '../domain/ActorContext.entity';
import { API_TOKEN_LOOKUP, type ApiTokenLookup } from './Access.port';
import { VersionCache } from './VersionCache.service';

const LOGGER_CONTEXT = 'ApiTokenGuard';
/** Longest raw token we hash: the prefix plus 43 base64url characters, with room. */
const MAX_RAW_TOKEN_LENGTH = 128;

/** The principal `ApiTokenGuard` puts on `req.user` (the shape `PermissionGuard` reads). */
export interface AuthenticatedApiToken {
  /** `api_tokens.document_id`. */
  readonly tokenId: string;
  readonly actor: ActorContext;
}

/**
 * D5 token authentication for content endpoints: a raw `ak_live_...` value,
 * looked up by its SHA-256. The actor carries the creator's **current**
 * role, so effective permissions are the token scope ∩ the creator's
 * permissions at this request (§12-6).
 *
 * 401, one shape for every reason, when: the value is not a token, the
 * hash is unknown, the token is revoked or expired, its stored scope is
 * malformed, or the creator is disabled, deleted or gone.
 */
@Injectable()
export class ApiTokenAuthentication {
  constructor(
    @Inject(API_TOKEN_LOOKUP) private readonly tokens: ApiTokenLookup,
    private readonly versions: VersionCache,
    private readonly clock: Clock,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /** @throws DomainError (unauthenticated) */
  async authenticate(raw: string): Promise<AuthenticatedApiToken> {
    if (
      !raw.startsWith(API_TOKEN.PREFIX) ||
      raw.length > MAX_RAW_TOKEN_LENGTH
    ) {
      throw unauthenticated();
    }
    const token = await this.tokens.findByHash(hashApiToken(raw));
    const now = this.clock.now();
    if (
      token === null ||
      token.revokedAt !== null ||
      isApiTokenExpired(token.expiresAt, now)
    ) {
      throw unauthenticated();
    }

    const creator = await this.versions.getAccountVersions(
      token.creatorDocumentId,
    );
    if (creator === null || creator.status !== 'active' || creator.isDeleted) {
      throw unauthenticated();
    }
    const role = await this.versions.getRolePolicy(creator.roleId);
    if (role === null) throw unauthenticated();

    let actor: ActorContext;
    try {
      actor = apiTokenActor(
        token.id,
        creator.id,
        role,
        parseTokenScope(token.scope),
      );
    } catch (error) {
      if (!(error instanceof InvalidPolicyDataError)) throw error;
      this.logger.error(
        `Token ${token.documentId} has a malformed scope.`,
        LOGGER_CONTEXT,
      );
      throw unauthenticated();
    }

    await this.touch(token.id, token.lastUsedAt, now);
    return { tokenId: token.documentId, actor };
  }

  /** Writes `last_used_at` at most once per interval; never fails a request. */
  private async touch(
    id: number,
    lastUsedAt: Date | null,
    now: number,
  ): Promise<void> {
    if (
      lastUsedAt !== null &&
      now - lastUsedAt.getTime() < API_TOKEN.LAST_USED_WRITE_INTERVAL_MS
    ) {
      return;
    }
    try {
      await this.tokens.writeLastUsedAt(id, new Date(now));
    } catch (error) {
      this.logger.warn(
        `last_used_at not written for token ${id}: ${error instanceof Error ? error.name : 'error'}`,
        LOGGER_CONTEXT,
      );
    }
  }
}
