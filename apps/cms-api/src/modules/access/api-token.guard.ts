import { createHash } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { API_TOKEN, BEARER_PATTERN } from './api-token.constants';
import {
  type ActorContext,
  apiTokenActor,
  InvalidPolicyDataError,
  parseTokenScope,
} from './actor-context';
import { VersionCache } from './version-cache';

const LOGGER_CONTEXT = 'ApiTokenGuard';
/** Longest raw token we hash: the prefix plus 43 base64url characters, with room. */
const MAX_RAW_TOKEN_LENGTH = 128;

/** What `ApiTokenGuard` puts on `req.user` (the shape `PermissionGuard` reads). */
export interface AuthenticatedApiToken {
  /** `api_tokens.document_id`. */
  readonly tokenId: string;
  readonly actor: ActorContext;
}

export interface ApiTokenRequest extends Request {
  user: AuthenticatedApiToken;
}

/** SHA-256 (hex) of a raw token: what `api_tokens.token_hash` holds. */
export function hashApiToken(raw: string): string {
  return createHash(API_TOKEN.HASH_ALGORITHM).update(raw).digest('hex');
}

/**
 * D5 token authentication for content endpoints: `Authorization:
 * Bearer ak_live_...`, looked up by the SHA-256 of the raw value. The actor
 * carries the creator's **current** role, so effective permissions are the
 * token scope ∩ the creator's permissions at this request (§12-6).
 *
 * 401, one shape for every reason, when: the header is not a token, the
 * hash is unknown, the token is revoked or expired, its stored scope is
 * malformed, or the creator is disabled, deleted or gone.
 */
@Injectable()
export class ApiTokenAuthenticator {
  private readonly logger = new Logger(LOGGER_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: VersionCache,
    private readonly clock: Clock,
  ) {}

  /** Sets `request.user` to the token's principal. @throws UnauthorizedException */
  async authenticate(request: Request): Promise<void> {
    const raw = this.rawTokenOf(request);
    if (raw === undefined) throw new UnauthorizedException();

    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashApiToken(raw) },
      select: {
        id: true,
        documentId: true,
        scope: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdBy: { select: { documentId: true } },
      },
    });
    const now = this.clock.now();
    if (
      row === null ||
      row.revokedAt !== null ||
      (row.expiresAt !== null && row.expiresAt.getTime() <= now)
    ) {
      throw new UnauthorizedException();
    }

    const creator = await this.versions.account(row.createdBy.documentId);
    if (creator === null || creator.status !== 'active' || creator.deleted) {
      throw new UnauthorizedException();
    }
    const role = await this.versions.rolePolicy(creator.roleId);
    if (role === null) throw new UnauthorizedException();

    let actor: ActorContext;
    try {
      actor = apiTokenActor(
        row.id,
        creator.id,
        role,
        parseTokenScope(row.scope),
      );
    } catch (error) {
      if (!(error instanceof InvalidPolicyDataError)) throw error;
      this.logger.error(`Token ${row.documentId} has a malformed scope.`);
      throw new UnauthorizedException();
    }

    await this.touch(row.id, row.lastUsedAt, now);
    const principal: AuthenticatedApiToken = {
      tokenId: row.documentId,
      actor,
    };
    (request as ApiTokenRequest).user = principal;
  }

  private rawTokenOf(request: Request): string | undefined {
    const header = request.headers.authorization;
    const raw =
      header === undefined ? undefined : BEARER_PATTERN.exec(header)?.[1];
    if (
      raw === undefined ||
      !raw.startsWith(API_TOKEN.PREFIX) ||
      raw.length > MAX_RAW_TOKEN_LENGTH
    ) {
      return undefined;
    }
    return raw;
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
      // Raw, so the `@updatedAt` of the row does not move on every use.
      await this.prisma.$executeRaw`
        UPDATE api_tokens SET last_used_at = ${new Date(now)} WHERE id = ${id}`;
    } catch (error) {
      this.logger.warn(
        `last_used_at not written for token ${id}: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
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
