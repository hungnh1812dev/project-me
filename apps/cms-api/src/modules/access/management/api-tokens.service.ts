import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ClientMeta } from '../../../common/http/client-meta';
import { ACCESS_ERROR_CODES } from '../access.constants';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './access-management.constants';
import {
  invalidRequest,
  type PageMeta,
  type PageQuery,
} from '../../../common/http/request-parsing';
import { AccessPolicyService } from '../access-policy.service';
import {
  type RolePolicy,
  type TokenScope,
  isOwnerRole,
  parseTokenScope,
} from '../actor-context';
import { hashApiToken } from '../api-token.guard';
import { API_TOKEN } from '../api-token.constants';
import {
  API_TOKEN_STATUSES,
  API_TOKEN_UPDATABLE_FIELDS,
  type ApiTokenStatus,
} from './api-tokens.constants';
import type {
  CreateApiTokenRequest,
  UpdateApiTokenRequest,
} from './api-tokens.requests';
import { validateTokenScope } from '../permission.validator';
import type { AccountActor } from '../rank-rules';
import { AUDIT_ACTIONS, type AuditAction } from '../../security-audit';
import {
  type AuditMetadata,
  auditActorOf,
  SecurityAuditService,
} from '../../security-audit';
import { scopeEntriesBeyondCreator } from '../token-scope-subset';
import { VersionCache } from '../version-cache';

type Tx = Prisma.TransactionClient;

const TOKENS_SUBJECT = 'api_tokens';

const TOKEN_SELECT = {
  id: true,
  documentId: true,
  name: true,
  tokenPrefix: true,
  scope: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
  createdById: true,
  createdBy: {
    select: { documentId: true, displayName: true, roleId: true },
  },
} as const;

type TokenRow = Prisma.ApiTokenGetPayload<{ select: typeof TOKEN_SELECT }>;

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

function tokenNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.TOKEN_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.TOKEN_NOT_FOUND,
  });
}

function tokenRevoked(): ConflictException {
  return new ConflictException({
    errorCode: MANAGEMENT_ERROR_CODES.TOKEN_REVOKED,
    message: MANAGEMENT_ERROR_MESSAGES.TOKEN_REVOKED,
  });
}

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
    throw new BadRequestException({
      errorCode: ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
      message: `A token scope holds at most ${API_TOKEN.MAX_SCOPE_ENTRIES} entries.`,
    });
  }
}

function scopeNotHeld(indexes: readonly number[]): ForbiddenException {
  return new ForbiddenException({
    errorCode: MANAGEMENT_ERROR_CODES.TOKEN_SCOPE_NOT_HELD,
    message: MANAGEMENT_ERROR_MESSAGES.TOKEN_SCOPE_NOT_HELD,
    details: { indexes },
  });
}

/** A scope as `Json` input (field lists copied out of their readonly arrays). */
function scopeJson(scope: TokenScope): Prisma.InputJsonObject {
  return {
    permissions: scope.permissions.map((entry) => ({
      subject: entry.subject,
      action: entry.action,
      ...(entry.readableFields === undefined
        ? {}
        : {
            readableFields:
              entry.readableFields === null ? null : [...entry.readableFields],
          }),
      ...(entry.writableFields === undefined
        ? {}
        : {
            writableFields:
              entry.writableFields === null ? null : [...entry.writableFields],
          }),
    })),
  };
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
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  /** The Owner sees every token; anyone else only the tokens they created. */
  async list(actor: AccountActor, query: PageQuery): Promise<ApiTokenPage> {
    const where: Prisma.ApiTokenWhereInput = isOwnerRole(actor.role)
      ? {}
      : { createdById: actor.accountId };
    const { page, pageSize } = query;
    const [rows, total] = await Promise.all([
      this.prisma.apiToken.findMany({
        where,
        select: TOKEN_SELECT,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiToken.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.view(row)),
      meta: { page, pageSize, total },
    };
  }

  async create(
    actor: AccountActor,
    input: CreateApiTokenRequest,
    meta: ClientMeta,
  ): Promise<CreatedApiTokenView> {
    const scope = await this.checkedScope(input.scope, actor.role);
    const expiresAt = this.checkedExpiry(input.expiresAt ?? null);

    const raw = `${API_TOKEN.PREFIX}${randomBytes(API_TOKEN.RANDOM_BYTES).toString('base64url')}`;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiToken.create({
        data: {
          name: input.name,
          tokenPrefix: raw.slice(0, API_TOKEN.DISPLAY_PREFIX_LENGTH),
          tokenHash: hashApiToken(raw),
          scope: scopeJson(scope),
          expiresAt,
          createdBy: { connect: { id: actor.accountId } },
        },
        select: TOKEN_SELECT,
      });
      await this.record(tx, actor, created.documentId, meta, {
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
    input: UpdateApiTokenRequest,
    meta: ClientMeta,
  ): Promise<ApiTokenView> {
    // Validated before the transaction; the subset check needs the row's creator.
    const { catalog } = await this.access.policy();
    let scope: TokenScope | undefined;
    if (input.scope !== undefined) {
      assertScopeSize(input.scope);
      const validated = validateTokenScope(input.scope, catalog);
      if (!validated.ok) throw this.invalidScope(validated.issues);
      scope = validated.value;
    }
    const expiresAt =
      input.expiresAt === undefined
        ? undefined
        : this.checkedExpiry(input.expiresAt);

    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManageable(tx, actor, documentId);
      if (current.revokedAt !== null) throw tokenRevoked();
      if (scope !== undefined) {
        const creatorRole =
          current.createdById === actor.accountId
            ? actor.role
            : await this.creatorRole(current);
        const beyond = scopeEntriesBeyondCreator(scope, creatorRole);
        if (beyond.length > 0) throw scopeNotHeld(beyond);
      }
      const updated = await tx.apiToken.update({
        where: { id: current.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(scope === undefined ? {} : { scope: scopeJson(scope) }),
          ...(expiresAt === undefined ? {} : { expiresAt }),
        },
        select: TOKEN_SELECT,
      });
      const fields = API_TOKEN_UPDATABLE_FIELDS.filter(
        (field) => input[field] !== undefined,
      );
      await this.record(tx, actor, updated.documentId, meta, {
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
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManageable(tx, actor, documentId);
      if (current.revokedAt !== null) throw tokenRevoked();
      await tx.apiToken.update({
        where: { id: current.id },
        data: { revokedAt: new Date(this.clock.now()) },
        select: { id: true },
      });
      await this.record(tx, actor, current.documentId, meta, {
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
    if (!validated.ok) throw this.invalidScope(validated.issues);
    const beyond = scopeEntriesBeyondCreator(validated.value, creatorRole);
    if (beyond.length > 0) throw scopeNotHeld(beyond);
    return validated.value;
  }

  private invalidScope(
    issues: readonly {
      code: string;
      message: string;
      path: (string | number)[];
    }[],
  ): BadRequestException {
    return new BadRequestException({
      errorCode: issues[0]?.code,
      message: issues[0]?.message,
      details: { issues },
    });
  }

  /** An expiry must lie in the future; null means "never". */
  private checkedExpiry(expiresAt: Date | null): Date | null {
    if (expiresAt !== null && expiresAt.getTime() <= this.clock.now()) {
      throw invalidRequest([
        { path: ['expiresAt'], message: 'must be in the future' },
      ]);
    }
    return expiresAt;
  }

  /** The token creator's current role (the owner updating a token of an admin). */
  private async creatorRole(row: TokenRow): Promise<RolePolicy> {
    const role = await this.versions.getRolePolicy(row.createdBy.roleId);
    if (role === null) throw tokenNotFound();
    return role;
  }

  /**
   * The token, row-locked for this transaction. The Owner reaches any token;
   * everyone else only their own, and another account's token is a 404, not
   * a 403: it is not theirs to see (D5).
   */
  private async lockManageable(
    tx: Tx,
    actor: AccountActor,
    documentId: string,
  ): Promise<TokenRow> {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM api_tokens WHERE document_id = ${documentId}::uuid FOR UPDATE`;
    if (locked[0] === undefined) throw tokenNotFound();
    const row = await tx.apiToken.findUnique({
      where: { id: locked[0].id },
      select: TOKEN_SELECT,
    });
    if (
      row === null ||
      (!isOwnerRole(actor.role) && row.createdById !== actor.accountId)
    ) {
      throw tokenNotFound();
    }
    return row;
  }

  private record(
    tx: Tx,
    actor: AccountActor,
    targetId: string,
    meta: ClientMeta,
    event: { readonly action: AuditAction; readonly metadata: AuditMetadata },
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: auditActorOf(actor),
      action: event.action,
      subject: TOKENS_SUBJECT,
      targetId,
      metadata: event.metadata,
      ip: meta.ip,
    });
  }

  private view(row: TokenRow): ApiTokenView {
    const now = this.clock.now();
    let status: ApiTokenStatus = API_TOKEN_STATUSES.ACTIVE;
    if (row.revokedAt !== null) status = API_TOKEN_STATUSES.REVOKED;
    else if (row.expiresAt !== null && row.expiresAt.getTime() <= now) {
      status = API_TOKEN_STATUSES.EXPIRED;
    }
    return {
      id: row.documentId,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      scope: parseTokenScope(row.scope),
      status,
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
