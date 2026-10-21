import {
  CONDITIONS_JSON_INDENT,
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  type PermissionAction,
  READABLE_FIELD_ACTIONS,
  SYSTEM_SUBJECT_ACTIONS,
  SYSTEM_SUBJECTS,
  WRITABLE_FIELD_ACTIONS,
} from '../../config/access.constants';
import type { FieldList, PermissionRow } from './access.api';

/**
 * Editing model of a role's permission set (T18). One cell per subject and
 * action. A cell edits its first row; further rows for the same cell (only
 * possible through the API) are kept unchanged so a save never loses them.
 * Conditions are edited as text and parsed on save.
 */
export interface MatrixCell {
  rows: PermissionRow[];
  /** Conditions of the first row as the user typed them ('' = none). */
  conditionsText: string;
}

/** subject -> action -> cell. A missing cell = the action is not granted. */
export type MatrixState = Readonly<
  Record<string, Partial<Record<PermissionAction, MatrixCell>>>
>;

export type FieldListKind = 'readableFields' | 'writableFields';

export interface CellRef {
  subject: string;
  action: PermissionAction;
}

export function isSystemSubject(subject: string): boolean {
  return Object.hasOwn(SYSTEM_SUBJECT_ACTIONS, subject);
}

/** Actions a subject can have (system subjects have a fixed subset). */
export function actionsFor(subject: string): readonly PermissionAction[] {
  return isSystemSubject(subject)
    ? SYSTEM_SUBJECT_ACTIONS[subject as keyof typeof SYSTEM_SUBJECT_ACTIONS]
    : PERMISSION_ACTIONS;
}

/** Which field list an action's row carries, if any. */
export function fieldListKindOf(
  subject: string,
  action: PermissionAction,
): FieldListKind | null {
  if (subject === CONTENT_WILDCARD_SUBJECT || isSystemSubject(subject)) {
    return null;
  }
  if (READABLE_FIELD_ACTIONS.includes(action)) return 'readableFields';
  if (WRITABLE_FIELD_ACTIONS.includes(action)) return 'writableFields';
  return null;
}

function conditionsTextOf(conditions: unknown): string {
  return conditions === null || conditions === undefined
    ? ''
    : JSON.stringify(conditions, null, CONDITIONS_JSON_INDENT);
}

export function matrixFromRows(rows: readonly PermissionRow[]): MatrixState {
  const state: Record<
    string,
    Partial<Record<PermissionAction, MatrixCell>>
  > = {};
  for (const row of rows) {
    const bySubject = (state[row.subject] ??= {});
    const cell = bySubject[row.action];
    if (cell === undefined) {
      bySubject[row.action] = {
        rows: [row],
        conditionsText: conditionsTextOf(row.conditions),
      };
    } else {
      cell.rows.push(row);
    }
  }
  return state;
}

/**
 * Subjects in display order: `*`, then content types (registry order, then
 * unknown slugs found in the rows), then the system subjects.
 */
export function subjectOrder(
  state: MatrixState,
  contentTypeSlugs: readonly string[],
): { content: string[]; system: string[] } {
  const known = new Set<string>([
    CONTENT_WILDCARD_SUBJECT,
    ...contentTypeSlugs,
    ...SYSTEM_SUBJECTS,
  ]);
  const unknown = Object.keys(state)
    .filter((subject) => !known.has(subject))
    .sort();
  return {
    content: [CONTENT_WILDCARD_SUBJECT, ...contentTypeSlugs, ...unknown],
    system: [...SYSTEM_SUBJECTS],
  };
}

function withCell(
  state: MatrixState,
  { subject, action }: CellRef,
  cell: MatrixCell | undefined,
): MatrixState {
  const bySubject = { ...state[subject] };
  if (cell === undefined) delete bySubject[action];
  else bySubject[action] = cell;
  return { ...state, [subject]: bySubject };
}

/** Grant (new row: all fields, no conditions) or revoke every row of a cell. */
export function toggleCell(
  state: MatrixState,
  ref: CellRef,
  granted: boolean,
): MatrixState {
  if (!granted) return withCell(state, ref, undefined);
  if (state[ref.subject]?.[ref.action] !== undefined) return state;
  return withCell(state, ref, {
    rows: [
      {
        subject: ref.subject,
        action: ref.action,
        readableFields: null,
        writableFields: null,
        conditions: null,
      },
    ],
    conditionsText: '',
  });
}

function updateFirstRow(
  state: MatrixState,
  ref: CellRef,
  change: (cell: MatrixCell, first: PermissionRow) => MatrixCell,
): MatrixState {
  const cell = state[ref.subject]?.[ref.action];
  const first = cell?.rows[0];
  if (cell === undefined || first === undefined) return state;
  return withCell(state, ref, change(cell, first));
}

export function setFieldList(
  state: MatrixState,
  ref: CellRef,
  kind: FieldListKind,
  list: FieldList,
): MatrixState {
  return updateFirstRow(state, ref, (cell, first) => ({
    ...cell,
    rows: [{ ...first, [kind]: list }, ...cell.rows.slice(1)],
  }));
}

export function setConditionsText(
  state: MatrixState,
  ref: CellRef,
  text: string,
): MatrixState {
  return updateFirstRow(state, ref, (cell) => ({
    ...cell,
    conditionsText: text,
  }));
}

/** '' -> null; JSON -> value; otherwise `invalid`. */
export function parseConditions(
  text: string,
): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false };
  }
}

function cellKey({ subject, action }: CellRef): string {
  return `${subject}\u0000${action}`;
}

export interface SerializedMatrix {
  rows: PermissionRow[];
  /** `rows[i]` belongs to `cells[i]`: maps API issue indexes back to cells. */
  cells: CellRef[];
  /** Cells whose conditions text is not valid JSON (nothing to send). */
  invalidConditions: CellRef[];
}

/** The PUT body in display order, plus the index -> cell map. */
export function serializeMatrix(
  state: MatrixState,
  order: readonly string[],
): SerializedMatrix {
  const result: SerializedMatrix = {
    rows: [],
    cells: [],
    invalidConditions: [],
  };
  const subjects = [
    ...order,
    ...Object.keys(state).filter((subject) => !order.includes(subject)),
  ];
  for (const subject of subjects) {
    for (const action of PERMISSION_ACTIONS) {
      const cell = state[subject]?.[action];
      if (cell === undefined) continue;
      const ref = { subject, action };
      const parsed = parseConditions(cell.conditionsText);
      if (!parsed.ok) result.invalidConditions.push(ref);
      cell.rows.forEach((row, index) => {
        result.rows.push(
          index === 0 && parsed.ok ? { ...row, conditions: parsed.value } : row,
        );
        result.cells.push(ref);
      });
    }
  }
  return result;
}

/** Same grants as `rows`? Used for the unsaved-changes state. */
export function sameMatrix(
  a: MatrixState,
  b: MatrixState,
  order: readonly string[],
): boolean {
  const left = serializeMatrix(a, order);
  const right = serializeMatrix(b, order);
  return (
    left.invalidConditions.length === right.invalidConditions.length &&
    JSON.stringify(left.rows) === JSON.stringify(right.rows) &&
    JSON.stringify(textsOf(a, left.cells)) ===
      JSON.stringify(textsOf(b, right.cells))
  );
}

function textsOf(state: MatrixState, cells: readonly CellRef[]): string[] {
  return cells.map(
    (ref) => state[ref.subject]?.[ref.action]?.conditionsText.trim() ?? '',
  );
}

/** Messages per cell key from a 400 `details.issues` (path[0] = row index). */
export function cellIssues(
  issues: readonly { path: readonly (string | number)[]; message: string }[],
  cells: readonly CellRef[],
): Map<string, string[]> {
  const byCell = new Map<string, string[]>();
  for (const issue of issues) {
    const index = issue.path[0];
    const ref = typeof index === 'number' ? cells[index] : undefined;
    if (ref === undefined) continue;
    const key = cellKey(ref);
    byCell.set(key, [...(byCell.get(key) ?? []), issue.message]);
  }
  return byCell;
}

/** Cell keys for PERMISSION_NOT_HELD `details.indexes`. */
export function cellsAt(
  indexes: readonly number[],
  cells: readonly CellRef[],
): Set<string> {
  return new Set(
    indexes.flatMap((index) => {
      const ref = cells[index];
      return ref === undefined ? [] : [cellKey(ref)];
    }),
  );
}

export { cellKey };

/**
 * Field selection helpers. A component path covers its subtree, so checking
 * a component drops its descendants from the list.
 */
export function isCoveredBy(entry: string, path: string): boolean {
  return path !== entry && path.startsWith(`${entry}.`);
}

export function toggleField(
  list: readonly string[],
  path: string,
  selected: boolean,
): string[] {
  if (!selected) return list.filter((entry) => entry !== path);
  if (list.includes(path)) return [...list];
  return [...list.filter((entry) => !isCoveredBy(path, entry)), path];
}
