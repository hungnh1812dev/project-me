import { MASKED_FIELDS_KEY } from './content.constants';
import type { ConflictDetails, DiffEntry } from './conflict';

export type MergeSide = 'server' | 'client';

/** A path in a diff entry, split into component steps and its end. */
export interface ParsedEntryPath {
  /** Component lists on the way, outermost first (`uid` set for an item step). */
  steps: { name: string; uid?: string }[];
  /** `value`: a field of the last item (or the root). `item` / `list`: whole item / order. */
  kind: 'value' | 'item' | 'list';
  /** Field name when `kind` is `value`. */
  field?: string;
}

const VALUES_PREFIX = 'values.';
const COMPONENTS_PREFIX = 'components.';
const STEP = /^([A-Za-z0-9_]+)(?:\[([^\]]+)\])?/;

/** Splits `components.skill[uid].values.level` (see cms-api `diff.ts`). */
export function parseEntryPath(path: string): ParsedEntryPath | null {
  const steps: ParsedEntryPath['steps'] = [];
  let rest = path;
  for (;;) {
    if (rest.startsWith(VALUES_PREFIX)) {
      const field = rest.slice(VALUES_PREFIX.length);
      return field === '' ? null : { steps, kind: 'value', field };
    }
    if (!rest.startsWith(COMPONENTS_PREFIX)) return null;
    const match = STEP.exec(rest.slice(COMPONENTS_PREFIX.length));
    if (match === null) return null;
    const [whole, name = '', uid] = match;
    steps.push(uid === undefined ? { name } : { name, uid });
    rest = rest.slice(COMPONENTS_PREFIX.length + whole.length);
    if (rest === '')
      return { steps, kind: uid === undefined ? 'list' : 'item' };
    if (!rest.startsWith('.')) return null;
    rest = rest.slice(1);
  }
}

/** Field path without item indexes, as `_maskedFields` lists it. */
export function fieldPathOf(parsed: ParsedEntryPath): string {
  const names = parsed.steps.map((step) => step.name);
  if (parsed.field !== undefined) names.push(parsed.field);
  return names.join('.');
}

/** True when `path` or one of its parents is listed as masked. */
export function isMaskedPath(
  path: string,
  masked: ReadonlySet<string>,
): boolean {
  const parts = path.split('.');
  for (let end = 1; end <= parts.length; end += 1) {
    if (masked.has(parts.slice(0, end).join('.'))) return true;
  }
  return false;
}

/** Paths the caller cannot read: the form's plus the 409 body's. */
export function maskedPathsOf(
  details: ConflictDetails,
  formMasked: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([
    ...formMasked,
    ...(details.server[MASKED_FIELDS_KEY] ?? []),
    ...(details.submitted[MASKED_FIELDS_KEY] ?? []),
  ]);
}

/**
 * The differences the user may decide: masked fields are dropped, so the
 * modal never shows or offers them (SPEC §6).
 */
export function visibleEntries(
  details: ConflictDetails,
  masked: ReadonlySet<string>,
): DiffEntry[] {
  return details.diff.filter((entry) => {
    const parsed = parseEntryPath(entry.path);
    return parsed !== null && !isMaskedPath(fieldPathOf(parsed), masked);
  });
}

export interface MergeState {
  /** Entry path -> chosen side. Missing = `client` (keep the user's edit). */
  choices: Readonly<Record<string, MergeSide>>;
}

export type MergeAction =
  | { type: 'choose'; path: string; side: MergeSide }
  | { type: 'choose-all'; paths: readonly string[]; side: MergeSide }
  | { type: 'reset' };

export const INITIAL_MERGE_STATE: MergeState = { choices: {} };

export const DEFAULT_SIDE: MergeSide = 'client';

export const sideOf = (state: MergeState, path: string): MergeSide =>
  state.choices[path] ?? DEFAULT_SIDE;

export function mergeReducer(
  state: MergeState,
  action: MergeAction,
): MergeState {
  switch (action.type) {
    case 'choose':
      return { choices: { ...state.choices, [action.path]: action.side } };
    case 'choose-all':
      return {
        choices: Object.fromEntries(
          action.paths.map((path) => [path, action.side]),
        ),
      };
    case 'reset':
      return INITIAL_MERGE_STATE;
  }
}
