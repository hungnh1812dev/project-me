import { Injectable } from '@nestjs/common';
import { type Kysely, sql, type SqlBool } from 'kysely';

import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { RowCondition } from '../../access';
import {
  projectTable,
  selectedColumns,
} from '../../access/domain/FieldProjection.rules';
import {
  CONTENT_DB_SCHEMA,
  contentTrxOf,
  ContentDbProvider,
  ContentRegistry,
  type ContentDocument,
  type InsertTreeInput,
  type LoadTreesQuery,
  type DocumentRef,
  type RegisteredContentType,
  type ReplaceTreeInput,
} from '../../content-engine';
import { KyselyContentRepository } from '../../content-engine/adapters/KyselyContent.repository';
import {
  type ContentDatabase,
  loadComponentTrees,
} from '../../content-engine/adapters/TreeLoader.adapter';
import { toDocument } from '../../content-engine/domain/ContentRowMapping.rules';
import type {
  DocumentLookup,
  DocumentRepository,
  DocumentRowSelector,
  ListedDocuments,
  ListSelection,
  RecordReadAccess,
} from '../application/Documents.port';
import type { FilterClause } from '../domain/ListQuery.rules';
import {
  filterExpression,
  queryColumnOf,
  sortTarget,
} from './DocumentFilterSql.adapter';

/** Tie-break of every list order, so pages never overlap. */
const LIST_TIEBREAK_COLUMN = 'id';

type Db = Kysely<ContentDatabase>;
type Predicate = RowCondition;

/**
 * Kysely implementation of `DocumentRepository`. Table and column names come
 * only from the registry plans and the field projection (unreadable columns
 * are never selected); every value is a bound parameter.
 */
@Injectable()
export class KyselyDocumentRepository implements DocumentRepository {
  constructor(
    private readonly content: ContentDbProvider,
    private readonly registry: ContentRegistry,
  ) {}

  async insertTree(
    unit: UnitOfWork,
    slug: string,
    input: InsertTreeInput,
  ): Promise<number> {
    return (await this.trees()).insertTree(unit, slug, input);
  }

  async insertTrees(
    unit: UnitOfWork,
    slug: string,
    inputs: readonly InsertTreeInput[],
  ): Promise<number[]> {
    return (await this.trees()).insertTrees(unit, slug, inputs);
  }

  async loadTrees(
    unit: UnitOfWork,
    slug: string,
    query: LoadTreesQuery,
  ): Promise<ContentDocument[]> {
    return (await this.trees()).loadTrees(unit, slug, query);
  }

  async replaceTree(
    unit: UnitOfWork,
    slug: string,
    ref: DocumentRef,
    input: ReplaceTreeInput,
  ): Promise<number> {
    return (await this.trees()).replaceTree(unit, slug, ref, input);
  }

  async list(
    type: RegisteredContentType,
    selection: ListSelection,
  ): Promise<ListedDocuments> {
    const { access, filters, sort, page, pageSize } = selection;
    const predicates = [
      statusPredicate(selection.status),
      selection.rowCondition,
      ...filters.map((clause: FilterClause) =>
        filterExpression(queryColumnOf(type, clause.path), clause),
      ),
    ].filter((predicate) => predicate !== null);
    const sorts = sort.map((key) => sortTarget(type, key));

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
    for (const target of sorts) {
      rowsQuery = rowsQuery.orderBy(sql.ref(target.column), (order) =>
        (target.direction === 'desc' ? order.desc() : order.asc()).nullsLast(),
      );
    }
    const rows = await rowsQuery
      .orderBy(LIST_TIEBREAK_COLUMN)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();
    const counted = await countQuery.executeTakeFirstOrThrow();

    const trees = await loadComponentTrees(
      this.content.db,
      projected,
      rows.map((row) => row.id as number),
    );
    return {
      documents: rows.map((row) =>
        toDocument(projected, row, trees.get(row.id as number) ?? {}),
      ),
      total: Number(counted.total),
    };
  }

  async findOne(
    type: RegisteredContentType,
    access: RecordReadAccess,
    lookup: DocumentLookup,
    rowCondition: RowCondition | null,
    unit?: UnitOfWork,
  ): Promise<ContentDocument | undefined> {
    const projected = projectTable(type.root, access.fields);
    const raw = this.handle(unit);
    let query = raw
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name)
      .select(selectedColumns(projected, access));
    const predicates =
      'rowId' in lookup
        ? [sql<SqlBool>`${sql.ref('id')} = ${lookup.rowId}`]
        : [
            sql<SqlBool>`${sql.ref('document_id')} = ${lookup.documentId}`,
            statusPredicate(lookup.status),
          ];
    for (const predicate of [...predicates, rowCondition]) {
      if (predicate !== null) query = query.where(predicate);
    }
    const row = await query.limit(1).executeTakeFirst();
    if (row === undefined) return undefined;
    const trees = await loadComponentTrees(raw, projected, [row.id as number]);
    return toDocument(projected, row, trees.get(row.id as number) ?? {});
  }

  async findVersion(
    type: RegisteredContentType,
    selector: DocumentRowSelector,
    unit?: UnitOfWork,
  ): Promise<number | undefined> {
    const row = await this.selectRows(this.handle(unit), type, selector)
      .select('version')
      .executeTakeFirst();
    return row === undefined ? undefined : (row.version as number);
  }

  async bumpVersion(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
    expectedVersion: number,
  ): Promise<{ id: number } | undefined> {
    let update = this.handle(unit)
      .withSchema(CONTENT_DB_SCHEMA)
      .updateTable(type.root.plan.name)
      .set({ version: sql<number>`${sql.ref('version')} + 1` });
    for (const predicate of [
      ...selectorPredicates(selector),
      sql<SqlBool>`${sql.ref('version')} = ${expectedVersion}`,
    ]) {
      update = update.where(predicate);
    }
    const updated = await update.returning('id').executeTakeFirst();
    return updated === undefined ? undefined : { id: updated.id as number };
  }

  async lockRow(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<{ id: number; version: number } | undefined> {
    const row = await this.selectRows(this.handle(unit), type, selector)
      .select(['id', 'version'])
      .forUpdate()
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : { id: row.id as number, version: row.version as number };
  }

  async findRowIds(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number[]> {
    const rows = await this.selectRows(this.handle(unit), type, selector)
      .select('id')
      .execute();
    return rows.map((row) => row.id as number);
  }

  async lockRowIds(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number[]> {
    const rows = await this.selectRows(this.handle(unit), type, selector)
      .select('id')
      .forUpdate()
      .execute();
    return rows.map((row) => row.id as number);
  }

  async isRowInScope(
    unit: UnitOfWork,
    type: RegisteredContentType,
    rowId: number,
    rowCondition: RowCondition,
  ): Promise<boolean> {
    const row = await this.handle(unit)
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name)
      .select('id')
      .where(sql<SqlBool>`${sql.ref('id')} = ${rowId}`)
      .where(rowCondition)
      .executeTakeFirst();
    return row !== undefined;
  }

  async deleteRows(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number> {
    let remove = this.handle(unit)
      .withSchema(CONTENT_DB_SCHEMA)
      .deleteFrom(type.root.plan.name);
    for (const predicate of selectorPredicates(selector)) {
      remove = remove.where(predicate);
    }
    const removed = await remove.returning('id').execute();
    return removed.length;
  }

  async setVersionAndEditor(
    unit: UnitOfWork,
    type: RegisteredContentType,
    rowId: number,
    change: { version: number; updatedBy: number },
  ): Promise<void> {
    await this.handle(unit)
      .withSchema(CONTENT_DB_SCHEMA)
      .updateTable(type.root.plan.name)
      .set({ version: change.version, updated_by: change.updatedBy })
      .where(sql<SqlBool>`${sql.ref('id')} = ${rowId}`)
      .execute();
  }

  private async trees(): Promise<KyselyContentRepository> {
    return new KyselyContentRepository(await this.registry.registry());
  }

  /** The unit's transaction, or the pool for a read outside one. */
  private handle(unit: UnitOfWork | undefined): Db {
    return unit === undefined ? this.content.db : contentTrxOf(unit);
  }

  private selectRows(
    db: Db,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ) {
    let query = db
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(type.root.plan.name);
    for (const predicate of selectorPredicates(selector)) {
      query = query.where(predicate);
    }
    return query;
  }
}

function statusPredicate(
  status: 'draft' | 'published' | null,
): Predicate | null {
  if (status === null) return null;
  return sql<SqlBool>`${sql.ref('published_at')} ${
    status === 'draft' ? sql`is null` : sql`is not null`
  }`;
}

function selectorPredicates(selector: DocumentRowSelector): Predicate[] {
  return [
    sql<SqlBool>`${sql.ref('document_id')} = ${selector.documentId}`,
    statusPredicate(selector.status),
    selector.rowCondition,
  ].filter((predicate) => predicate !== null);
}
