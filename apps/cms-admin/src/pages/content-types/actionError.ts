import { isApiError } from '@/core/api/apiError';

/** What a forbidden action shows where it was started (AC-33). */
export const NO_ACCESS = "You don't have access to do this.";

/** The message a failed action shows: "no access" for a 403, else the error's own message. */
export function actionErrorText(error: unknown): string {
  if (isApiError(error) && error.status === 403) return NO_ACCESS;
  return error instanceof Error && error.message !== '' ? error.message : NO_ACCESS;
}
