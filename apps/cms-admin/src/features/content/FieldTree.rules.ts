import type { ContentTypeField, FieldWidth } from '../content-types';

/** A content field arranged as a tree (components hold their fields). */
export interface FieldNode {
  /** Property name inside its parent (`teamSize`). */
  name: string;
  /** Full API path without item indexes (`experience.role.teamSize`). */
  path: string;
  type: string;
  label: string;
  width: FieldWidth;
  /** Allowed values of an `enumeration` field. */
  options?: readonly string[];
  /** Starting value of a new document or entry, in API value form. */
  defaultValue?: unknown;
  repeatable: boolean;
  /** Name of the child whose value titles an item (CM-14); only on a repeatable component. */
  titleField?: string;
  /** Name of the child whose value follows the title in the item header. */
  subtitleField?: string;
  children: FieldNode[];
}

const DEFAULT_FIELD_WIDTH: FieldWidth = 'full';
const PATH_SEPARATOR = '.';

/** `techStack` -> `Tech Stack`: split before capitals, capitalise each word. */
export function labelOf(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Rebuilds the field tree from `GET /content-types/:slug`, which lists the
 * fields the caller can reach depth-first (parents before their fields).
 * System fields are skipped. A field whose parent is missing is dropped.
 */
export function buildFieldTree(fields: readonly ContentTypeField[]): FieldNode[] {
  const roots: FieldNode[] = [];
  const byPath = new Map<string, FieldNode>();
  for (const field of fields) {
    if (field.system) continue;
    const cut = field.path.lastIndexOf(PATH_SEPARATOR);
    const name = cut < 0 ? field.path : field.path.slice(cut + 1);
    const node: FieldNode = {
      name,
      path: field.path,
      type: field.type,
      label: field.displayName ?? labelOf(name),
      width: field.width ?? DEFAULT_FIELD_WIDTH,
      ...(field.options === undefined ? {} : { options: field.options }),
      ...(field.default === undefined ? {} : { defaultValue: field.default }),
      repeatable: field.repeatable,
      ...(field.titleField === undefined ? {} : { titleField: field.titleField }),
      ...(field.subtitleField === undefined ? {} : { subtitleField: field.subtitleField }),
      children: [],
    };
    if (cut < 0) {
      roots.push(node);
    } else {
      const parent = byPath.get(field.path.slice(0, cut));
      if (parent === undefined) continue;
      parent.children.push(node);
    }
    byPath.set(field.path, node);
  }
  return roots;
}
