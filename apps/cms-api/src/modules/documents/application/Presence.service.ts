import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import {
  AccessPolicyService,
  type ActorContext,
  PermissionAction,
} from '../../access';
import { ContentRegistry } from '../../content-engine';
import {
  PRESENCE_MAX_ENTRIES,
  PRESENCE_TTL_MS,
  type PresenceState,
} from '../domain/Documents.constants';
import {
  documentNotFound,
  forbidden,
  presenceStoreFull,
  unknownContentType,
} from '../domain/Documents.errors';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
  PRESENCE_ACCOUNT_LOOKUP,
  type PresenceAccountLookup,
} from './Documents.port';

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
    private readonly registry: ContentRegistry,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(PRESENCE_ACCOUNT_LOOKUP)
    private readonly accounts: PresenceAccountLookup,
    private readonly clock: Clock,
  ) {}

  /** Records the caller's heartbeat and returns everyone active on the document. */
  async heartbeat(
    actor: ActorContext,
    slug: string,
    documentId: string,
    state: PresenceState,
  ): Promise<PresenceEntry[]> {
    const now = this.clock.now();
    if (actor.kind !== 'account') throw forbidden();
    const { catalog, evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, PermissionAction.update, slug);
    if (!filter.allowed) throw forbidden();
    if (!catalog.isContentType(slug)) throw unknownContentType();
    const type = (await this.registry.registry()).resolve(slug);

    const editedRowVersion = await this.documents.findVersion(type, {
      documentId,
      status: type.definition.draftAndPublish ? 'draft' : 'published',
      rowCondition: filter.where,
    });
    if (editedRowVersion === undefined) {
      throw documentNotFound();
    }

    const account = await this.accounts.findByAccountId(actor.accountId);
    if (account === null) throw forbidden();
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
        throw presenceStoreFull();
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
