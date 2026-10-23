import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type SqlBool } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AccessPolicyService, type ActorContext } from '../access';
import { ContentDbProvider } from '../content-engine';
import { CONTENT_DB_SCHEMA } from '../content-engine';
import { ContentRegistryProvider } from '../content-engine';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  PRESENCE_MAX_ENTRIES,
  PRESENCE_MESSAGES,
  PRESENCE_TTL_MS,
  type PresenceState,
} from './documents.constants';

/** The only fields a presence response carries (SPEC D16). */
export interface PresenceEntry {
  /** The account's public id (`documentId`, as `GET /auth/me` returns); never the internal numeric id. */
  accountId: string;
  displayName: string;
  state: PresenceState;
  lastSeenAt: string;
}

interface StoredEntry extends PresenceEntry {
  /** Internal key of the caller, never sent. */
  ownerKey: number;
  expiresAt: number;
}

/**
 * SPEC D16 presence: who is editing a document right now. In memory and per
 * process (single replica, like the rate-limit store). A heartbeat needs
 * `update` on the content type and the document's draft row inside the
 * actor's `update` row conditions (else 404, so ids cannot be probed). Only
 * account sessions take part: anonymous, reviewer and API token callers get
 * 403. Entries expire `PRESENCE_TTL_MS` after the last heartbeat.
 */
@Injectable()
export class PresenceService {
  private readonly entries = new Map<string, Map<number, StoredEntry>>();
  private size = 0;

  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
    private readonly content: ContentDbProvider,
    private readonly prisma: PrismaService,
  ) {}

  /** Records the caller's heartbeat and returns everyone active on the document. */
  async heartbeat(
    actor: ActorContext,
    slug: string,
    documentId: string,
    state: PresenceState,
    now: number = Date.now(),
  ): Promise<PresenceEntry[]> {
    if (actor.kind !== 'account') throw new ForbiddenException();
    const { catalog, evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, PermissionAction.update, slug);
    if (!filter.allowed) throw new ForbiddenException();
    if (!catalog.isContentType(slug)) throw new NotFoundException();
    const type = (await this.registry.registry()).resolve(slug);

    let row = this.content.db
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name)
      .select('id')
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .where(
        sql<SqlBool>`${sql.ref('published_at')} is ${
          type.definition.draftAndPublish ? sql`null` : sql`not null`
        }`,
      );
    if (filter.where !== null) row = row.where(filter.where);
    if ((await row.executeTakeFirst()) === undefined) {
      throw new NotFoundException({
        errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
        message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
      });
    }

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { documentId: true, displayName: true },
    });
    if (account === null) throw new ForbiddenException();
    return this.record(
      `${slug}/${documentId}`,
      {
        ownerKey: actor.accountId,
        accountId: account.documentId,
        displayName: account.displayName,
        state,
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: now + PRESENCE_TTL_MS,
      },
      now,
    );
  }

  private record(
    key: string,
    entry: StoredEntry,
    now: number,
  ): PresenceEntry[] {
    const group = this.entries.get(key) ?? new Map<number, StoredEntry>();
    this.sweep(key, group, now);
    if (!group.has(entry.ownerKey)) {
      if (this.size >= PRESENCE_MAX_ENTRIES) this.sweepAll(now);
      if (this.size >= PRESENCE_MAX_ENTRIES) {
        if (group.size === 0) this.entries.delete(key);
        throw new HttpException(
          PRESENCE_MESSAGES.STORE_FULL,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.size += 1;
    }
    this.entries.set(key, group);
    group.set(entry.ownerKey, entry);
    return [...group.values()].map(
      ({ accountId, displayName, state, lastSeenAt }) => ({
        accountId,
        displayName,
        state,
        lastSeenAt,
      }),
    );
  }

  private sweep(
    key: string,
    group: Map<number, StoredEntry>,
    now: number,
  ): void {
    for (const [accountId, stored] of group) {
      if (stored.expiresAt <= now) {
        group.delete(accountId);
        this.size -= 1;
      }
    }
    if (group.size === 0) this.entries.delete(key);
  }

  private sweepAll(now: number): void {
    for (const [key, group] of this.entries) this.sweep(key, group, now);
  }
}
