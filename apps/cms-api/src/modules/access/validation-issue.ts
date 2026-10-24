import type { AccessErrorCode } from './access.constants';

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
