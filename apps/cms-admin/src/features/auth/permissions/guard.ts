import { ApiError } from '@/core/api/apiError';

import type { Decision } from './policies';

/**
 * Returns when `decision` is allowed. Otherwise throws `ApiError { status: 403, code:
 * 'ERR_CLIENT_FORBIDDEN', message: reason }`. Mutations call it first, so a denied action sends no
 * request. Shared by the content and settings features.
 */
export function guard(decision: Decision): void {
  if (decision.allowed) return;
  throw new ApiError({
    status: 403,
    code: 'ERR_CLIENT_FORBIDDEN',
    message: decision.reason ?? 'Forbidden.',
  });
}
