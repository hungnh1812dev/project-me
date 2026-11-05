import {
  apiFailureOf,
  apiIssuesOf,
  rateLimitedMessage,
  type ApiIssue,
} from '@apis/client/ApiFailure.errors';
import { API_ERROR_CODES, HTTP_STATUS } from '@configs/Http.constants';
import type { ScreenText } from '@configs/locales';

/** A failed `POST /setup/owner`, reduced to what the setup page does next. */
export type SetupError =
  | { kind: 'token-invalid' }
  | { kind: 'field-issues'; issues: ApiIssue[] }
  | { kind: 'email-taken' }
  | { kind: 'setup-closed' }
  | { kind: 'alert'; message: string };

type SetupText = ScreenText<'setup'>;

export function toSetupError(error: unknown, text: SetupText): SetupError {
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        kind: 'alert',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { kind: 'alert', message: text.setup.errors.network };
    case 'unexpected':
      return { kind: 'alert', message: text.setup.errors.unexpected };
    case 'http':
      return toHttpSetupError(failure.status, failure.errorCode, error, text);
  }
}

function toHttpSetupError(
  status: number,
  errorCode: string | undefined,
  error: unknown,
  text: SetupText,
): SetupError {
  if (status === HTTP_STATUS.UNAUTHORIZED) return { kind: 'token-invalid' };
  if (status === HTTP_STATUS.NOT_FOUND) return { kind: 'setup-closed' };
  if (status === HTTP_STATUS.CONFLICT && errorCode === API_ERROR_CODES.OWNER_EMAIL_TAKEN) {
    return { kind: 'email-taken' };
  }
  const issues = apiIssuesOf(error);
  if (status === HTTP_STATUS.BAD_REQUEST && issues.length > 0) {
    return { kind: 'field-issues', issues };
  }
  return { kind: 'alert', message: text.setup.errors.unexpected };
}
