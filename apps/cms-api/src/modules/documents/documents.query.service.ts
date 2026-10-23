import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Expression, sql, type SqlBool } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import {
  AccessPolicyService,
  type ActorContext,
  QueryGuard,
  recordReadAccess,
  RecordSerializer,
  type SerializedRecord,
} from '../access';
import { projectTable, selectedColumns } from '../access/field-projection';
import { MediaRefsService } from '../media/media-refs.service';
import { ContentDbProvider } from '../content-engine/content-database';
import { ContentRegistryProvider } from '../content-engine/content-engine.module';
import { CONTENT_DB_SCHEMA } from '../content-engine/content-engine.constants';
import {
  type ContentStatus,
  toDocument,
} from '../content-engine/content.repository';
import type { RegisteredContentType } from '../content-engine/registry.service';
import { loadComponentTrees } from '../content-engine/tree-loader';
import type { ListDocumentsQuery } from './dto/list-documents.query';
import { filterExpression, queryColumnOf, sortTarget } from './document-filter';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  LIST_TIEBREAK_COLUMN,
} from './documents.constants';

export interface DocumentPage {
  data: SerializedRecord[];
  meta: { page: number; pageSize: number; total: number };
}

/** Everything one read needs, decided before any SQL runs. */
interface ReadScope {
  type: RegisteredContentType;
  access: ReturnType<typeof recordReadAccess>;
  /** Row-level conditions of the actor's `read` rows (SPEC §8.3); null = every row. */
  rowCondition: Expression<SqlBool> | null;
  /** draft/published predicate; null for a type without draft and publish. */
  statusCondition: Expression<SqlBool> | null;
}

/**
 * SPEC §9 document reads (T20). Every read follows the same order:
 * 1. the actor needs `read` (403) and, for `status=draft`, read + update (403);
 * 2. fields: `fieldsFor().readable` -> `recordReadAccess` -> projected
 *    columns, so a masked column is never selected (D3);
 * 3. `QueryGuard` checks filter and sort fields before any SQL (400);
 * 4. SQL: status + the actor's row conditions + filters, all parameterized;
 * 5. `RecordSerializer` builds every body.
 * The slug is only a registry lookup key; table and column names come from
 * the registry plan.
 */
@Injectable()
export class DocumentsQueryService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
    private readonly content: ContentDbProvider,
    private readonly media: MediaRefsService,
  ) {}

  async list(
    actor: ActorContext,
    slug: string,
    query: ListDocumentsQuery,
  ): Promise<DocumentPage> {
    const scope = await this.scope(actor, slug, query.status);
    const { type, access } = scope;

    new QueryGuard(type).assert(
      {
        filter: query.filters.map((clause) => clause.path),
        sort: query.sort.map((key) => key.path),
      },
      access,
    );
    const filters = query.filters.map((clause) =>
      filterExpression(queryColumnOf(type, clause.path), clause),
    );
    const sorts = query.sort.map((key) => sortTarget(type, key));
    const predicates = [
      scope.statusCondition,
      scope.rowCondition,
      ...filters,
    ].filter((predicate) => predicate !== null);

    const projected = projectTable(type.root, access.fields);
    const db = this.content.db.withSchema(CONTENT_DB_SCHEMA);
    const table = type.root.plan.name;

    let rowsQuery = db
      .selectFrom(table)
      .select(selectedColumns(projected, access));
    let countQuery = db
      .selectFrom(table)
      .select(sql<string>`count(*)`.as('total'));
    for (const predicate of predicates) {
      rowsQuery = rowsQuery.where(predicate);
      countQuery = countQuery.where(predicate);
    }
    for (const sort of sorts) {
      rowsQuery = rowsQuery.orderBy(sql.ref(sort.column), (order) =>
        (sort.direction === 'desc' ? order.desc() : order.asc()).nullsLast(),
      );
    }
    const rows = await rowsQuery
      .orderBy(LIST_TIEBREAK_COLUMN)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .execute();
    const counted = await countQuery.executeTakeFirstOrThrow();

    const trees = await loadComponentTrees(
      this.content.db,
      projected,
      rows.map((row) => row.id as number),
    );
    const documents = rows.map((row) =>
      toDocument(projected, row, trees.get(row.id as number) ?? {}),
    );
    const data = new RecordSerializer(type).serializeMany(documents, access);
    await this.media.embed(type.root, data);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: Number(counted.total),
      },
    };
  }

  /** 404 when no such row is visible to the actor (also when a row condition hides it). */
  async get(
    actor: ActorContext,
    slug: string,
    documentId: string,
    status: ContentStatus,
  ): Promise<SerializedRecord> {
    const scope = await this.scope(actor, slug, status);
    const { type, access } = scope;
    const projected = projectTable(type.root, access.fields);

    let rowQuery = this.content.db
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name)
      .select(selectedColumns(projected, access))
      .where(sql<SqlBool>`${sql.ref('document_id')} = ${documentId}`);
    for (const predicate of [scope.statusCondition, scope.rowCondition]) {
      if (predicate !== null) rowQuery = rowQuery.where(predicate);
    }
    const row = await rowQuery.limit(1).executeTakeFirst();
    if (row === undefined) {
      throw new NotFoundException({
        errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
        message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
      });
    }
    const trees = await loadComponentTrees(this.content.db, projected, [
      row.id as number,
    ]);
    const document = toDocument(
      projected,
      row,
      trees.get(row.id as number) ?? {},
    );
    const record = new RecordSerializer(type).serialize(document, access);
    await this.media.embed(type.root, [record]);
    return record;
  }

  private async scope(
    actor: ActorContext,
    slug: string,
    status: ContentStatus,
  ): Promise<ReadScope> {
    const { catalog, evaluator } = await this.access.policy();
    if (!catalog.isContentType(slug)) throw new NotFoundException();
    if (status === 'draft' && !evaluator.canReadDrafts(actor, slug)) {
      throw new ForbiddenException({
        message: DOCUMENT_ERROR_MESSAGES.DRAFTS_FORBIDDEN,
      });
    }
    const rowFilter = evaluator.rowFilter(actor, PermissionAction.read, slug);
    if (!rowFilter.allowed) throw new ForbiddenException();

    const type = (await this.registry.registry()).resolve(slug);
    const readable = evaluator.fieldsFor(actor, slug).readable;
    return {
      type,
      access: recordReadAccess(actor, readable),
      rowCondition: rowFilter.where,
      statusCondition: type.definition.draftAndPublish
        ? sql<SqlBool>`${sql.ref('published_at')} ${
            status === 'draft' ? sql`is null` : sql`is not null`
          }`
        : null,
    };
  }
}
