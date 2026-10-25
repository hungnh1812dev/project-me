import { HttpStatus } from '@nestjs/common';

import {
  DOMAIN_ERROR_KINDS,
  type DomainErrorKind,
} from '../errors/DomainErrorKinds.constants';

/** The one table from a domain error kind to its HTTP status. */
export const DOMAIN_ERROR_HTTP_STATUS: Readonly<
  Record<DomainErrorKind, number>
> = {
  [DOMAIN_ERROR_KINDS.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [DOMAIN_ERROR_KINDS.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [DOMAIN_ERROR_KINDS.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [DOMAIN_ERROR_KINDS.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DOMAIN_ERROR_KINDS.CONFLICT]: HttpStatus.CONFLICT,
  [DOMAIN_ERROR_KINDS.TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE]:
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  [DOMAIN_ERROR_KINDS.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [DOMAIN_ERROR_KINDS.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

/** What Nest's own exception for the status says when no message is given. */
export const DOMAIN_ERROR_DEFAULT_MESSAGE: Readonly<
  Record<DomainErrorKind, string>
> = {
  [DOMAIN_ERROR_KINDS.INVALID_INPUT]: 'Bad Request',
  [DOMAIN_ERROR_KINDS.UNAUTHENTICATED]: 'Unauthorized',
  [DOMAIN_ERROR_KINDS.FORBIDDEN]: 'Forbidden',
  [DOMAIN_ERROR_KINDS.NOT_FOUND]: 'Not Found',
  [DOMAIN_ERROR_KINDS.CONFLICT]: 'Conflict',
  [DOMAIN_ERROR_KINDS.TOO_LARGE]: 'Payload Too Large',
  [DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [DOMAIN_ERROR_KINDS.RATE_LIMITED]: 'Too Many Requests',
  [DOMAIN_ERROR_KINDS.UNAVAILABLE]: 'Service Unavailable',
};
