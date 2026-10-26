import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { DomainError } from '../../../common/errors/Domain.errors';
import { Clock } from '../../../common/time/Clock.service';
import {
  CONTENT_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  type AccessPolicy,
  AccessPolicyService,
  type ActorContext,
  PermissionAction,
  recordReadAccess,
  RecordSerializer,
  type RowCondition,
  type SerializedRecord,
  WriteAllowlist,
} from '../../access';
import {
  assertTreeInput,
  type ContentDocument,
  ContentRegistry,
  type RegisteredContentType,
  type TreeInput,
} from '../../content-engine';
import { DocumentMediaService } from '../../media';
import {
  diffRecords,
  type DiffEntry,
  overlaySubmitted,
} from '../domain/Diff.rules';
import { DOCUMENT_ERROR_MESSAGES } from '../domain/Documents.constants';
import {
  documentNotFound,
  forbidden,
  mapContentErrors,
  unknownContentType,
  versionConflict,
} from '../domain/Documents.errors';
import {
  validateTreeValues,
  type WriteMode,
} from '../domain/ValueValidator.rules';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
  type DocumentRowSelector,
  type RecordReadAccess,
} from './Documents.port';

/** Body of `409 DOCUMENT_VERSION_CONFLICT` (SPEC §9), under `details`. */
export interface VersionConflictDetails {
  currentVersion: number;
  /** The stored document as the actor may read it; null when the actor may not read this row. */
  server: SerializedRecord | null;
  /** The submitted changes applied on the stored document, serialized the same way. */
  submitted: SerializedRecord | null;
  diff: DiffEntry[];
}

/** What a successful write returns when the actor may not read the row it wrote. */
export interface WrittenRef {
  documentId: string;
  version: number;
}

export type WriteResult = SerializedRecord | WrittenRef;

interface ReadScope {
  readable: boolean;
  where: RowCondition | null;
}

interface ConflictOutcome {
  kind: 'conflict';
  document: ContentDocument | null;
  current: number;
}

/** A write the actor has been checked for, ready for the transaction. */
export interface PreparedWrite {
  type: RegisteredContentType;
  /** As sent: media values are file uuids (used for the 409 overlay). */
  tree: TreeInput;
  /** Media values mapped to the stored file ids: what the repository writes. */
  stored: TreeInput;
}

/**
 * SPEC §9 document writes: create a draft, update with optimistic
 * concurrency. Order of every write:
 * 1. permission (guard) and the row-level `update` conditions (403/404);
 * 2. body -> `WriteAllowlist` (D4) -> `assertTreeInput` -> value rules
 *    (type, required, richtext sanitize) -> 400s, before any SQL;
 * 3. one transaction: `UPDATE ... SET version = version + 1 WHERE version = $v`
 *    (this takes the row lock), then `replaceTree`. No row updated = 409 or 404;
 * 4. every body returned goes through `RecordSerializer` with the actor's
 *    read access (D3), including the 409.
 * Types without draft and publish store one live row (`published_at` set at
 * create); the others store the draft row (`published_at` null).
 */
@Injectable()
export class DocumentsCommandService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistry,
    @Inject(CONTENT_TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    private readonly media: DocumentMediaService,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: ActorContext,
    slug: string,
    body: unknown,
  ): Promise<WriteResult> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw forbidden();
    }
    const { evaluator } = await this.access.policy();
    if (!evaluator.can(actor, PermissionAction.create, slug)) {
      throw forbidden();
    }
    const { type, stored } = await this.prepare(
      actor,
      slug,
      body,
      PermissionAction.create,
      'create',
    );
    const readable = evaluator.fieldsFor(actor, slug).readable;
    const access = recordReadAccess(actor, readable);

    const documentId = randomUUID();
    const id = await this.transactions.run((unit) =>
      mapContentErrors(() =>
        this.documents.insertTree(unit, slug, {
          ...stored,
          documentId,
          publishedAt: type.definition.draftAndPublish
            ? null
            : new Date(this.clock.now()),
          createdBy: actor.accountId,
        }),
      ),
    );
    return this.writeResult(actor, slug, type, access, id, documentId, 1);
  }

  async update(
    actor: ActorContext,
    slug: string,
    documentId: string,
    version: number,
    body: unknown,
  ): Promise<WriteResult> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw forbidden();
    }
    const { evaluator } = await this.access.policy();
    const rowFilter = evaluator.rowFilter(actor, PermissionAction.update, slug);
    if (!rowFilter.allowed) throw forbidden();
    const { type, tree, stored } = await this.prepare(
      actor,
      slug,
      body,
      PermissionAction.update,
      'update',
    );
    const access = recordReadAccess(
      actor,
      evaluator.fieldsFor(actor, slug).readable,
    );
    // The draft copy for a type with draft and publish, else its single live copy.
    const target: DocumentRowSelector = {
      documentId,
      status: type.definition.draftAndPublish ? 'draft' : 'published',
      rowCondition: rowFilter.where,
    };

    const outcome = await this.transactions.run(async (unit) => {
      const updated = await this.documents.bumpVersion(
        unit,
        type,
        target,
        version,
      );
      if (updated === undefined) {
        const readScope = this.readScope(actor, slug, type, evaluator);
        return this.describeConflict(unit, type, access, target, readScope);
      }
      await mapContentErrors(() =>
        this.documents.replaceTree(
          unit,
          slug,
          { documentId, status: target.status ?? 'published' },
          { ...stored, updatedBy: actor.accountId },
        ),
      );
      await this.assertStillInUpdateScope(unit, type, target, updated.id);
      return { kind: 'updated', id: updated.id } as const;
    });

    if (outcome.kind === 'conflict') {
      throw await this.conflict(type, access, outcome, tree);
    }
    return this.writeResult(
      actor,
      slug,
      type,
      access,
      outcome.id,
      documentId,
      version + 1,
    );
  }

  /**
   * The new content may take the row out of the actor's update conditions:
   * refuse (rolls back) rather than let them move rows out of their own scope.
   */
  private async assertStillInUpdateScope(
    unit: UnitOfWork,
    type: RegisteredContentType,
    target: DocumentRowSelector,
    id: number,
  ): Promise<void> {
    if (target.rowCondition === null) return;
    const isInScope = await this.documents.isRowInScope(
      unit,
      type,
      id,
      target.rowCondition,
    );
    if (!isInScope) throw forbidden();
  }

  /** What the actor may read of the draft or live row, for the 409 body. */
  private readScope(
    actor: ActorContext,
    slug: string,
    type: RegisteredContentType,
    evaluator: AccessPolicy['evaluator'],
  ): ReadScope {
    const readFilter = evaluator.rowFilter(actor, PermissionAction.read, slug);
    if (!readFilter.allowed) return { readable: false, where: null };
    const readable = type.definition.draftAndPublish
      ? evaluator.canReadDrafts(actor, slug)
      : true;
    return { readable, where: readFilter.where };
  }

  /** No row matched the version: 404 if the row is gone, else the 409 outcome. */
  private async describeConflict(
    unit: UnitOfWork,
    type: RegisteredContentType,
    access: RecordReadAccess,
    target: DocumentRowSelector,
    readScope: ReadScope,
  ): Promise<ConflictOutcome> {
    const current = await this.documents.findVersion(type, target, unit);
    if (current === undefined) throw documentNotFound();

    const document = readScope.readable
      ? await this.documents.findOne(
          type,
          access,
          { documentId: target.documentId, status: target.status },
          readScope.where,
          unit,
        )
      : undefined;
    return { kind: 'conflict', document: document ?? null, current };
  }

  /**
   * The body of a successful write: the record, serialized, only when the
   * actor may read this very row (read permission, read row conditions and,
   * for a draft, `canReadDrafts`: the same gate as the 409 body). Else just
   * the ids, so a write is never a way to read what a read would refuse.
   */
  private async writeResult(
    actor: ActorContext,
    slug: string,
    type: RegisteredContentType,
    access: RecordReadAccess,
    id: number,
    documentId: string,
    version: number,
  ): Promise<WriteResult> {
    const { evaluator } = await this.access.policy();
    const readFilter = evaluator.rowFilter(actor, PermissionAction.read, slug);
    const mayRead =
      readFilter.allowed &&
      (!type.definition.draftAndPublish ||
        evaluator.canReadDrafts(actor, slug));
    const document = mayRead
      ? await this.documents.findOne(
          type,
          access,
          { rowId: id },
          readFilter.where,
        )
      : undefined;
    if (document === undefined) return { documentId, version };
    const record = new RecordSerializer(type).serialize(document, access);
    await this.media.embed(type.root, [record]);
    return record;
  }

  /** One bulk-create item: the same checks as `create`, no SQL write. */
  prepareCreate(
    actor: ActorContext,
    slug: string,
    body: unknown,
  ): Promise<PreparedWrite> {
    return this.prepare(actor, slug, body, PermissionAction.create, 'create');
  }

  /** Body -> the tree the repository may write; all 400s happen here. */
  private async prepare(
    actor: ActorContext,
    slug: string,
    body: unknown,
    action: typeof PermissionAction.create | typeof PermissionAction.update,
    mode: WriteMode,
  ): Promise<PreparedWrite> {
    const { catalog, evaluator } = await this.access.policy();
    if (!catalog.isContentType(slug)) throw unknownContentType();
    const type = (await this.registry.registry()).resolve(slug);
    const fields = evaluator.fieldsFor(actor, slug, action);
    const allowed = new WriteAllowlist(type).apply(body, fields);
    await mapContentErrors(() => {
      assertTreeInput(type.root, allowed);
      return Promise.resolve();
    });
    const tree = validateTreeValues(type.root, allowed, {
      mode,
      writable: fields.writable,
    });
    return {
      type,
      tree,
      stored: await this.media.toStored(actor, type.root, tree),
    };
  }

  private async conflict(
    type: RegisteredContentType,
    access: RecordReadAccess,
    outcome: ConflictOutcome,
    tree: TreeInput,
  ): Promise<DomainError> {
    const details: VersionConflictDetails = {
      currentVersion: outcome.current,
      server: null,
      submitted: null,
      diff: [],
    };
    if (outcome.document !== null) {
      const serializer = new RecordSerializer(type);
      details.server = serializer.serialize(outcome.document, access);
      details.submitted = serializer.serialize(
        overlaySubmitted(outcome.document, tree),
        access,
      );
      await this.media.embed(type.root, [details.server, details.submitted]);
      details.diff = diffRecords(details.server, details.submitted);
    }
    return versionConflict(DOCUMENT_ERROR_MESSAGES.VERSION_CONFLICT, details);
  }
}
