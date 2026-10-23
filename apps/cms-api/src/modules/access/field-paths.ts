import {
  type ContentTypeDefinition,
  type FieldDefinition,
  isComponentField,
} from '../content-engine';
import { FIELD_PATH_SEPARATOR } from './access.constants';

/**
 * Field lists in permissions (`readable_fields`, `writable_fields`, token
 * scopes) hold API field paths: a root field (`title`) or a nested one
 * joined with `.` (`reference.phone`). A component path covers its whole
 * subtree. `null` means every field.
 */
export type FieldList = readonly string[] | null;

/** Every field path of a definition, scalar and component, at any depth. */
export function fieldPathsOf(definition: ContentTypeDefinition): Set<string> {
  const paths = new Set<string>();
  const visit = (fields: FieldDefinition[], prefix: string) => {
    for (const field of fields) {
      const path = `${prefix}${field.name}`;
      paths.add(path);
      if (isComponentField(field)) {
        visit(field.fields, `${path}${FIELD_PATH_SEPARATOR}`);
      }
    }
  };
  visit(definition.fields, '');
  return paths;
}

/** `reference` + `phone` -> `reference.phone`; an empty prefix is the root. */
export function joinFieldPath(prefix: string, name: string): string {
  return prefix === '' ? name : `${prefix}${FIELD_PATH_SEPARATOR}${name}`;
}

/** True when `path` is `entry` or lies inside the component `entry`. */
function covers(entry: string, path: string): boolean {
  return path === entry || path.startsWith(`${entry}${FIELD_PATH_SEPARATOR}`);
}

/** True when the list allows `path` (null = all). */
export function fieldListAllows(list: FieldList, path: string): boolean {
  return list === null || list.some((entry) => covers(entry, path));
}

/**
 * True when the list allows `path` or something inside it: `reference.phone`
 * reaches into `reference`. Used to keep a component that is only partly
 * readable (its allowed sub-fields are still selected and shown).
 */
export function fieldListReaches(list: FieldList, path: string): boolean {
  return (
    list === null ||
    list.some((entry) => covers(entry, path) || covers(path, entry))
  );
}

/** Fields allowed by any of the lists (null wins). */
export function unionFieldLists(lists: readonly FieldList[]): FieldList {
  if (lists.some((list) => list === null)) return null;
  return [...new Set(lists.flatMap((list) => list ?? []))];
}

/** Fields allowed by both lists; `reference` ∩ `reference.phone` = `reference.phone`. */
export function intersectFieldLists(a: FieldList, b: FieldList): FieldList {
  if (a === null) return b;
  if (b === null) return a;
  const result = new Set<string>();
  for (const path of a) if (fieldListAllows(b, path)) result.add(path);
  for (const path of b) if (fieldListAllows(a, path)) result.add(path);
  return [...result];
}
