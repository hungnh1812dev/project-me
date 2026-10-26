import { type Kysely, sql } from 'kysely';

import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  ContentRepository,
  InsertTreeInput,
  LoadTreesQuery,
  ReplaceTreeInput,
} from '../application/ContentEngine.port';
import {
  CONTENT_DB_SCHEMA,
  CONTENT_ERROR_CODES,
  ROOT_SYSTEM_COLUMNS,
} from '../domain/ContentEngine.constants';
import {
  type ContentDocument,
  DocumentNotFoundError,
  type DocumentRef,
} from '../domain/ContentDocument.entity';
import { toColumnValues, toDocument } from '../domain/ContentRowMapping.rules';
import type { ContentTypeRegistry } from '../domain/ContentTypeRegistry.entity';
import {
  assertTreeInput,
  ContentTreeError,
  isUuid,
} from '../domain/TreeInput.rules';
import { syncChildren } from './ComponentTableSync.adapter';
import { contentTrxOf } from './KyselyContentTransactionRunner.adapter';
import { type ContentDatabase, loadComponentTrees } from './TreeLoader.adapter';

function assertDocumentId(documentId: unknown, path: string): void {
  if (!isUuid(documentId)) {
    throw new ContentTreeError(
      CONTENT_ERROR_CODES.TREE_INVALID_UID,
      [path],
      'must be a UUID',
    );
  }
}

/**
 * Kysely implementation of `ContentRepository`. Table and column names come
 * only from the registry plans; Kysely quotes them, and every value is a
 * bound parameter.
 */
export class KyselyContentRepository implements ContentRepository {
  constructor(private readonly registry: ContentTypeRegistry) {}

  /** Inserts a root row and its whole tree. Returns the root id. */
  async insertTree(
    unit: UnitOfWork,
    slug: string,
    input: InsertTreeInput,
  ): Promise<number> {
    const [id] = await this.insertTrees(unit, slug, [input]);
    return id as number;
  }

  /**
   * Inserts many documents at once: one INSERT for all roots, then one
   * INSERT per component table and level for all their items, each
   * `RETURNING id`. Returns the root ids in input order.
   */
  async insertTrees(
    unit: UnitOfWork,
    slug: string,
    inputs: readonly InsertTreeInput[],
  ): Promise<number[]> {
    if (inputs.length === 0) return [];
    const trx = contentTrxOf(unit);
    const { root } = this.registry.resolve(slug);
    const prepared = inputs.map((input) => {
      const { documentId, publishedAt, locale, createdBy, ...tree } = input;
      assertDocumentId(documentId, 'documentId');
      assertTreeInput(root, tree);
      return { documentId, publishedAt, locale, createdBy, tree };
    });

    const inserted = await trx
      .withSchema(CONTENT_DB_SCHEMA)
      .insertInto(root.plan.name)
      .values(
        prepared.map(
          ({ documentId, publishedAt, locale, createdBy, tree }) => ({
            ...toColumnValues(root, tree.values),
            document_id: documentId,
            published_at: publishedAt,
            locale: locale ?? null,
            created_by: createdBy ?? null,
            updated_by: createdBy ?? null,
          }),
        ),
      )
      .returning(['id', 'document_id', 'published_at'])
      .execute();
    // Match by (document_id, published_at) rather than trusting row order.
    const idByDocument = new Map(
      inserted.map((row) => [row.document_id as string, row.id as number]),
    );
    const ids = prepared.map(({ documentId }) => {
      const id = idByDocument.get(documentId);
      if (id === undefined) throw new Error('insert returned no id');
      return id;
    });

    await syncChildren(
      trx,
      root,
      prepared.map(({ tree }, index) => ({
        id: ids[index] as number,
        isNew: true,
        components: tree.components,
        path: ['components'],
      })),
      'insert',
    );
    return ids;
  }

  /**
   * Loads roots with their trees: one query for the roots, then at most one
   * per component table that has parents to load. Roots come back by id.
   */
  async loadTrees(
    unit: UnitOfWork,
    slug: string,
    query: LoadTreesQuery,
  ): Promise<ContentDocument[]> {
    const db: Kysely<ContentDatabase> = contentTrxOf(unit);
    const { root } = this.registry.resolve(slug);
    query.documentIds?.forEach((id, index) =>
      assertDocumentId(id, `documentIds[${index}]`),
    );
    if (query.documentIds?.length === 0) return [];

    let rootQuery = db
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(root.plan.name)
      .select([
        ...ROOT_SYSTEM_COLUMNS,
        ...root.plan.columns.map((column) => column.name),
      ])
      .where('published_at', query.status === 'draft' ? 'is' : 'is not', null)
      .orderBy('id');
    if (query.documentIds !== undefined) {
      rootQuery = rootQuery.where(
        'document_id',
        '=',
        sql<string>`any(${query.documentIds}::uuid[])`,
      );
    }
    const rows = await rootQuery.execute();
    const trees = await loadComponentTrees(
      db,
      root,
      rows.map((row) => row.id as number),
    );
    return rows.map((row) =>
      toDocument(root, row, trees.get(row.id as number) ?? {}),
    );
  }

  /**
   * Replaces the content of one root row in place. For every value or
   * component key present in `input`:
   * - values overwrite the stored ones (absent keys are left untouched);
   * - a component list is authoritative: items whose `componentUid` matches
   *   a stored item of the same parent and field are updated in place (uid
   *   and id kept), items without a uid are inserted with a new uid, and
   *   stored items not sent back are deleted (their subtree cascades).
   * A uid that does not exist under that parent and field is rejected, so
   * rows of another root or another branch can never be reached.
   * The root row is locked (FOR UPDATE) for the rest of the transaction.
   * Version/OCC is the caller's job. Returns the root id.
   */
  async replaceTree(
    unit: UnitOfWork,
    slug: string,
    ref: DocumentRef,
    input: ReplaceTreeInput,
  ): Promise<number> {
    const trx = contentTrxOf(unit);
    const { root } = this.registry.resolve(slug);
    assertDocumentId(ref.documentId, 'documentId');
    const { updatedBy, ...tree } = input;
    assertTreeInput(root, tree);

    const target = await trx
      .withSchema(CONTENT_DB_SCHEMA)
      .selectFrom(root.plan.name)
      .select('id')
      .where('document_id', '=', ref.documentId)
      .where('published_at', ref.status === 'draft' ? 'is' : 'is not', null)
      .forUpdate()
      .executeTakeFirst();
    if (target === undefined) throw new DocumentNotFoundError(slug, ref);
    const id = target.id as number;

    await trx
      .withSchema(CONTENT_DB_SCHEMA)
      .updateTable(root.plan.name)
      .set({
        ...toColumnValues(root, tree.values),
        updated_at: sql<Date>`now()`,
        ...(updatedBy === undefined ? {} : { updated_by: updatedBy }),
      })
      .where('id', '=', id)
      .execute();

    await syncChildren(
      trx,
      root,
      [{ id, isNew: false, components: tree.components, path: ['components'] }],
      'replace',
    );
    return id;
  }
}
