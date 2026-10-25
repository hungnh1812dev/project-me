import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Expression, type Kysely, sql, type SqlBool } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import {
  type AccessPolicy,
  AccessPolicyService,
  type ActorContext,
  recordReadAccess,
  RecordSerializer,
  type SerializedRecord,
  WriteAllowlist,
} from '../access';
import { projectTable, selectedColumns } from '../access/field-projection';
import { DocumentMediaService } from '../media';
import { ContentDbProvider, unitOfWorkFromContentTrx } from '../content-engine';
import { ContentRegistryProvider } from '../content-engine';
import { CONTENT_DB_SCHEMA } from '../content-engine';
import { KyselyContentRepository } from '../content-engine/adapters/KyselyContent.repository';
import { toDocument } from '../content-engine/domain/ContentRowMapping.rules';
import {
  assertTreeInput,
  type ContentDocument,
  ContentTreeError,
  type RegisteredContentType,
  type TreeInput,
} from '../content-engine';
import {
  type ContentDatabase,
  loadComponentTrees,
} from '../content-engine/adapters/TreeLoader.adapter';
import { diffRecords, type DiffEntry, overlaySubmitted } from './diff';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
} from './documents.constants';
import { validateTreeValues, type WriteMode } from './value-validator';

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

type Db = Kysely<ContentDatabase>;
type Predicate = Expression<SqlBool>;

/** The row an update addresses: its table, document, which copy, and the actor's update conditions. */
interface UpdateTarget {
  table: string;
  documentId: string;
  /** True: the draft copy (`published_at` null); false: the single live copy. */
  isDraftRow: boolean;
  updateScope: Predicate | null;
}

interface ReadScope {
  readable: boolean;
  where: Predicate | null;
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
    private readonly registry: ContentRegistryProvider,
    private readonly content: ContentDbProvider,
    private readonly media: DocumentMediaService,
  ) {}

  async create(
    actor: ActorContext,
    slug: string,
    body: unknown,
  ): Promise<WriteResult> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw new ForbiddenException();
    }
    const { evaluator } = await this.access.policy();
    if (!evaluator.can(actor, PermissionAction.create, slug)) {
      throw new ForbiddenException();
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
    const repository = new KyselyContentRepository(
      await this.registry.registry(),
    );

    const documentId = randomUUID();
    const id = await this.content.db.transaction().execute((trx) =>
      this.mapTreeErrors(() =>
        repository.insertTree(unitOfWorkFromContentTrx(trx), slug, {
          ...stored,
          documentId,
          publishedAt: type.definition.draftAndPublish ? null : new Date(),
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
      throw new ForbiddenException();
    }
    const { evaluator } = await this.access.policy();
    const rowFilter = evaluator.rowFilter(actor, PermissionAction.update, slug);
    if (!rowFilter.allowed) throw new ForbiddenException();
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
    const target: UpdateTarget = {
      table: type.root.plan.name,
      documentId,
      isDraftRow: type.definition.draftAndPublish,
      updateScope: rowFilter.where,
    };
    const repository = new KyselyContentRepository(
      await this.registry.registry(),
    );

    const outcome = await this.content.db.transaction().execute(async (trx) => {
      const updated = await this.bumpVersion(trx, target, version);
      if (updated === undefined) {
        const readScope = this.readScope(actor, slug, type, evaluator);
        return this.describeConflict(trx, type, access, target, readScope);
      }
      await this.mapTreeErrors(() =>
        repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          slug,
          {
            documentId,
            status: target.isDraftRow ? 'draft' : 'published',
          },
          { ...stored, updatedBy: actor.accountId },
        ),
      );
      await this.assertStillInUpdateScope(trx, target, updated.id);
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

  /** `SET version = version + 1 WHERE version = $v`: takes the row lock; undefined when no row matched. */
  private async bumpVersion(
    trx: Db,
    target: UpdateTarget,
    expectedVersion: number,
  ): Promise<{ id: number } | undefined> {
    let update = trx
      .withSchema(CONTENT_DB_SCHEMA)
      .updateTable(target.table)
      .set({ version: sql<number>`${sql.ref('version')} + 1` });
    for (const predicate of targetPredicates(
      target,
      sql<SqlBool>`${sql.ref('version')} = ${expectedVersion}`,
    )) {
      update = update.where(predicate);
    }
    const updated = await update.returning('id').executeTakeFirst();
    return updated === undefined ? undefined : { id: updated.id as number };
  }

  /**
   * The new content may take the row out of the actor's update conditions:
   * refuse (rolls back) rather than let them move rows out of their own scope.
   */
  private async assertStillInUpdateScope(
    trx: Db,
    target: UpdateTarget,
    id: number,
  ): Promise<void> {
    if (target.updateScope === null) return;
    const stillInScope = await trx
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(target.table)
      .select('id')
      .where(sql<SqlBool>`${sql.ref('id')} = ${id}`)
      .where(target.updateScope)
      .executeTakeFirst();
    if (stillInScope === undefined) throw new ForbiddenException();
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
    trx: Db,
    type: RegisteredContentType,
    access: ReturnType<typeof recordReadAccess>,
    target: UpdateTarget,
    readScope: ReadScope,
  ): Promise<ConflictOutcome> {
    let currentQuery = trx
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(target.table)
      .select('version');
    for (const predicate of targetPredicates(target, null)) {
      currentQuery = currentQuery.where(predicate);
    }
    const current = await currentQuery.executeTakeFirst();
    if (current === undefined) throw notFound();

    const document = readScope.readable
      ? await this.loadOne(
          trx,
          type,
          access,
          sql<SqlBool>`${sql.ref('document_id')} = ${target.documentId}`,
          [
            sql<SqlBool>`${sql.ref('published_at')} ${
              target.isDraftRow ? sql`is null` : sql`is not null`
            }`,
            ...(readScope.where === null ? [] : [readScope.where]),
          ],
        )
      : undefined;
    return {
      kind: 'conflict',
      document: document ?? null,
      current: current.version as number,
    };
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
    access: ReturnType<typeof recordReadAccess>,
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
      ? await this.loadOne(
          this.content.db,
          type,
          access,
          sql<SqlBool>`${sql.ref('id')} = ${id}`,
          readFilter.where === null ? [] : [readFilter.where],
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
    if (!catalog.isContentType(slug)) throw new NotFoundException();
    const type = (await this.registry.registry()).resolve(slug);
    const fields = evaluator.fieldsFor(actor, slug, action);
    const allowed = new WriteAllowlist(type).apply(body, fields);
    await this.mapTreeErrors(() => {
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
    access: ReturnType<typeof recordReadAccess>,
    outcome: ConflictOutcome,
    tree: TreeInput,
  ): Promise<ConflictException> {
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
    return new ConflictException({
      errorCode: DOCUMENT_ERROR_CODES.VERSION_CONFLICT,
      message: DOCUMENT_ERROR_MESSAGES.VERSION_CONFLICT,
      details,
    });
  }

  /** One root row with its tree, selecting only the columns the access may read. */
  private async loadOne(
    db: Db,
    type: RegisteredContentType,
    access: ReturnType<typeof recordReadAccess>,
    where: Predicate,
    more: readonly Predicate[] = [],
  ): Promise<ContentDocument | undefined> {
    const projected = projectTable(type.root, access.fields);
    let query = db
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name)
      .select(selectedColumns(projected, access))
      .where(where);
    for (const predicate of more) query = query.where(predicate);
    const row = await query.limit(1).executeTakeFirst();
    if (row === undefined) return undefined;
    const trees = await loadComponentTrees(db, projected, [row.id as number]);
    return toDocument(projected, row, trees.get(row.id as number) ?? {});
  }

  /** A tree rejected while writing (unknown uid, ...) is the client's fault: 400. */
  private async mapTreeErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ContentTreeError) {
        throw new BadRequestException({
          errorCode: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }
}

function targetPredicates(
  target: UpdateTarget,
  extra: Predicate | null,
): Predicate[] {
  return [
    sql<SqlBool>`${sql.ref('document_id')} = ${target.documentId}`,
    sql<SqlBool>`${sql.ref('published_at')} ${
      target.isDraftRow ? sql`is null` : sql`is not null`
    }`,
    ...(target.updateScope === null ? [] : [target.updateScope]),
    ...(extra === null ? [] : [extra]),
  ];
}

function notFound(): NotFoundException {
  return new NotFoundException({
    errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
  });
}
