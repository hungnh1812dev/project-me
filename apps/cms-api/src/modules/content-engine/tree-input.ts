import {
  CONTENT_ERROR_CODES,
  SINGLE_COMPONENT_MAX_ITEMS,
} from './content-engine.constants';
import { UUID_PATTERN } from './field-types';
import { formatDefinitionPath } from './definition.validator';
import { ContentEngineError } from './migration-files';
import type { TableNode } from './registry.service';

/**
 * The document tree as the repository reads and writes it. Keys of `values`
 * and `components` are API field names (camelCase); the repository maps them
 * to columns and tables through the plan.
 */
export type FieldValues = Record<string, unknown>;
export type ComponentsInput = Record<string, ComponentInput[]>;

export interface ComponentInput {
  /** Omit for a new component; send back the loaded uid to keep the row. */
  componentUid?: string | undefined;
  /** Absent keys keep their stored value on update (null on insert). */
  values?: FieldValues | undefined;
  /** Absent component fields keep their stored items on update. */
  components?: ComponentsInput | undefined;
}

export interface TreeInput {
  values?: FieldValues | undefined;
  components?: ComponentsInput | undefined;
}

type TreeErrorCode =
  | typeof CONTENT_ERROR_CODES.TREE_INVALID
  | typeof CONTENT_ERROR_CODES.TREE_INVALID_UID
  | typeof CONTENT_ERROR_CODES.TREE_DUPLICATE_UID
  | typeof CONTENT_ERROR_CODES.TREE_UNKNOWN_UID;

export type TreePath = (string | number)[];

/** Tree input rejected before (or while) writing. `path` points into the input. */
export class ContentTreeError extends ContentEngineError {
  constructor(
    readonly code: TreeErrorCode,
    readonly path: TreePath,
    message: string,
  ) {
    super(
      path.length > 0 ? `${formatDefinitionPath(path)}: ${message}` : message,
    );
    this.name = 'ContentTreeError';
  }
}

const ITEM_KEYS = new Set<keyof ComponentInput>([
  'componentUid',
  'values',
  'components',
]);
const TREE_KEYS = new Set<keyof TreeInput>(['values', 'components']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function invalid(path: TreePath, message: string): ContentTreeError {
  return new ContentTreeError(CONTENT_ERROR_CODES.TREE_INVALID, path, message);
}

function checkKeys(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: TreePath,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw invalid([...path, key], 'unknown key');
  }
}

function checkValues(table: TableNode, values: unknown, path: TreePath): void {
  if (values === undefined) return;
  if (!isPlainObject(values)) throw invalid(path, 'must be an object');
  for (const key of Object.keys(values)) {
    if (!table.columnsByField.has(key)) {
      throw invalid([...path, key], `unknown field of ${table.plan.name}`);
    }
  }
}

function checkComponents(
  table: TableNode,
  components: unknown,
  path: TreePath,
): void {
  if (components === undefined) return;
  if (!isPlainObject(components)) throw invalid(path, 'must be an object');
  const byName = new Map(
    table.components.map((component) => [component.field.name, component]),
  );
  for (const [key, items] of Object.entries(components)) {
    const component = byName.get(key);
    if (component === undefined) {
      throw invalid([...path, key], `unknown component of ${table.plan.name}`);
    }
    const itemsPath = [...path, key];
    if (!Array.isArray(items)) throw invalid(itemsPath, 'must be an array');
    if (
      component.field.repeatable !== true &&
      items.length > SINGLE_COMPONENT_MAX_ITEMS
    ) {
      throw invalid(
        itemsPath,
        `non-repeatable component holds at most ${SINGLE_COMPONENT_MAX_ITEMS} item`,
      );
    }
    const seen = new Set<string>();
    items.forEach((item: unknown, index) => {
      const itemPath = [...itemsPath, index];
      if (!isPlainObject(item)) throw invalid(itemPath, 'must be an object');
      checkKeys(item, ITEM_KEYS, itemPath);
      const uid = item.componentUid;
      if (uid !== undefined) {
        const uidPath = [...itemPath, 'componentUid'];
        if (!isUuid(uid)) {
          throw new ContentTreeError(
            CONTENT_ERROR_CODES.TREE_INVALID_UID,
            uidPath,
            'must be a UUID',
          );
        }
        const normalized = uid.toLowerCase();
        if (seen.has(normalized)) {
          throw new ContentTreeError(
            CONTENT_ERROR_CODES.TREE_DUPLICATE_UID,
            uidPath,
            'appears more than once in this list',
          );
        }
        seen.add(normalized);
      }
      checkValues(component.table, item.values, [...itemPath, 'values']);
      checkComponents(component.table, item.components, [
        ...itemPath,
        'components',
      ]);
    });
  }
}

/**
 * Checks the whole tree against the registered table plans before any SQL
 * runs: only known keys, arrays for components, UUID uids, no duplicates.
 * Value types are left to the API layer and Postgres.
 * @throws ContentTreeError
 */
export function assertTreeInput(
  root: TableNode,
  input: unknown,
): asserts input is TreeInput {
  if (!isPlainObject(input)) throw invalid([], 'tree must be an object');
  checkKeys(input, TREE_KEYS, []);
  checkValues(root, input.values, ['values']);
  checkComponents(root, input.components, ['components']);
}
