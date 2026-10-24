import { ACCESS_ERROR_CODES } from './access.constants';
import { type TokenScope, tokenScopeSchema } from './actor-context';
import { checkRowFieldLists } from './field-list.check';
import type { SubjectCatalog } from './subject-catalog';
import {
  type AccessIssue,
  issue,
  type ValidationResult,
} from './validation-issue';

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
