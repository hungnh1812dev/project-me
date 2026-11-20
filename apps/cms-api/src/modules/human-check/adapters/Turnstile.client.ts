import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { MS_PER_SECOND } from '../../../common/constants/Time.constants';
import { TURNSTILE_ALWAYS_PASS_TEST_SECRET } from '../../../config/Config.constants';
import type { TurnstileVerifier } from '../application/HumanCheck.port';
import {
  judgeSiteverifyAnswer,
  type HumanCheckOutcome,
  type SiteverifyAnswer,
} from '../domain/HumanCheck.rules';

/** Cloudflare's server-side verification endpoint (provider contract, not config). */
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Verification must not hold a request open longer than this. */
const TURNSTILE_TIMEOUT_MS = 5 * MS_PER_SECOND;

/** Form fields of the siteverify request. */
const TURNSTILE_FIELDS = {
  SECRET: 'secret',
  RESPONSE: 'response',
  REMOTE_IP: 'remoteip',
} as const;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

export type HttpFetch = (
  url: string,
  init: { method: string; body: URLSearchParams; signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Used when TURNSTILE_SECRET_KEY is unset: never verifies, so callers fail closed. */
export class UnconfiguredTurnstileVerifier implements TurnstileVerifier {
  readonly isConfigured = false;

  verify(): Promise<HumanCheckOutcome> {
    return Promise.resolve('unavailable');
  }
}

/** Cloudflare Turnstile siteverify over HTTPS. The secret never leaves this class. */
export class TurnstileClient implements TurnstileVerifier {
  readonly isConfigured = true;
  private readonly logger = new Logger(TurnstileClient.name);

  private readonly fetchFn: HttpFetch;
  private readonly expectedHostnames: readonly string[];

  /**
   * `expectedHostnames`: when not empty, a passing reply must name one of
   * them (the pages that host the widget), else the token is `failed`.
   */
  constructor(
    private readonly secretKey: string,
    options: {
      fetchFn?: HttpFetch;
      expectedHostnames?: readonly string[];
    } = {},
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.expectedHostnames = options.expectedHostnames ?? [];
  }

  async verify(
    responseToken: string,
    remoteIp?: string,
    expectedAction?: string,
  ): Promise<HumanCheckOutcome> {
    const answer = await this.askSiteverify(responseToken, remoteIp);
    // The always-pass test secret answers no real action, so only it skips that comparison.
    const isActionChecked = this.secretKey !== TURNSTILE_ALWAYS_PASS_TEST_SECRET;
    return judgeSiteverifyAnswer(answer, {
      expectedAction: isActionChecked ? expectedAction : undefined,
      expectedHostnames: this.expectedHostnames,
    });
  }

  /** The parsed reply, or undefined when Cloudflare gave no usable one. */
  private async askSiteverify(
    responseToken: string,
    remoteIp: string | undefined,
  ): Promise<SiteverifyAnswer | undefined> {
    const formFields = new URLSearchParams({
      [TURNSTILE_FIELDS.SECRET]: this.secretKey,
      [TURNSTILE_FIELDS.RESPONSE]: responseToken,
    });
    if (remoteIp !== undefined) {
      formFields.set(TURNSTILE_FIELDS.REMOTE_IP, remoteIp);
    }
    try {
      const reply = await this.fetchFn(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        body: formFields,
        signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
      });
      if (!reply.ok) return undefined;
      const parsedReply = siteverifyResponseSchema.safeParse(await reply.json());
      if (!parsedReply.success) return undefined;
      return {
        success: parsedReply.data.success,
        action: parsedReply.data.action,
        hostname: parsedReply.data.hostname,
        errorCodes: parsedReply.data['error-codes'] ?? [],
      };
    } catch {
      this.logger.warn('Turnstile verification request failed.');
      return undefined;
    }
  }
}
