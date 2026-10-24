import { z } from 'zod';

import { PermissionAction } from '../../generated/prisma/client';
import {
  ACCESS_ERROR_CODES,
  type AccessErrorCode,
  CONTENT_WILDCARD_SUBJECT,
  FIELD_WRITE_ACTIONS,
} from './access.constants';
import {
  type PermissionGrant,
  type TokenScope,
  tokenScopeSchema,
} from './actor-context';
import { validateConditions } from './conditions.compiler';
import { type FieldList, unionFieldLists } from './field-paths';
import type { SubjectCatalog } from './subject-catalog';

/**
 * Save-time checks for a role's permission set (called before rows
 * are written) and for API token scopes. Everything the evaluator
 * and compiler later trust is enforced here.
 */

export interface AccessIssue {
  code: AccessErrorCode;
  /** Path inside the submitted payload, e.g. `[2, 'conditions', 'all', 0]`. */
  path: (string | number)[];
  message: string;
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; issues: AccessIssue[] };

const permissionInputSchema = z.strictObject({
  subject: z.string(),
  action: z.string(),
  readableFields: z.unknown().optional(),
  writableFields: z.unknown().optional(),
  conditions: z.unknown().optional(),
});

const fieldListSchema = z.array(z.string().min(1)).nullable();

function issue(
  code: AccessErrorCode,
  path: (string | number)[],
  message: string,
): AccessIssue {
  return { code, path, message };
}

function isAction(value: string): value is PermissionAction {
  return Object.hasOwn(PermissionAction, value);
}

/**
 * Checks one field list. Lists are allowed only on a concrete content type
 * and only for the action that uses them (`readableFields` on `read`,
 * `writableFields` on `create`/`update`); every path must exist.
 */
function checkFieldList(
  catalog: SubjectCatalog,
  raw: unknown,
  subject: string,
  usedByAction: boolean,
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
  const list = parsed.data;
  if (list === null) return null;
  const known = catalog.fieldPaths(subject);
  if (known === undefined || !usedByAction) {
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
  list.forEach((field, index) => {
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
  return list;
}

/**
 * Validates a role's full permission set (the PUT body of a role). Conditions
 * may only compare fields the same set makes readable for that subject.
 * Returns the rows ready to store, or every issue found.
 */
export function validatePermissionSet(
  input: unknown,
  catalog: SubjectCatalog,
): ValidationResult<PermissionGrant[]> {
  const issues: AccessIssue[] = [];
  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
          [],
          'expected an array of permissions',
        ),
      ],
    };
  }

  const rows: PermissionGrant[] = [];
  /** Input index of each row in `rows`, for issue paths. */
  const rowIndexes: number[] = [];
  input.forEach((raw, index) => {
    const parsed = permissionInputSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
          [index],
          'expected { subject, action, readableFields?, writableFields?, conditions? }',
        ),
      );
      return;
    }
    const { subject, action } = parsed.data;
    const validSubject =
      catalog.isContentSubject(subject) || catalog.isSystemSubject(subject);
    if (!validSubject) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
          [index, 'subject'],
          `unknown subject "${subject}"`,
        ),
      );
      return;
    }
    if (!isAction(action) || !catalog.actionsFor(subject).includes(action)) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_ACTION,
          [index, 'action'],
          `action "${action}" is not valid on "${subject}"`,
        ),
      );
      return;
    }
    const readableFields = checkFieldList(
      catalog,
      parsed.data.readableFields,
      subject,
      action === PermissionAction.read,
      [index, 'readableFields'],
      issues,
    );
    const writableFields = checkFieldList(
      catalog,
      parsed.data.writableFields,
      subject,
      (FIELD_WRITE_ACTIONS as readonly PermissionAction[]).includes(action),
      [index, 'writableFields'],
      issues,
    );
    const conditions = parsed.data.conditions ?? null;
    if (conditions !== null && catalog.isSystemSubject(subject)) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
          [index, 'conditions'],
          'system subjects take no conditions',
        ),
      );
      return;
    }
    if (conditions !== null && action === PermissionAction.create) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
          [index, 'conditions'],
          'create permissions take no conditions (a row does not exist yet)',
        ),
      );
      return;
    }
    rowIndexes.push(index);
    rows.push({
      subject,
      action,
      readableFields,
      writableFields,
      conditions,
    });
  });

  // Conditions second: they depend on what the whole set makes readable.
  rows.forEach((row, rowIndex) => {
    if (row.conditions === null) return;
    const result = validateConditions(
      row.conditions,
      catalog.conditionFields(row.subject, readableIn(rows, row.subject)),
    );
    if (!result.ok) {
      for (const conditionIssue of result.issues) {
        issues.push(
          issue(
            conditionIssue.code,
            [
              rowIndexes[rowIndex] ?? rowIndex,
              'conditions',
              ...conditionIssue.path,
            ],
            conditionIssue.message,
          ),
        );
      }
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: rows };
}

/**
 * Root fields the set lets its role read on `subject` (same override rule
 * as the evaluator: the slug's `read` rows, else the `*` rows). `*` rows'
 * conditions can only use system fields, so `*` reads nothing here.
 */
function readableIn(
  rows: readonly PermissionGrant[],
  subject: string,
): FieldList {
  if (subject === CONTENT_WILDCARD_SUBJECT) return [];
  const reads = rows.filter((row) => row.action === PermissionAction.read);
  const own = reads.filter((row) => row.subject === subject);
  const used =
    own.length > 0
      ? own
      : reads.filter((row) => row.subject === CONTENT_WILDCARD_SUBJECT);
  return used.length === 0
    ? []
    : unionFieldLists(used.map((row) => row.readableFields));
}

/**
 * Validates an API token scope (used by API token writes): content
 * subjects only, actions valid on them, field lists as for permissions.
 * The subset check against the creator (D5) belongs to the API token service.
 */
export function validateTokenScope(
  input: unknown,
  catalog: SubjectCatalog,
): ValidationResult<TokenScope> {
  const parsed = tokenScopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [
        issue(
          ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
          [],
          'expected { permissions: [{ subject, action, readableFields?, writableFields? }] }',
        ),
      ],
    };
  }
  const issues: AccessIssue[] = [];
  parsed.data.permissions.forEach((entry, index) => {
    const path = ['permissions', index];
    if (!catalog.isContentSubject(entry.subject)) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
          [...path, 'subject'],
          `tokens can only reach content subjects, not "${entry.subject}"`,
        ),
      );
      return;
    }
    checkFieldList(
      catalog,
      entry.readableFields,
      entry.subject,
      entry.action === PermissionAction.read,
      [...path, 'readableFields'],
      issues,
    );
    checkFieldList(
      catalog,
      entry.writableFields,
      entry.subject,
      (FIELD_WRITE_ACTIONS as readonly PermissionAction[]).includes(
        entry.action,
      ),
      [...path, 'writableFields'],
      issues,
    );
  });
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: parsed.data };
}
