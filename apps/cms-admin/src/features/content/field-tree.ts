import type { ContentTypeField } from '../access/access.api';

/** A content field arranged as a tree (components hold their fields). */
export interface FieldNode {
  /** Property name inside its parent (`teamSize`). */
  name: string;
  /** Full API path without item indexes (`experience.role.teamSize`). */
  path: string;
  type: string;
  label: string;
  repeatable: boolean;
  children: FieldNode[];
}

const PATH_SEPARATOR = '.';

/** `techStack` -> `Tech stack`. */
export function labelOf(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Rebuilds the field tree from `GET /content-types/:slug`, which lists the
 * fields the caller can reach depth-first (parents before their fields).
 * System fields are skipped. A field whose parent is missing is dropped.
 */
export function buildFieldTree(
  fields: readonly ContentTypeField[],
): FieldNode[] {
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
      label: labelOf(name),
      repeatable: field.repeatable,
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
