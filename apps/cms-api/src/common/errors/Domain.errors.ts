import type { DomainErrorKind } from './DomainErrorKinds.constants';

export interface DomainErrorInit {
  kind: DomainErrorKind;
  /** Omitted: the transport answers with the default code of the kind's status. */
  errorCode?: string;
  /** Omitted: the transport answers with the default message of the kind's status. */
  message?: string;
  /** Machine-readable context of a client error; never sent for `unavailable`. */
  details?: unknown;
  /** `rate_limited` only: becomes the `Retry-After` header. */
  retryAfterSeconds?: number;
}

/**
 * A refusal decided by a business rule. It knows nothing of HTTP: the kind
 * is mapped to a status in one place (`common/http`).
 */
export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly errorCode: string | undefined;
  readonly details: unknown;
  readonly retryAfterSeconds: number | undefined;
  /** `Error.message` is always a string, so "none given" is kept apart. */
  readonly hasMessage: boolean;

  constructor(init: DomainErrorInit) {
    super(init.message ?? init.errorCode ?? init.kind);
    this.name = 'DomainError';
    this.kind = init.kind;
    this.errorCode = init.errorCode;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.hasMessage = init.message !== undefined;
  }
}
