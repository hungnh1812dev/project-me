import { z } from 'zod';

import {
  ACCESS_ERROR_CODES,
  type AccessErrorCode,
  FIELD_WRITE_ACTIONS,
  PermissionAction,
} from './Access.constants';
import type { FieldList } from './FieldPaths.rules';
import type { SubjectCatalog } from './SubjectCatalog.rules';

export interface AccessIssue {
  code: AccessErrorCode;
  /** Path inside the submitted payload, e.g. `[2, 'conditions', 'all', 0]`. */
  path: (string | number)[];
  message: string;
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; issues: AccessIssue[] };

export function issue(
  code: AccessErrorCode,
  path: (string | number)[],
  message: string,
): AccessIssue {
  return { code, path, message };
}

const fieldListSchema = z.array(z.string().min(1)).nullable();

/**
 * Checks one field list. Lists are allowed only on a concrete content type
 * and only for the action that uses them (`readableFields` on `read`,
 * `writableFields` on `create`/`update`); every path must exist.
 */
function checkFieldList(
  catalog: SubjectCatalog,
  raw: unknown,
  subject: string,
  isUsedByAction: boolean,
  path: (string | number)[],
  issues: AccessIssue[],
): FieldList {
  const parsed = fieldListSchema.safeParse(raw ?? null);
  if (!parsed.success) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
        path,
        'expected null or an array of field paths',
      ),
    );
    return null;
  }
  const fieldList = parsed.data;
  if (fieldList === null) return null;
  const known = catalog.fieldPaths(subject);
  if (known === undefined || !isUsedByAction) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
        path,
        known === undefined
          ? 'field lists are only allowed on a specific content type'
          : 'this action does not use this field list; use null',
      ),
    );
    return null;
  }
  const seen = new Set<string>();
  fieldList.forEach((field, index) => {
    if (!known.has(field) || seen.has(field)) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
          [...path, index],
          seen.has(field)
            ? `duplicate field "${field}"`
            : `unknown field "${field}"`,
        ),
      );
    }
    seen.add(field);
  });
  return fieldList;
}

export interface RawFieldLists {
  readableFields?: unknown;
  writableFields?: unknown;
}

/**
 * Checks both field lists of one permission row or scope entry, each against
 * the action that uses it. Issue paths are `[...rowPath, '<list name>']`.
 */
export function checkRowFieldLists(
  catalog: SubjectCatalog,
  subject: string,
  action: PermissionAction,
  rawLists: RawFieldLists,
  rowPath: (string | number)[],
  issues: AccessIssue[],
): { readableFields: FieldList; writableFields: FieldList } {
  return {
    readableFields: checkFieldList(
      catalog,
      rawLists.readableFields,
      subject,
      action === PermissionAction.read,
      [...rowPath, 'readableFields'],
      issues,
    ),
    writableFields: checkFieldList(
      catalog,
      rawLists.writableFields,
      subject,
      (FIELD_WRITE_ACTIONS as readonly PermissionAction[]).includes(action),
      [...rowPath, 'writableFields'],
      issues,
    ),
  };
}
