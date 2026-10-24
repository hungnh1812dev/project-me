import {
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  type PermissionAction,
  READABLE_FIELD_ACTIONS,
  WRITABLE_FIELD_ACTIONS,
} from './access.constants';
import type { FieldList, TokenScopeEntry } from './access.api';
import type { CellRef, FieldListKind } from './permission-matrix';

/**
 * Editing model of an API token scope (T19): one cell per content subject
 * and action, each with the field lists the API accepts on it. Simpler than
 * the role matrix: no conditions, no system subjects.
 */
export interface ScopeCell {
  readableFields: FieldList;
  writableFields: FieldList;
}

/** subject -> action -> cell. A missing cell = the action is not granted. */
export type ScopeState = Readonly<
  Record<string, Partial<Record<PermissionAction, ScopeCell>>>
>;

export function scopeFromEntries(
  entries: readonly TokenScopeEntry[],
): ScopeState {
  const state: Record<
    string,
    Partial<Record<PermissionAction, ScopeCell>>
  > = {};
  for (const entry of entries) {
    const bySubject = (state[entry.subject] ??= {});
    bySubject[entry.action] = {
      readableFields: entry.readableFields ?? null,
      writableFields: entry.writableFields ?? null,
    };
  }
  return state;
}

/** `*`, the registered types, then slugs only the token still names. */
export function scopeSubjectOrder(
  state: ScopeState,
  contentTypeSlugs: readonly string[],
): string[] {
  const known = new Set<string>([
    CONTENT_WILDCARD_SUBJECT,
    ...contentTypeSlugs,
  ]);
  const unknown = Object.keys(state)
    .filter((subject) => !known.has(subject))
    .sort();
  return [CONTENT_WILDCARD_SUBJECT, ...contentTypeSlugs, ...unknown];
}

/** The field list an action's entry carries; none for `*` or other actions. */
export function scopeFieldListKind(
  subject: string,
  action: PermissionAction,
): FieldListKind | null {
  if (subject === CONTENT_WILDCARD_SUBJECT) return null;
  if (READABLE_FIELD_ACTIONS.includes(action)) return 'readableFields';
  if (WRITABLE_FIELD_ACTIONS.includes(action)) return 'writableFields';
  return null;
}

export function toggleScopeCell(
  state: ScopeState,
  { subject, action }: CellRef,
  granted: boolean,
): ScopeState {
  const bySubject = { ...state[subject] };
  if (granted) {
    bySubject[action] = { readableFields: null, writableFields: null };
  } else {
    delete bySubject[action];
  }
  return { ...state, [subject]: bySubject };
}

export function setScopeFieldList(
  state: ScopeState,
  { subject, action }: CellRef,
  kind: FieldListKind,
  value: FieldList,
): ScopeState {
  const cell = state[subject]?.[action];
  if (cell === undefined) return state;
  return {
    ...state,
    [subject]: { ...state[subject], [action]: { ...cell, [kind]: value } },
  };
}

export interface SerializedScope {
  entries: TokenScopeEntry[];
  /** Cell of each entry, so a server `indexes` / `issues` path maps back. */
  cells: CellRef[];
}

/** Entries in subject order, then action order; `null` lists are left out. */
export function serializeScope(
  state: ScopeState,
  subjects: readonly string[],
): SerializedScope {
  const entries: TokenScopeEntry[] = [];
  const cells: CellRef[] = [];
  for (const subject of subjects) {
    for (const action of PERMISSION_ACTIONS) {
      const cell = state[subject]?.[action];
      if (cell === undefined) continue;
      const kind = scopeFieldListKind(subject, action);
      const entry: TokenScopeEntry = { subject, action };
      if (kind !== null && cell[kind] !== null) entry[kind] = cell[kind];
      entries.push(entry);
      cells.push({ subject, action });
    }
  }
  return { entries, cells };
}

function fieldsKey(list: FieldList | undefined): string {
  return list === null || list === undefined
    ? '*'
    : [...list].toSorted().join(',');
}

function signature(entry: TokenScopeEntry): string {
  return [
    entry.subject,
    entry.action,
    fieldsKey(entry.readableFields),
    fieldsKey(entry.writableFields),
  ].join('|');
}

/** True when both lists grant exactly the same things (order is irrelevant). */
export function sameScopeEntries(
  a: readonly TokenScopeEntry[],
  b: readonly TokenScopeEntry[],
): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(signature).toSorted();
  const right = b.map(signature).toSorted();
  return left.every((value, index) => value === right[index]);
}

/** Number of granted cells and the subjects (in order) that hold any. */
export function scopeSummary(entries: readonly TokenScopeEntry[]): {
  permissions: number;
  subjects: string[];
} {
  const subjects: string[] = [];
  for (const { subject } of entries) {
    if (!subjects.includes(subject)) subjects.push(subject);
  }
  return { permissions: entries.length, subjects };
}
