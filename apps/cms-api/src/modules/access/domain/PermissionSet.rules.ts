import { z } from 'zod';

import {
  ACCESS_ERROR_CODES,
  CONTENT_WILDCARD_SUBJECT,
  PermissionAction,
} from './Access.constants';
import type { PermissionGrant } from './ActorContext.entity';
import { validateConditions } from './Conditions.rules';
import { checkRowFieldLists } from './FieldList.rules';
import { type FieldList, unionFieldLists } from './FieldPaths.rules';
import type { SubjectCatalog } from './SubjectCatalog.rules';
import {
  type AccessIssue,
  issue,
  type ValidationResult,
} from './FieldList.rules';

/**
 * Save-time checks for a role's permission set (called before rows
 * are written). Everything the evaluator and compiler later trust is
 * enforced here.
 */

const permissionInputSchema = z.strictObject({
  subject: z.string(),
  action: z.string(),
  readableFields: z.unknown().optional(),
  writableFields: z.unknown().optional(),
  conditions: z.unknown().optional(),
});

function isAction(value: string): value is PermissionAction {
  return Object.hasOwn(PermissionAction, value);
}

/** A row that passed the per-row checks, with its position in the input. */
interface CheckedRow {
  inputIndex: number;
  grant: PermissionGrant;
}

function conditionsProblem(
  catalog: SubjectCatalog,
  subject: string,
  action: PermissionAction,
): string | undefined {
  if (catalog.isSystemSubject(subject)) {
    return 'system subjects take no conditions';
  }
  if (action === PermissionAction.create) {
    return 'create permissions take no conditions (a row does not exist yet)';
  }
  return undefined;
}

/**
 * Checks one submitted row on its own: shape, subject, action, field lists
 * and whether conditions are allowed at all. Pushes the issues found and
 * returns the row only when it is clean enough to be checked with the set.
 */
function checkRow(
  raw: unknown,
  index: number,
  catalog: SubjectCatalog,
  issues: AccessIssue[],
): PermissionGrant | undefined {
  const parsed = permissionInputSchema.safeParse(raw);
  if (!parsed.success) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
        [index],
        'expected { subject, action, readableFields?, writableFields?, conditions? }',
      ),
    );
    return undefined;
  }
  const { subject, action } = parsed.data;
  const isKnownSubject =
    catalog.isContentSubject(subject) || catalog.isSystemSubject(subject);
  if (!isKnownSubject) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
        [index, 'subject'],
        `unknown subject "${subject}"`,
      ),
    );
    return undefined;
  }
  if (!isAction(action) || !catalog.actionsFor(subject).includes(action)) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_ACTION,
        [index, 'action'],
        `action "${action}" is not valid on "${subject}"`,
      ),
    );
    return undefined;
  }
  const { readableFields, writableFields } = checkRowFieldLists(
    catalog,
    subject,
    action,
    parsed.data,
    [index],
    issues,
  );
  const conditions = parsed.data.conditions ?? null;
  const problem =
    conditions === null
      ? undefined
      : conditionsProblem(catalog, subject, action);
  if (problem !== undefined) {
    issues.push(
      issue(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
        [index, 'conditions'],
        problem,
      ),
    );
    return undefined;
  }
  return { subject, action, readableFields, writableFields, conditions };
}

/**
 * Root fields the set lets its role read on `subject` (same override rule
 * as the evaluator: the slug's `read` rows, else the `*` rows). `*` rows'
 * conditions can only use system fields, so `*` reads nothing here.
 */
function readableIn(
  grants: readonly PermissionGrant[],
  subject: string,
): FieldList {
  if (subject === CONTENT_WILDCARD_SUBJECT) return [];
  const reads = grants.filter(
    (grant) => grant.action === PermissionAction.read,
  );
  const own = reads.filter((grant) => grant.subject === subject);
  const used =
    own.length > 0
      ? own
      : reads.filter((grant) => grant.subject === CONTENT_WILDCARD_SUBJECT);
  return used.length === 0
    ? []
    : unionFieldLists(used.map((grant) => grant.readableFields));
}

/**
 * Conditions are checked after all rows: they depend on what the whole set
 * makes readable.
 */
function checkRowConditions(
  checkedRows: readonly CheckedRow[],
  catalog: SubjectCatalog,
  issues: AccessIssue[],
): void {
  const grants = checkedRows.map((row) => row.grant);
  for (const { inputIndex, grant } of checkedRows) {
    if (grant.conditions === null) continue;
    const conditionsCheck = validateConditions(
      grant.conditions,
      catalog.conditionFields(grant.subject, readableIn(grants, grant.subject)),
    );
    if (conditionsCheck.ok) continue;
    for (const conditionIssue of conditionsCheck.issues) {
      issues.push(
        issue(
          conditionIssue.code,
          [inputIndex, 'conditions', ...conditionIssue.path],
          conditionIssue.message,
        ),
      );
    }
  }
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
  const issues: AccessIssue[] = [];
  const checkedRows: CheckedRow[] = [];
  input.forEach((raw, inputIndex) => {
    const grant = checkRow(raw, inputIndex, catalog, issues);
    if (grant !== undefined) checkedRows.push({ inputIndex, grant });
  });
  checkRowConditions(checkedRows, catalog, issues);

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: checkedRows.map((row) => row.grant) };
}
