import { isAxiosError } from 'axios';

import { MASKED_FIELDS_KEY } from '../../config/content.constants';
import type { ComponentItem, FieldValueMap } from './content.api';

/** One component item of a serialized record in a 409 body. */
export interface ConflictItem {
  componentUid: string;
  values: FieldValueMap;
  components: Record<string, ConflictItem[] | null>;
}

/** `server` / `submitted` of a 409: a record as the caller may see it. */
export interface ConflictRecord {
  values: FieldValueMap;
  components: Record<string, ConflictItem[] | null>;
  [MASKED_FIELDS_KEY]?: string[];
}

export type DiffChange = 'added' | 'removed' | 'changed' | 'moved';

export interface DiffEntry {
  /** `values.<field>` or `components.<field>[<uid>]...`; new items are `[new#<i>]`. */
  path: string;
  change: DiffChange;
  server?: unknown;
  submitted?: unknown;
}

/** `details` of `409 DOCUMENT_VERSION_CONFLICT` on a draft save (SPEC §9). */
export interface ConflictDetails {
  currentVersion: number;
  server: ConflictRecord;
  submitted: ConflictRecord;
  diff: DiffEntry[];
}

const CHANGES: readonly string[] = ['added', 'removed', 'changed', 'moved'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isConflictRecord = (value: unknown): value is ConflictRecord =>
  isRecord(value) && isRecord(value.values) && isRecord(value.components);

const isDiffEntry = (value: unknown): value is DiffEntry =>
  isRecord(value) &&
  typeof value.path === 'string' &&
  typeof value.change === 'string' &&
  CHANGES.includes(value.change);

/**
 * The merge data of a stale-version failure, or null when the server gave
 * none (the caller may not read the row, or the body is malformed): the
 * page then only offers a reload.
 */
export function conflictDetailsOf(error: unknown): ConflictDetails | null {
  if (!isAxiosError(error)) return null;
  const details = (error.response?.data as { details?: unknown } | null)
    ?.details;
  if (!isRecord(details)) return null;
  const { currentVersion, server, submitted, diff } = details;
  if (
    typeof currentVersion !== 'number' ||
    !isConflictRecord(server) ||
    !isConflictRecord(submitted) ||
    !Array.isArray(diff) ||
    !diff.every(isDiffEntry)
  ) {
    return null;
  }
  return { currentVersion, server, submitted, diff };
}

/** A component item as the API accepts it (no uid = a new item). */
export type ConflictInputItem = ComponentItem;
