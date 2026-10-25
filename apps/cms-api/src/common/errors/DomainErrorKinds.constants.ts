/** The closed list of reasons a use case can refuse (ADR 0006 section 7.1). */
export const DOMAIN_ERROR_KINDS = {
  INVALID_INPUT: 'invalid_input',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  TOO_LARGE: 'too_large',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
} as const;

export type DomainErrorKind =
  (typeof DOMAIN_ERROR_KINDS)[keyof typeof DOMAIN_ERROR_KINDS];
