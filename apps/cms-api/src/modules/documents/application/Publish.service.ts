import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/Clock.service';
import {
  CONTENT_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  AccessPolicyService,
  type ActorContext,
  PermissionAction,
  type RowCondition,
} from '../../access';
import {
  ContentRegistry,
  type RegisteredContentType,
} from '../../content-engine';
import { DOCUMENT_ERROR_MESSAGES } from '../domain/Documents.constants';
import {
  documentNotFound,
  forbidden,
  notPublishable,
  unknownContentType,
  versionConflict,
} from '../domain/Documents.errors';
import { cloneTree } from '../domain/TreeCloner.rules';
import {
  ACTIVITY_RECORDER,
  type ActivityRecorder,
  type ContentActivityEvent,
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
  type DocumentRowSelector,
} from './Documents.port';
import type { WrittenRef } from './DocumentsCommand.service';

/** Who may act on which type, and the rows the action's conditions reach. */
export interface ActionScope {
  type: RegisteredContentType;
  /** The actor's row conditions for the action; null = every row. */
  rowCondition: RowCondition | null;
  accountId: number;
}

/**
 * SPEC §9 publish, unpublish and delete, all on the document's two
 * rows (draft `published_at is null`, published `published_at is not null`).
 * - publish: locks the draft (`FOR UPDATE`), checks `expectedVersion` (409),
 *   then in the same transaction replaces the published row with a deep copy
 *   of the draft tree (uids kept). Concurrent publishes queue on the lock, so
 *   one published row remains; the partial unique indexes are the backstop.
 * - unpublish: deletes the published row (the tree cascades).
 * - delete: deletes both rows; refused (404) unless the actor's `delete`
 *   conditions cover every row of the document.
 * Row conditions of the action decide which rows the actor can reach; rows
 * outside them are 404, as for update. Activity tracking is told after commit.
 */
@Injectable()
export class PublishService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistry,
    @Inject(CONTENT_TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(ACTIVITY_RECORDER) private readonly activity: ActivityRecorder,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
    private readonly clock: Clock,
  ) {}

  async publish(
    actor: ActorContext,
    slug: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<WrittenRef> {
    const scope = await this.begin(actor, slug, PermissionAction.publish, true);
    const version = await this.transactions.run((unit) =>
      this.publishIn(unit, scope, slug, documentId, expectedVersion),
    );
    await this.track(actor, 'publish', slug, documentId, version);
    return { documentId, version };
  }

  /** The publish steps inside the caller's transaction (also used per item by bulk). */
  async publishIn(
    unit: UnitOfWork,
    scope: ActionScope,
    slug: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<number> {
    const { type, rowCondition, accountId } = scope;
    const draftRows: DocumentRowSelector = {
      documentId,
      status: 'draft',
      rowCondition,
    };
    const publishedRows: DocumentRowSelector = {
      documentId,
      status: 'published',
      rowCondition: null,
    };
    const draft = await this.documents.lockRow(unit, type, draftRows);
    if (draft === undefined) throw documentNotFound();
    if (draft.version !== expectedVersion) {
      throw versionConflict(DOCUMENT_ERROR_MESSAGES.PUBLISH_CONFLICT, {
        currentVersion: draft.version,
      });
    }

    // The row about to be replaced must be in the actor's publish scope too.
    const existing = await this.documents.lockRow(unit, type, publishedRows);
    if (existing !== undefined && rowCondition !== null) {
      const isInScope = await this.documents.isRowInScope(
        unit,
        type,
        existing.id,
        rowCondition,
      );
      if (!isInScope) throw documentNotFound();
    }

    const [stored] = await this.documents.loadTrees(unit, slug, {
      status: 'draft',
      documentIds: [documentId],
    });
    if (stored === undefined) throw documentNotFound();

    await this.documents.deleteRows(unit, type, publishedRows);
    const publishedId = await this.documents.insertTree(unit, slug, {
      ...cloneTree(stored),
      documentId,
      publishedAt: new Date(this.clock.now()),
      createdBy: stored.createdBy,
    });
    await this.documents.setVersionAndEditor(unit, type, publishedId, {
      version: draft.version,
      updatedBy: accountId,
    });
    return draft.version;
  }

  async unpublish(
    actor: ActorContext,
    slug: string,
    documentId: string,
  ): Promise<void> {
    const scope = await this.begin(
      actor,
      slug,
      PermissionAction.unpublish,
      true,
    );
    await this.transactions.run((unit) =>
      this.unpublishIn(unit, scope, documentId),
    );
    await this.track(actor, 'unpublish', slug, documentId);
  }

  /** Deletes the published row in the caller's transaction (also per item for bulk); 404 if out of scope. */
  async unpublishIn(
    unit: UnitOfWork,
    scope: ActionScope,
    documentId: string,
  ): Promise<void> {
    const removed = await this.documents.deleteRows(unit, scope.type, {
      documentId,
      status: 'published',
      rowCondition: scope.rowCondition,
    });
    if (removed === 0) throw documentNotFound();
  }

  async remove(
    actor: ActorContext,
    slug: string,
    documentId: string,
  ): Promise<void> {
    const scope = await this.begin(actor, slug, PermissionAction.delete, false);
    await this.transactions.run((unit) =>
      this.removeIn(unit, scope, documentId),
    );
    await this.track(actor, 'delete', slug, documentId);
  }

  /** Deletes both rows inside the caller's transaction (also per item for bulk). */
  async removeIn(
    unit: UnitOfWork,
    scope: ActionScope,
    documentId: string,
  ): Promise<void> {
    const { type, rowCondition } = scope;
    const everyRow: DocumentRowSelector = {
      documentId,
      status: null,
      rowCondition: null,
    };
    const rowIds = await this.documents.lockRowIds(unit, type, everyRow);
    if (rowIds.length === 0) throw documentNotFound();
    if (rowCondition !== null) {
      const reachable = await this.documents.findRowIds(unit, type, {
        ...everyRow,
        rowCondition,
      });
      // Both rows or none: a delete never leaves half a document behind.
      if (reachable.length !== rowIds.length) throw documentNotFound();
    }
    await this.documents.deleteRows(unit, type, everyRow);
  }

  /** Who may act and on which type; the row filter narrows the rows. */
  async begin(
    actor: ActorContext,
    slug: string,
    action: PermissionAction,
    needsDraftAndPublish: boolean,
  ): Promise<ActionScope> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw forbidden();
    }
    const { catalog, evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, action, slug);
    if (!filter.allowed) throw forbidden();
    if (!catalog.isContentType(slug)) throw unknownContentType();
    const type = (await this.registry.registry()).resolve(slug);
    if (needsDraftAndPublish && !type.definition.draftAndPublish) {
      throw notPublishable();
    }
    return { type, rowCondition: filter.where, accountId: actor.accountId };
  }

  /** Tell the activity adapter after commit; its failure never fails the request. */
  async track(
    actor: ActorContext,
    action: ContentActivityEvent['action'],
    subject: string,
    documentId: string,
    version?: number,
  ): Promise<void> {
    try {
      await this.activity.record({
        action,
        subject,
        documentId,
        accountId: actor.kind === 'anonymous' ? null : actor.accountId,
        tokenId: actor.kind === 'api_token' ? actor.tokenId : undefined,
        version,
      });
    } catch (error) {
      this.logger.error(
        `activity tracking failed for ${action} ${subject}: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
        }`,
        PublishService.name,
      );
    }
  }
}
