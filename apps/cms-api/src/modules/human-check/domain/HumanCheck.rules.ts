import { z } from 'zod';

import {
  DOMAIN_ERROR_KINDS,
  DomainError,
  type DomainErrorKind,
} from '../../../common/errors/Domain.errors';

/** Forms protected by the human check; the value is the Turnstile `action` and the form id (D25). */
export const HUMAN_CHECK_FORMS = {
  LOGIN: 'login',
  TWO_FACTOR: 'two-factor',
  OWNER_SETUP: 'owner-setup',
  PASSWORD_RESET: 'password-reset',
} as const;

export type HumanCheckForm = (typeof HUMAN_CHECK_FORMS)[keyof typeof HUMAN_CHECK_FORMS];

/** JSON body field that carries the Turnstile token. */
export const TURNSTILE_TOKEN_FIELD = 'turnstileToken';

/** Cloudflare documents Turnstile response tokens of at most 2048 characters. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;

/** Request-schema field of a protected route: unknown keys stay refused, the guard reads this one. */
export const turnstileTokenSchema = z.string().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH);

/** The body without the token: the guard consumed it, the use case never receives it. */
export function withoutTurnstileToken<T extends { [TURNSTILE_TOKEN_FIELD]?: string | undefined }>(
  body: T,
): Omit<T, typeof TURNSTILE_TOKEN_FIELD> {
  const { [TURNSTILE_TOKEN_FIELD]: _token, ...rest } = body;
  return rest;
}

export const HUMAN_CHECK_ERROR_CODES = {
  FAILED: 'HUMAN_CHECK_FAILED',
  UNAVAILABLE: 'HUMAN_CHECK_UNAVAILABLE',
} as const;

const HUMAN_CHECK_ERROR_MESSAGES = {
  FAILED: 'The verification check failed. Try again.',
  UNAVAILABLE: 'The verification check is temporarily unavailable.',
} as const;

/**
 * `passed`: the challenge was solved for this form and host. `failed`: the
 * token is missing, refused, used, or for another form or host.
 * `unavailable`: no usable answer; the caller must fail closed.
 */
export type HumanCheckOutcome = 'passed' | 'failed' | 'unavailable';

/** What Cloudflare's siteverify answered, after parsing. */
export interface SiteverifyAnswer {
  readonly success: boolean;
  readonly action: string | undefined;
  readonly hostname: string | undefined;
  readonly errorCodes: readonly string[];
}

/** Error code Cloudflare uses when its own side failed (retryable, not the visitor's fault). */
const SITEVERIFY_INTERNAL_ERROR = 'internal-error';

export interface SiteverifyExpectation {
  /** The form id the reply must name; undefined = not compared. */
  readonly expectedAction: string | undefined;
  /** Hostnames a passing reply may name; empty = not checked. */
  readonly expectedHostnames: readonly string[];
}

/** Turns a siteverify answer (undefined = none usable) into an outcome. */
export function judgeSiteverifyAnswer(
  answer: SiteverifyAnswer | undefined,
  expectation: SiteverifyExpectation,
): HumanCheckOutcome {
  if (answer === undefined) return 'unavailable';
  if (!answer.success) {
    return answer.errorCodes.includes(SITEVERIFY_INTERNAL_ERROR) ? 'unavailable' : 'failed';
  }
  if (expectation.expectedAction !== undefined && answer.action !== expectation.expectedAction) {
    return 'failed';
  }
  if (expectation.expectedHostnames.length > 0) {
    const hostname = answer.hostname?.toLowerCase();
    if (hostname === undefined || !expectation.expectedHostnames.includes(hostname)) {
      return 'failed';
    }
  }
  return 'passed';
}

function refusal(kind: DomainErrorKind, code: keyof typeof HUMAN_CHECK_ERROR_CODES): DomainError {
  return new DomainError({
    kind,
    errorCode: HUMAN_CHECK_ERROR_CODES[code],
    message: HUMAN_CHECK_ERROR_MESSAGES[code],
  });
}

/** 400: the token is missing, too long, refused, used, or for another form or host. */
export const humanCheckFailed = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.INVALID_INPUT, 'FAILED');

/** 503: no secret, or Cloudflare cannot be reached or answered unreadably (fail closed). */
export const humanCheckUnavailable = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.UNAVAILABLE, 'UNAVAILABLE');
