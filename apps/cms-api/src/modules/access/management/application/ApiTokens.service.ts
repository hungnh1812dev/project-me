import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../../common/time/Clock.service';
import type { ClientMeta } from '../../../../common/types/ClientMeta.entity';
import type {
  PageMeta,
  PageQuery,
} from '../../../../common/validation/SharedSchemas.rules';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../../infrastructure/database/TransactionRunner.port';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditMetadata,
  auditActorOf,
  SecurityAuditService,
} from '../../../security-audit';
import { AccessPolicyService } from '../../application/AccessPolicy.service';
import { VersionCache } from '../../application/VersionCache.service';
import {
  type RolePolicy,
  type TokenScope,
  isOwnerRole,
  parseTokenScope,
} from '../../domain/ActorContext.entity';
import {
  API_TOKEN,
  hashApiToken,
  isApiTokenExpired,
} from '../../domain/ApiToken.rules';
import type { AccountActor } from '../../domain/Rank.rules';
import {
  scopeEntriesBeyondCreator,
  validateTokenScope,
} from '../../domain/TokenScope.rules';
import {
  API_TOKEN_STATUSES,
  API_TOKEN_UPDATABLE_FIELDS,
  type ApiTokenStatus,
  MANAGEMENT_AUDIT_SUBJECTS,
} from '../domain/AccessManagement.constants';
import {
  expiryNotInFuture,
  invalidIssues,
  tokenExpired,
  tokenNotFound,
  tokenRevoked,
  tokenScopeNotHeld,
  tokenScopeTooLarge,
} from '../domain/AccessManagement.errors';
import {
  API_TOKEN_ADMIN_REPOSITORY,
  type ApiTokenAdminRepository,
  type ManagedApiToken,
} from './AccessManagement.port';

/** `POST /api-tokens` body, already validated. `scope` is checked here. */
export interface ApiTokenCreation {
  readonly name: string;
  readonly scope: unknown;
  readonly expiresAt?: Date | null | undefined;
}

/** `PATCH /api-tokens/:id` body, already validated. */
export interface ApiTokenUpdate {
  readonly name?: string | undefined;
  readonly scope?: unknown;
  readonly expiresAt?: Date | null | undefined;
}

/** `GET /api-tokens` item. Never the raw token or its hash. */
export interface ApiTokenView {
  readonly id: string;
  readonly name: string;
  /** Leading characters of the raw token, to tell tokens apart. */
  readonly tokenPrefix: string;
  readonly scope: TokenScope;
  readonly status: ApiTokenStatus;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly createdBy: { readonly id: string; readonly displayName: string };
}

/** `POST /api-tokens`: the only response that ever holds the raw token. */
export interface CreatedApiTokenView extends ApiTokenView {
  readonly token: string;
}

export interface ApiTokenPage {
  readonly data: ApiTokenView[];
  readonly meta: PageMeta;
}

/** Why an update is refused, per status. A new inactive status adds one entry here. */
const UPDATE_BLOCKED_BY_STATUS = {
  [API_TOKEN_STATUSES.REVOKED]: tokenRevoked,
  [API_TOKEN_STATUSES.EXPIRED]: tokenExpired,
} as const;

/** 400 TOKEN_SCOPE_INVALID when the raw scope has too many entries (before parsing). */
function assertScopeSize(input: unknown): void {
  const permissions =
    typeof input === 'object' && input !== null
      ? (input as { permissions?: unknown }).permissions
      : undefined;
  if (
    Array.isArray(permissions) &&
    permissions.length > API_TOKEN.MAX_SCOPE_ENTRIES
  ) {
    throw tokenScopeTooLarge();
  }
}

function subjectsOf(scope: TokenScope): string[] {
  return [...new Set(scope.permissions.map((entry) => entry.subject))];
}

/**
 * API tokens (SPEC D5). Create, update and revoke run only for a
 * signed-in account (the controller's `requireAccountActor`; a token cannot
 * reach this controller). Each write and its audit row share a transaction.
 */
@Injectable()
export class ApiTokensService {
  constructor(
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(API_TOKEN_ADMIN_REPOSITORY)
    private readonly tokens: ApiTokenAdminRepository,
    private readonly access: AccessPolicyService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  /** The Owner sees every token; anyone else only the tokens they created. */
  async list(actor: AccountActor, query: PageQuery): Promise<ApiTokenPage> {
    const { page, pageSize } = query;
    const { rows, total } = await this.tokens.listPage(
      isOwnerRole(actor.role) ? undefined : actor.accountId,
      page,
      pageSize,
    );
    return {
      data: rows.map((row) => this.view(row)),
      meta: { page, pageSize, total },
    };
  }

  async create(
    actor: AccountActor,
    input: ApiTokenCreation,
    meta: ClientMeta,
  ): Promise<CreatedApiTokenView> {
    const scope = await this.checkedScope(input.scope, actor.role);
    const expiresAt = this.checkedExpiry(input.expiresAt ?? null);

    const raw = `${API_TOKEN.PREFIX}${randomBytes(API_TOKEN.RANDOM_BYTES).toString('base64url')}`;
    const row = await this.runner.run(async (unit) => {
      const created = await this.tokens.create(unit, {
        name: input.name,
        tokenPrefix: raw.slice(0, API_TOKEN.DISPLAY_PREFIX_LENGTH),
        tokenHash: hashApiToken(raw),
        scope,
        expiresAt,
        creatorId: actor.accountId,
      });
      await this.record(unit, actor, created.documentId, meta, {
        action: AUDIT_ACTIONS.API_TOKEN_CREATED,
        metadata: {
          subjects: subjectsOf(scope),
          permissionCount: scope.permissions.length,
          hasExpiry: expiresAt !== null,
        },
      });
      return created;
    });
    return { ...this.view(row), token: raw };
  }

  async update(
    actor: AccountActor,
    documentId: string,
    input: ApiTokenUpdate,
    meta: ClientMeta,
  ): Promise<ApiTokenView> {
    // Validated before the transaction; the subset check needs the row's creator.
    const { catalog } = await this.access.policy();
    let scope: TokenScope | undefined;
    if (input.scope !== undefined) {
      assertScopeSize(input.scope);
      const validated = validateTokenScope(input.scope, catalog);
      if (!validated.ok) throw invalidIssues(validated.issues);
      scope = validated.value;
    }
    const expiresAt =
      input.expiresAt === undefined
        ? undefined
        : this.checkedExpiry(input.expiresAt);

    const row = await this.runner.run(async (unit) => {
      const current = await this.lockManageable(unit, actor, documentId);
      const status = this.statusOf(current);
      if (status !== API_TOKEN_STATUSES.ACTIVE) {
        throw UPDATE_BLOCKED_BY_STATUS[status]();
      }
      if (scope !== undefined) {
        const creatorRole =
          current.createdById === actor.accountId
            ? actor.role
            : await this.creatorRole(current);
        const beyond = scopeEntriesBeyondCreator(scope, creatorRole);
        if (beyond.length > 0) throw tokenScopeNotHeld(beyond);
      }
      const updated = await this.tokens.update(unit, current.id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(scope === undefined ? {} : { scope }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      });
      const fields = API_TOKEN_UPDATABLE_FIELDS.filter(
        (field) => input[field] !== undefined,
      );
      await this.record(unit, actor, updated.documentId, meta, {
        action: AUDIT_ACTIONS.API_TOKEN_UPDATED,
        metadata: {
          fields,
          ...(scope === undefined
            ? {}
            : {
                subjects: subjectsOf(scope),
                permissionCount: scope.permissions.length,
              }),
        },
      });
      return updated;
    });
    return this.view(row);
  }

  /** Revoking twice is a 409: the first revoke is the one in the audit log. */
  async revoke(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    await this.runner.run(async (unit) => {
      const current = await this.lockManageable(unit, actor, documentId);
      if (current.revokedAt !== null) throw tokenRevoked();
      await this.tokens.markRevoked(
        unit,
        current.id,
        new Date(this.clock.now()),
      );
      await this.record(unit, actor, current.documentId, meta, {
        action: AUDIT_ACTIONS.API_TOKEN_REVOKED,
        metadata: {},
      });
    });
  }

  /**
   * Shape + subjects + fields (validateTokenScope), then the D5 subset check
   * against the creator's current role: 400 TOKEN_SCOPE_INVALID or
   * 403 API_TOKEN_SCOPE_NOT_HELD with the offending entry indexes.
   */
  private async checkedScope(
    input: unknown,
    creatorRole: RolePolicy,
  ): Promise<TokenScope> {
    assertScopeSize(input);
    const { catalog } = await this.access.policy();
    const validated = validateTokenScope(input, catalog);
    if (!validated.ok) throw invalidIssues(validated.issues);
    const beyond = scopeEntriesBeyondCreator(validated.value, creatorRole);
    if (beyond.length > 0) throw tokenScopeNotHeld(beyond);
    return validated.value;
  }

  /** An expiry must lie in the future; null means "never". */
  private checkedExpiry(expiresAt: Date | null): Date | null {
    if (isApiTokenExpired(expiresAt, this.clock.now())) {
      throw expiryNotInFuture();
    }
    return expiresAt;
  }

  /** The token creator's current role (the owner updating a token of an admin). */
  private async creatorRole(row: ManagedApiToken): Promise<RolePolicy> {
    const role = await this.versions.getRolePolicy(row.createdBy.roleId);
    if (role === null) throw tokenNotFound();
    return role;
  }

  /**
   * The token, row-locked for this unit. The Owner reaches any token;
   * everyone else only their own, and another account's token is a 404, not
   * a 403: it is not theirs to see (D5).
   */
  private async lockManageable(
    unit: UnitOfWork,
    actor: AccountActor,
    documentId: string,
  ): Promise<ManagedApiToken> {
    const row = await this.tokens.lockByDocumentId(unit, documentId);
    if (
      row === null ||
      (!isOwnerRole(actor.role) && row.createdById !== actor.accountId)
    ) {
      throw tokenNotFound();
    }
    return row;
  }

  private record(
    unit: UnitOfWork,
    actor: AccountActor,
    targetId: string,
    meta: ClientMeta,
    event: { readonly action: AuditAction; readonly metadata: AuditMetadata },
  ): Promise<void> {
    return this.audit.record(unit, {
      actor: auditActorOf(actor),
      action: event.action,
      subject: MANAGEMENT_AUDIT_SUBJECTS.API_TOKENS,
      targetId,
      metadata: event.metadata,
      ip: meta.ip,
    });
  }

  private statusOf(row: ManagedApiToken): ApiTokenStatus {
    if (row.revokedAt !== null) return API_TOKEN_STATUSES.REVOKED;
    if (isApiTokenExpired(row.expiresAt, this.clock.now())) {
      return API_TOKEN_STATUSES.EXPIRED;
    }
    return API_TOKEN_STATUSES.ACTIVE;
  }

  private view(row: ManagedApiToken): ApiTokenView {
    return {
      id: row.documentId,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      scope: parseTokenScope(row.scope),
      status: this.statusOf(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      createdBy: {
        id: row.createdBy.documentId,
        displayName: row.createdBy.displayName,
      },
    };
  }
}
