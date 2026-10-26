import { INVALID_REQUEST_ERROR } from '../../../../common/constants/Error.constants';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
  type DomainErrorKind,
} from '../../../../common/errors/Domain.errors';
import { ACCESS_ERROR_CODES } from '../../domain/Access.constants';
import { API_TOKEN } from '../../domain/ApiToken.rules';
import {
  EXPIRY_NOT_IN_FUTURE_ISSUE,
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './AccessManagement.constants';

type ManagementErrorName = keyof typeof MANAGEMENT_ERROR_CODES;

function refusal(
  kind: DomainErrorKind,
  name: ManagementErrorName,
  details?: unknown,
): DomainError {
  return new DomainError({
    kind,
    errorCode: MANAGEMENT_ERROR_CODES[name],
    message: MANAGEMENT_ERROR_MESSAGES[name],
    ...(details === undefined ? {} : { details }),
  });
}

/** A validation problem as the issue list of a 400 body reports it. */
export interface ManagementIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

const { CONFLICT, FORBIDDEN, INVALID_INPUT, NOT_FOUND } = DOMAIN_ERROR_KINDS;

export const accountNotFound = (): DomainError =>
  refusal(NOT_FOUND, 'ACCOUNT_NOT_FOUND');
export const emailTaken = (): DomainError =>
  refusal(CONFLICT, 'ACCOUNT_EMAIL_TAKEN');
export const accountAlreadyDisabled = (): DomainError =>
  refusal(CONFLICT, 'ACCOUNT_ALREADY_DISABLED');
export const accountNotDisabled = (): DomainError =>
  refusal(CONFLICT, 'ACCOUNT_NOT_DISABLED');
export const accountNotInvited = (): DomainError =>
  refusal(CONFLICT, 'ACCOUNT_NOT_INVITED');

export const roleNotFound = (): DomainError =>
  refusal(NOT_FOUND, 'ROLE_NOT_FOUND');
export const roleNotAssignable = (): DomainError =>
  refusal(INVALID_INPUT, 'ROLE_NOT_ASSIGNABLE');
export const roleSlugTaken = (): DomainError =>
  refusal(CONFLICT, 'ROLE_SLUG_TAKEN');
export const roleSystemImmutable = (): DomainError =>
  refusal(CONFLICT, 'ROLE_SYSTEM_IMMUTABLE');
export const roleLimitReached = (): DomainError =>
  refusal(CONFLICT, 'ROLE_LIMIT_REACHED');
export const roleInUse = (accountCount: number): DomainError =>
  refusal(CONFLICT, 'ROLE_IN_USE', { accountCount });

/** The permission rows at `indexes` grant a system subject action the actor lacks. */
export const permissionNotHeld = (indexes: readonly number[]): DomainError =>
  refusal(FORBIDDEN, 'PERMISSION_NOT_HELD', { indexes });

/** The first issue names the error; every issue is listed in `details`. */
export function invalidIssues(issues: readonly ManagementIssue[]): DomainError {
  const [first] = issues;
  return new DomainError({
    kind: INVALID_INPUT,
    ...(first === undefined
      ? {}
      : { errorCode: first.code, message: first.message }),
    details: { issues },
  });
}

export const tokenNotFound = (): DomainError =>
  refusal(NOT_FOUND, 'TOKEN_NOT_FOUND');
export const tokenRevoked = (): DomainError =>
  refusal(CONFLICT, 'TOKEN_REVOKED');
export const tokenExpired = (): DomainError =>
  refusal(CONFLICT, 'TOKEN_EXPIRED');

/** The scope entries at `indexes` are not held by the token's creator (D5). */
export const tokenScopeNotHeld = (indexes: readonly number[]): DomainError =>
  refusal(FORBIDDEN, 'TOKEN_SCOPE_NOT_HELD', { indexes });

export const tokenScopeTooLarge = (): DomainError =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
    message: `A token scope holds at most ${API_TOKEN.MAX_SCOPE_ENTRIES} entries.`,
  });

export const expiryNotInFuture = (): DomainError =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: INVALID_REQUEST_ERROR.CODE,
    message: INVALID_REQUEST_ERROR.MESSAGE,
    details: {
      issues: [{ path: ['expiresAt'], message: EXPIRY_NOT_IN_FUTURE_ISSUE }],
    },
  });
