import {
  ACCESS_ERROR_CODES,
  CONTENT_WILDCARD_SUBJECT,
  PermissionAction,
} from './Access.constants';
import {
  isOwnerRole,
  type PermissionGrant,
  type RolePolicy,
  type TokenScope,
  type TokenScopeEntry,
  tokenScopeSchema,
} from './ActorContext.entity';
import {
  type AccessIssue,
  checkRowFieldLists,
  issue,
  type ValidationResult,
} from './FieldList.rules';
import {
  fieldListAllows,
  type FieldList,
  unionFieldLists,
} from './FieldPaths.rules';
import type { SubjectCatalog } from './SubjectCatalog.rules';

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
    const entryPath = ['permissions', index];
    if (!catalog.isContentSubject(entry.subject)) {
      issues.push(
        issue(
          ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
          [...entryPath, 'subject'],
          `tokens can only reach content subjects, not "${entry.subject}"`,
        ),
      );
      return;
    }
    checkRowFieldLists(
      catalog,
      entry.subject,
      entry.action,
      entry,
      entryPath,
      issues,
    );
  });
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: parsed.data };
}

/** The field list an entry of this action is checked on, or null (no list). */
function fieldListOf(
  action: PermissionAction,
  entry: {
    readableFields?: FieldList | undefined;
    writableFields?: FieldList | undefined;
  },
): FieldList {
  if (action === PermissionAction.read) return entry.readableFields ?? null;
  if (
    action === PermissionAction.create ||
    action === PermissionAction.update
  ) {
    return entry.writableFields ?? null;
  }
  return null;
}

function grantFieldList(grant: PermissionGrant): FieldList {
  return fieldListOf(grant.action, grant);
}

/**
 * The creator's rows that cover `entry`: same action, and the rows of the
 * entry's own slug, or the `*` rows when it has none (the evaluator's
 * override rule, see `intersectTokenScope`). A `*` entry is covered by `*`
 * rows only: a creator with rows per type does not hold "every type".
 */
function coveringGrants(
  entry: TokenScopeEntry,
  creatorGrants: readonly PermissionGrant[],
): PermissionGrant[] {
  const sameAction = creatorGrants.filter(
    (grant) => grant.action === entry.action,
  );
  const wildcard = sameAction.filter(
    (grant) => grant.subject === CONTENT_WILDCARD_SUBJECT,
  );
  if (entry.subject === CONTENT_WILDCARD_SUBJECT) return wildcard;
  const specific = sameAction.filter(
    (grant) => grant.subject === entry.subject,
  );
  return specific.length > 0 ? specific : wildcard;
}

/**
 * D5 subset check: indexes of the scope entries the creator does not hold.
 * An entry is held when the creator has the action on its subject and the
 * entry's field list lies inside the union of the creator's lists. Row
 * conditions are not compared: the token never loses the creator's
 * conditions (`intersectTokenScope` keeps them), so they only narrow it.
 * The owner holds every content permission.
 */
export function scopeEntriesBeyondCreator(
  scope: TokenScope,
  creatorRole: RolePolicy,
): number[] {
  if (isOwnerRole(creatorRole)) return [];
  const beyond: number[] = [];
  scope.permissions.forEach((entry, index) => {
    const covering = coveringGrants(entry, creatorRole.permissions);
    if (covering.length === 0) {
      beyond.push(index);
      return;
    }
    const held = unionFieldLists(covering.map(grantFieldList));
    const wanted = fieldListOf(entry.action, entry);
    const inside =
      held === null ||
      (wanted !== null && wanted.every((path) => fieldListAllows(held, path)));
    if (!inside) beyond.push(index);
  });
  return beyond;
}
