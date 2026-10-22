import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Kysely, sql, type SqlBool, type Transaction } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import {
  ACTIVITY_RECORDER,
  type ActivityRecorder,
  type ContentActivityEvent,
} from '../../infrastructure/activity/activity.port';
import { AccessPolicyService } from '../access/access-policy.service';
import type { ActorContext } from '../access/actor-context';
import { ContentDbProvider } from '../content-engine/content-database';
import { CONTENT_DB_SCHEMA } from '../content-engine/content-engine.constants';
import { ContentRegistryProvider } from '../content-engine/content-engine.module';
import { ContentRepository } from '../content-engine/content.repository';
import type { ContentDatabase } from '../content-engine/tree-loader';
import type { RegisteredContentType } from '../content-engine/registry.service';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
} from './documents.constants';
import type { WrittenRef } from './documents.command.service';
import { cloneTree } from './tree-cloner';

type RowFilter = ReturnType<
  Awaited<ReturnType<AccessPolicyService['policy']>>['evaluator']['rowFilter']
>;

/** Who may act on which type, and the rows the action's conditions reach. */
export interface ActionScope {
  type: RegisteredContentType;
  filter: Extract<RowFilter, { allowed: true }>;
  accountId: number;
}

/**
 * SPEC §9 publish, unpublish and delete (T22), all on the document's two
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
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
    private readonly content: ContentDbProvider,
    @Inject(ACTIVITY_RECORDER) private readonly activity: ActivityRecorder,
  ) {}

  async publish(
    actor: ActorContext,
    slug: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<WrittenRef> {
    const scope = await this.begin(actor, slug, PermissionAction.publish, true);
    const version = await this.content.db
      .transaction()
      .execute((trx) =>
        this.publishIn(trx, scope, slug, documentId, expectedVersion),
      );
    await this.track(actor, 'publish', slug, documentId, version);
    return { documentId, version };
  }

  /** The publish steps inside the caller's transaction (also used per item by bulk, T34). */
  async publishIn(
    trx: Transaction<ContentDatabase>,
    scope: ActionScope,
    slug: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<number> {
    const { type, filter, accountId } = scope;
    const repository = new ContentRepository(await this.registry.registry());
    const table = type.root.plan.name;
    let lock = trx
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(table)
      .select(['id', 'version', 'created_by'])
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .where(sql<SqlBool>`${sql.ref('published_at')} is null`);
    if (filter.where !== null) lock = lock.where(filter.where);
    const draft = await lock.forUpdate().executeTakeFirst();
    if (draft === undefined) throw notFound();
    const draftVersion = draft.version as number;
    if (draftVersion !== expectedVersion) {
      throw new ConflictException({
        errorCode: DOCUMENT_ERROR_CODES.VERSION_CONFLICT,
        message: DOCUMENT_ERROR_MESSAGES.PUBLISH_CONFLICT,
        details: { currentVersion: draftVersion },
      });
    }

    // The row about to be replaced must be in the actor's publish scope too.
    const db = trx.withSchema(CONTENT_DB_SCHEMA);
    const existing = await db
      .selectFrom(table)
      .select('id')
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .where(sql<SqlBool>`${sql.ref('published_at')} is not null`)
      .forUpdate()
      .executeTakeFirst();
    if (existing !== undefined && filter.where !== null) {
      const inScope = await db
        .selectFrom(table)
        .select('id')
        .where(sql<SqlBool>`${sql.ref('id')} = ${existing.id}`)
        .where(filter.where)
        .executeTakeFirst();
      if (inScope === undefined) throw notFound();
    }

    const [stored] = await repository.loadTrees(trx, slug, {
      status: 'draft',
      documentIds: [documentId],
    });
    if (stored === undefined) throw notFound();

    await db
      .deleteFrom(table)
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .where(sql<SqlBool>`${sql.ref('published_at')} is not null`)
      .execute();
    const publishedId = await repository.insertTree(trx, slug, {
      ...cloneTree(stored),
      documentId,
      publishedAt: new Date(),
      createdBy: stored.createdBy,
    });
    await db
      .updateTable(table)
      .set({ version: draftVersion, updated_by: accountId })
      .where(sql<SqlBool>`${sql.ref('id')} = ${publishedId}`)
      .execute();
    return draftVersion;
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
    await this.unpublishIn(this.content.db, scope, documentId);
    await this.track(actor, 'unpublish', slug, documentId);
  }

  /** Deletes the published row on `db` (a transaction for bulk, T34); 404 if out of scope. */
  async unpublishIn(
    db: Kysely<ContentDatabase>,
    scope: ActionScope,
    documentId: string,
  ): Promise<void> {
    let remove = db
      .withSchema(CONTENT_DB_SCHEMA)
      .deleteFrom(scope.type.root.plan.name)
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .where(sql<SqlBool>`${sql.ref('published_at')} is not null`);
    if (scope.filter.where !== null) remove = remove.where(scope.filter.where);
    const removed = await remove.returning('id').executeTakeFirst();
    if (removed === undefined) throw notFound();
  }

  async remove(
    actor: ActorContext,
    slug: string,
    documentId: string,
  ): Promise<void> {
    const scope = await this.begin(actor, slug, PermissionAction.delete, false);
    await this.content.db
      .transaction()
      .execute((trx) => this.removeIn(trx, scope, documentId));
    await this.track(actor, 'delete', slug, documentId);
  }

  /** Deletes both rows inside the caller's transaction (also per item for bulk, T34). */
  async removeIn(
    trx: Transaction<ContentDatabase>,
    scope: ActionScope,
    documentId: string,
  ): Promise<void> {
    const { type, filter } = scope;
    const table = type.root.plan.name;
    const db = trx.withSchema(CONTENT_DB_SCHEMA);
    const rows = await db
      .selectFrom(table)
      .select('id')
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .forUpdate()
      .execute();
    if (rows.length === 0) throw notFound();
    if (filter.where !== null) {
      const reachable = await db
        .selectFrom(table)
        .select('id')
        .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
        .where(filter.where)
        .execute();
      // Both rows or none: a delete never leaves half a document behind.
      if (reachable.length !== rows.length) throw notFound();
    }
    await db
      .deleteFrom(table)
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`)
      .execute();
  }

  /** Who may act and on which type; the row filter narrows the rows. */
  async begin(
    actor: ActorContext,
    slug: string,
    action: PermissionAction,
    needsDraftAndPublish: boolean,
  ): Promise<ActionScope> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw new ForbiddenException();
    }
    const { catalog, evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, action, slug);
    if (!filter.allowed) throw new ForbiddenException();
    if (!catalog.isContentType(slug)) throw new NotFoundException();
    const type = (await this.registry.registry()).resolve(slug);
    if (needsDraftAndPublish && !type.definition.draftAndPublish) {
      throw new BadRequestException({
        errorCode: DOCUMENT_ERROR_CODES.NOT_PUBLISHABLE,
        message: DOCUMENT_ERROR_MESSAGES.NOT_PUBLISHABLE,
      });
    }
    return { type, filter, accountId: actor.accountId };
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
        `activity tracking failed for ${action} ${subject}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
  });
}
