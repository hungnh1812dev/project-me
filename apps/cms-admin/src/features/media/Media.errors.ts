import {
  apiFailureOf,
  isRequestCanceled,
  isRequestTimeout,
  rateLimitedMessage,
} from '@apis/client/ApiFailure.errors';
import { API_ERROR_CODES, HTTP_STATUS } from '@configs/Http.constants';
import type { ScreenText } from '@configs/locales';

export type MediaErrorKind = 'in-use' | 'gone' | 'canceled' | 'other';

export interface MediaError {
  kind: MediaErrorKind;
  message: string;
}

type MediaErrorText = ScreenText<'media'> & ScreenText<'access'>;

const messageByCodeOf = (
  copy: ScreenText<'media'>['media']['errors'],
): Readonly<Record<string, string>> => ({
  [API_ERROR_CODES.MEDIA_IN_USE]: copy.inUse,
  [API_ERROR_CODES.MEDIA_NOT_FOUND]: copy.gone,
  [API_ERROR_CODES.MEDIA_UNSUPPORTED_TYPE]: copy.unsupportedType,
  [API_ERROR_CODES.MEDIA_FILE_TOO_LARGE]: copy.tooLarge,
  [API_ERROR_CODES.MEDIA_INVALID_UPLOAD]: copy.invalidUpload,
});

/** A failed media call as the library page shows it. */
export function toMediaError(error: unknown, text: MediaErrorText): MediaError {
  const copy = text.media.errors;
  if (isRequestCanceled(error)) return { kind: 'canceled', message: '' };
  if (isRequestTimeout(error)) return { kind: 'other', message: copy.timeout };
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        kind: 'other',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { kind: 'other', message: text.access.errors.network };
    case 'unexpected':
      return { kind: 'other', message: text.access.errors.unexpected };
    case 'http': {
      const known =
        failure.errorCode === undefined ? undefined : messageByCodeOf(copy)[failure.errorCode];
      const kind: MediaErrorKind =
        failure.errorCode === API_ERROR_CODES.MEDIA_IN_USE
          ? 'in-use'
          : failure.errorCode === API_ERROR_CODES.MEDIA_NOT_FOUND
            ? 'gone'
            : 'other';
      return {
        kind,
        message:
          known ??
          (failure.status === HTTP_STATUS.FORBIDDEN
            ? copy.forbidden
            : text.access.errors.unexpected),
      };
    }
  }
}
