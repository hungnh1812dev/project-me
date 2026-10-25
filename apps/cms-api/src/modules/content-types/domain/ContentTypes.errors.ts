import { DomainError } from '../../../common/errors/Domain.errors';

/** Error codes of the content types API. */
export const CONTENT_TYPES_ERROR_CODES = {
  /**
   * The slug is not registered, or the caller may not read it. Both answer
   * the same 404 so the API does not reveal which types exist.
   */
  NOT_FOUND: 'CONTENT_TYPE_NOT_FOUND',
} as const;

export const CONTENT_TYPES_ERROR_MESSAGES = {
  NOT_FOUND: 'Content type not found.',
} as const;

export function contentTypeNotFound(): DomainError {
  return new DomainError({
    kind: 'not_found',
    errorCode: CONTENT_TYPES_ERROR_CODES.NOT_FOUND,
    message: CONTENT_TYPES_ERROR_MESSAGES.NOT_FOUND,
  });
}
