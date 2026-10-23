import { randomUUID } from 'node:crypto';

import { type Kysely, sql, type Transaction } from 'kysely';

import {
  CONTENT_DB_SCHEMA,
  CONTENT_ERROR_CODES,
  type CONTENT_STATUSES,
  ROOT_SYSTEM_COLUMNS,
} from './content-engine.constants';
import { fieldTypeOf } from './field-types';
import { ContentEngineError } from './migration-files';
import type {
  ComponentTableNode,
  RegistryService,
  TableNode,
} from './registry.service';
import {
  assertTreeInput,
  type ComponentInput,
  type ComponentsInput,
  ContentTreeError,
  type FieldValues,
  isUuid,
  type TreeInput,
  type TreePath,
} from './tree-input';
import {
  anyInt,
  type ComponentTrees,
  type ContentDatabase,
  type ContentRow,
  loadComponentTrees,
  rowToValues,
} from './tree-loader';

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Which root row an operation targets: one draft and one published row per document. */
export interface DocumentRef {
  documentId: string;
  status: ContentStatus;
}

export interface InsertTreeInput extends TreeInput {
  documentId: string;
  /** null = the draft row; a timestamp = the published row (T22 clones into it). */
  publishedAt: Date | null;
  locale?: string | null | undefined;
  createdBy?: number | null | undefined;
}

export interface ReplaceTreeInput extends TreeInput {
  updatedBy?: number | null | undefined;
}

export interface LoadTreesQuery {
  status: ContentStatus;
  /** Limit to these documents; omit to load every root with this status. */
  documentIds?: readonly string[] | undefined;
}

/** A root row with its component tree. `values` and `components` use API names. */
export interface ContentDocument {
  id: number;
  documentId: string;
  version: number;
  publishedAt: Date | null;
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
  values: FieldValues;
  components: ComponentTrees;
}

export class DocumentNotFoundError extends ContentEngineError {
  readonly code = CONTENT_ERROR_CODES.DOCUMENT_NOT_FOUND;

  constructor(
    readonly slug: string,
    readonly ref: DocumentRef,
  ) {
    super(`No ${ref.status} row of ${slug} for document ${ref.documentId}.`);
    this.name = 'DocumentNotFoundError';
  }
}

type WriteMode = 'insert' | 'replace';

interface ParentWrite {
  id: number;
  /** Inserted by this call, so it has no stored children yet. */
  isNew: boolean;
  components: ComponentsInput | undefined;
  /** Input path of `components`, for error messages. */
  path: TreePath;
}

/** API values -> column values; a type's `encodeForColumn` applies to non-null values. */
function toColumnValues(
  table: TableNode,
  values: FieldValues | undefined,
): ContentRow {
  const row: ContentRow = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    const column = table.columnsByField.get(name);
    if (column === undefined || value === undefined) continue;
    const encode = fieldTypeOf(column.field.type)?.encodeForColumn;
    row[column.name] =
      encode !== undefined && value !== null ? encode(value) : value;
  }
  return row;
}

/** Maps a root row (selected with its projected columns) and its trees to a document. */
export function toDocument(
  root: TableNode,
  row: ContentRow,
  components: ComponentTrees,
): ContentDocument {
  return {
    id: row.id as number,
    documentId: row.document_id as string,
    version: row.version as number,
    publishedAt: (row.published_at as Date | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    createdBy: (row.created_by as number | null) ?? null,
    updatedBy: (row.updated_by as number | null) ?? null,
    values: rowToValues(root, row),
    components,
  };
}

function assertDocumentId(documentId: unknown, path: string): void {
  if (!isUuid(documentId)) {
    throw new ContentTreeError(
      CONTENT_ERROR_CODES.TREE_INVALID_UID,
      [path],
      'must be a UUID',
    );
  }
}

const uidKey = (parentId: number, uid: string) => `${parentId}:${uid}`;

/**
 * Reads and writes content documents (root row + component tree, depth ≤ 3)
 * of registered content types. Table and column names come only from the
 * registry plans; Kysely quotes them, and every value is a bound parameter.
 * Writes require the caller's transaction so a failure rolls back the whole
 * document, together with whatever else the caller did (OCC, publish).
 */
export class ContentRepository {
  constructor(private readonly registry: RegistryService) {}

  /** Inserts a root row and its whole tree. Returns the root id. */
  async insertTree(
    trx: Transaction<ContentDatabase>,
    slug: string,
    input: InsertTreeInput,
  ): Promise<number> {
    const [id] = await this.insertTrees(trx, slug, [input]);
    return id as number;
  }

  /**
   * Inserts many documents at once (T34): one INSERT for all roots, then one
   * INSERT per component table and level for all their items, each
   * `RETURNING id`. Returns the root ids in input order.
   */
  async insertTrees(
    trx: Transaction<ContentDatabase>,
    slug: string,
    inputs: readonly InsertTreeInput[],
  ): Promise<number[]> {
    if (inputs.length === 0) return [];
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

    await this.syncChildren(
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
    db: Kysely<ContentDatabase>,
    slug: string,
    query: LoadTreesQuery,
  ): Promise<ContentDocument[]> {
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
   * Version/OCC is the caller's job (T21). Returns the root id.
   */
  async replaceTree(
    trx: Transaction<ContentDatabase>,
    slug: string,
    ref: DocumentRef,
    input: ReplaceTreeInput,
  ): Promise<number> {
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

    await this.syncChildren(
      trx,
      root,
      [{ id, isNew: false, components: tree.components, path: ['components'] }],
      'replace',
    );
    return id;
  }

  /** Writes every component table below `table`, one level at a time. */
  private async syncChildren(
    trx: Transaction<ContentDatabase>,
    table: TableNode,
    parents: ParentWrite[],
    mode: WriteMode,
  ): Promise<void> {
    for (const component of table.components) {
      const targets = parents.flatMap((parent) => {
        const items = parent.components?.[component.field.name];
        return items === undefined ? [] : [{ parent, items }];
      });
      if (targets.length > 0) {
        await this.syncComponentTable(trx, component, targets, mode);
      }
    }
  }

  private async syncComponentTable(
    trx: Transaction<ContentDatabase>,
    component: ComponentTableNode,
    targets: { parent: ParentWrite; items: ComponentInput[] }[],
    mode: WriteMode,
  ): Promise<void> {
    const { table, field } = component;
    const db = trx.withSchema(CONTENT_DB_SCHEMA);
    const storedParentIds = targets
      .filter(({ parent }) => !parent.isNew)
      .map(({ parent }) => parent.id);

    // Stored items of exactly these parents: the only rows this call may touch.
    const stored = new Map<string, number>();
    if (storedParentIds.length > 0) {
      const rows = await db
        .selectFrom(table.plan.name)
        .select(['id', 'parent_id', 'component_uid'])
        .where('parent_id', '=', anyInt(storedParentIds))
        .execute();
      for (const row of rows) {
        stored.set(
          uidKey(row.parent_id as number, row.component_uid as string),
          row.id as number,
        );
      }
    }

    const kept = new Set<number>();
    const updates: { id: number; parentId: number; row: ContentRow }[] = [];
    const inserts: ContentRow[] = [];
    const insertedItems = new Map<
      string,
      { item: ComponentInput; path: TreePath }
    >();
    const next: ParentWrite[] = [];

    for (const { parent, items } of targets) {
      items.forEach((item, index) => {
        const itemPath = [...parent.path, field.name, index];
        const childPath = [...itemPath, 'components'];
        const sentUid = item.componentUid?.toLowerCase();
        const row = {
          ...toColumnValues(table, item.values),
          order_index: index,
        };
        if (mode === 'replace' && sentUid !== undefined) {
          const id = stored.get(uidKey(parent.id, sentUid));
          if (id === undefined) {
            throw new ContentTreeError(
              CONTENT_ERROR_CODES.TREE_UNKNOWN_UID,
              [...itemPath, 'componentUid'],
              `not an item of this ${field.name} list`,
            );
          }
          kept.add(id);
          updates.push({ id, parentId: parent.id, row });
          next.push({
            id,
            isNew: false,
            components: item.components,
            path: childPath,
          });
          return;
        }
        // Insert keeps a sent uid (T22 clones draft -> published with the same uids).
        const uid = sentUid ?? randomUUID();
        insertedItems.set(uidKey(parent.id, uid), { item, path: childPath });
        inserts.push({ ...row, parent_id: parent.id, component_uid: uid });
      });
    }

    const removed = [...stored.values()].filter((id) => !kept.has(id));
    if (removed.length > 0) {
      await db
        .deleteFrom(table.plan.name)
        .where('id', '=', anyInt(removed))
        .where('parent_id', '=', anyInt(storedParentIds))
        .execute();
    }

    for (const update of updates) {
      await db
        .updateTable(table.plan.name)
        .set(update.row)
        .where('id', '=', update.id)
        .where('parent_id', '=', update.parentId)
        .execute();
    }

    if (inserts.length > 0) {
      const rows = await db
        .insertInto(table.plan.name)
        .values(inserts)
        .returning(['id', 'parent_id', 'component_uid'])
        .execute();
      for (const row of rows) {
        const inserted = insertedItems.get(
          uidKey(row.parent_id as number, row.component_uid as string),
        );
        next.push({
          id: row.id as number,
          isNew: true,
          components: inserted?.item.components,
          path: inserted?.path ?? [],
        });
      }
    }

    if (next.length > 0) await this.syncChildren(trx, table, next, mode);
  }
}
