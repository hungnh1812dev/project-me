import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/Http.constants';
import { apiFailureOf, rateLimitedMessage } from '../../lib/ApiFailure.errors';

const copy = COPY.media.errors;

export type MediaErrorKind = 'in-use' | 'gone' | 'other';

export interface MediaError {
  kind: MediaErrorKind;
  message: string;
}

const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  [API_ERROR_CODES.MEDIA_IN_USE]: copy.inUse,
  [API_ERROR_CODES.MEDIA_NOT_FOUND]: copy.gone,
  [API_ERROR_CODES.MEDIA_UNSUPPORTED_TYPE]: copy.unsupportedType,
  [API_ERROR_CODES.MEDIA_FILE_TOO_LARGE]: copy.tooLarge,
  [API_ERROR_CODES.MEDIA_INVALID_UPLOAD]: copy.invalidUpload,
};

/** A failed media call as the library page shows it. */
export function toMediaError(error: unknown): MediaError {
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        kind: 'other',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { kind: 'other', message: COPY.access.errors.network };
    case 'unexpected':
      return { kind: 'other', message: COPY.access.errors.unexpected };
    case 'http': {
      const known =
        failure.errorCode === undefined
          ? undefined
          : MESSAGE_BY_CODE[failure.errorCode];
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
            : COPY.access.errors.unexpected),
      };
    }
  }
}
