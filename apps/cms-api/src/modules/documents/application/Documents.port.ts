import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { recordReadAccess, RowCondition } from '../../access';
import type {
  ContentDocument,
  ContentRepository,
  ContentStatus,
  RegisteredContentType,
} from '../../content-engine';
import type { FilterClause, SortKey } from '../domain/ListQuery.rules';

export type RecordReadAccess = ReturnType<typeof recordReadAccess>;

/** Which row or rows of one document a repository call reaches. */
export interface DocumentRowSelector {
  documentId: string;
  /** `null` = both copies, and for a type without draft and publish the one live row. */
  status: ContentStatus | null;
  /** The actor's row conditions for the action; `null` = every row. */
  rowCondition: RowCondition | null;
}

export interface ListSelection {
  access: RecordReadAccess;
  /** `null` for a type without draft and publish. */
  status: ContentStatus | null;
  rowCondition: RowCondition | null;
  filters: readonly FilterClause[];
  sort: readonly SortKey[];
  page: number;
  pageSize: number;
}

export interface ListedDocuments {
  documents: ContentDocument[];
  total: number;
}

/** Which single record `findOne` reads: by its document id or by its row id. */
export type DocumentLookup =
  { documentId: string; status: ContentStatus | null } | { rowId: number };

/**
 * Persistence of document rows. Tree reads and writes come from the content
 * engine's `ContentRepository`; the rest are the row-level statements of
 * list, update, publish and delete. Methods with a `unit` run in the
 * caller's transaction.
 */
export interface DocumentRepository extends ContentRepository {
  list(
    type: RegisteredContentType,
    selection: ListSelection,
  ): Promise<ListedDocuments>;

  /** One root row with its tree, selecting only the columns `access` may read. */
  findOne(
    type: RegisteredContentType,
    access: RecordReadAccess,
    lookup: DocumentLookup,
    rowCondition: RowCondition | null,
    unit?: UnitOfWork,
  ): Promise<ContentDocument | undefined>;

  findVersion(
    type: RegisteredContentType,
    selector: DocumentRowSelector,
    unit?: UnitOfWork,
  ): Promise<number | undefined>;

  /** `SET version = version + 1 WHERE version = $expected`: takes the row lock; `undefined` when no row matched. */
  bumpVersion(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
    expectedVersion: number,
  ): Promise<{ id: number } | undefined>;

  /** Locks the matching row (`FOR UPDATE`) and returns its id and version. */
  lockRow(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<{ id: number; version: number } | undefined>;

  /** Ids of the matching rows; `lockRowIds` also locks them. */
  findRowIds(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number[]>;
  lockRowIds(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number[]>;

  /** True when the row is among the rows `rowCondition` reaches. */
  isRowInScope(
    unit: UnitOfWork,
    type: RegisteredContentType,
    rowId: number,
    rowCondition: RowCondition,
  ): Promise<boolean>;

  /** Deletes the matching rows (their trees cascade); returns how many. */
  deleteRows(
    unit: UnitOfWork,
    type: RegisteredContentType,
    selector: DocumentRowSelector,
  ): Promise<number>;

  setVersionAndEditor(
    unit: UnitOfWork,
    type: RegisteredContentType,
    rowId: number,
    change: { version: number; updatedBy: number },
  ): Promise<void>;
}

/** Nest injection token of the `DocumentRepository`. */
export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

/** The public profile a presence entry shows: the account's public id and display name only. */
export interface PresenceAccount {
  documentId: string;
  displayName: string;
}

export interface PresenceAccountLookup {
  findByAccountId(accountId: number): Promise<PresenceAccount | null>;
}

/** Nest injection token of the `PresenceAccountLookup`. */
export const PRESENCE_ACCOUNT_LOOKUP = Symbol('PRESENCE_ACCOUNT_LOOKUP');

/** What happened to a document (SPEC D15: content edits are tracked through a pluggable adapter). */
export const CONTENT_ACTIVITY_ACTIONS = [
  'publish',
  'unpublish',
  'delete',
] as const;
export type ContentActivityAction = (typeof CONTENT_ACTIVITY_ACTIONS)[number];

/** Ids and names only: never a field value (D15). */
export interface ContentActivityEvent {
  readonly action: ContentActivityAction;
  /** Content type slug. */
  readonly subject: string;
  readonly documentId: string;
  /** The acting account (the creator for an API token); null if unknown. */
  readonly accountId: number | null;
  /** Set when the actor is an API token. */
  readonly tokenId?: number | undefined;
  /** Version of the draft that was published; absent for other actions. */
  readonly version?: number | undefined;
}

/**
 * Port of activity tracking (`none | database`). Called after the change
 * commits. An adapter failure never fails the request.
 */
export interface ActivityRecorder {
  record(event: ContentActivityEvent): Promise<void>;
}

/** Nest injection token of the active `ActivityRecorder`. */
export const ACTIVITY_RECORDER = Symbol('ACTIVITY_RECORDER');
