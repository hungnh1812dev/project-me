import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  ContentDocument,
  ContentStatus,
  DocumentRef,
} from '../domain/ContentDocument.entity';
import type { TreeInput } from '../domain/TreeInput.rules';

export interface InsertTreeInput extends TreeInput {
  documentId: string;
  /** null = the draft row; a timestamp = the published row (publish clones into it). */
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

/**
 * Reads and writes content documents (root row + component tree, depth ≤ 3)
 * of registered content types. Every method runs in the caller's unit of
 * work, so a failure rolls back the whole document together with whatever
 * else the caller did (OCC, publish).
 */
export interface ContentRepository {
  /** Inserts a root row and its whole tree. Returns the root id. */
  insertTree(
    unit: UnitOfWork,
    slug: string,
    input: InsertTreeInput,
  ): Promise<number>;

  /** Inserts many documents at once. Returns the root ids in input order. */
  insertTrees(
    unit: UnitOfWork,
    slug: string,
    inputs: readonly InsertTreeInput[],
  ): Promise<number[]>;

  /** Loads roots with their trees, ordered by id. */
  loadTrees(
    unit: UnitOfWork,
    slug: string,
    query: LoadTreesQuery,
  ): Promise<ContentDocument[]>;

  /**
   * Replaces the content of one root row in place and locks it for the rest
   * of the unit. Version/OCC is the caller's job. Returns the root id.
   * @throws DocumentNotFoundError when the row vanished before it was locked.
   */
  replaceTree(
    unit: UnitOfWork,
    slug: string,
    ref: DocumentRef,
    input: ReplaceTreeInput,
  ): Promise<number>;
}
