import { Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  TURNSTILE_FIELDS,
  TURNSTILE_INTERNAL_ERROR,
  TURNSTILE_SITEVERIFY_URL,
  TURNSTILE_TIMEOUT_MS,
} from './turnstile.constants';
import type { TurnstileOutcome, TurnstileVerifier } from './turnstile.port';

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
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

  verify(): Promise<TurnstileOutcome> {
    return Promise.resolve('unavailable');
  }
}

/** Cloudflare Turnstile siteverify over HTTPS. The secret never leaves this class. */
export class TurnstileClient implements TurnstileVerifier {
  readonly isConfigured = true;
  private readonly logger = new Logger(TurnstileClient.name);

  private readonly fetchFn: HttpFetch;
  private readonly expectedHostname: string | undefined;

  /**
   * `expectedHostname`: when set, a passing reply must name exactly this
   * hostname (the page that hosts the widget), else the token is `failed`.
   */
  constructor(
    private readonly secretKey: string,
    options: { fetchFn?: HttpFetch; expectedHostname?: string | undefined } = {},
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.expectedHostname = options.expectedHostname;
  }

  async verify(
    responseToken: string,
    remoteIp?: string,
  ): Promise<TurnstileOutcome> {
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
      if (!reply.ok) return 'unavailable';
      const parsedReply = siteverifyResponseSchema.safeParse(
        await reply.json(),
      );
      if (!parsedReply.success) return 'unavailable';
      if (parsedReply.data.success) {
        const wrongHost =
          this.expectedHostname !== undefined &&
          parsedReply.data.hostname?.toLowerCase() !== this.expectedHostname;
        return wrongHost ? 'failed' : 'passed';
      }
      return parsedReply.data['error-codes']?.includes(TURNSTILE_INTERNAL_ERROR) ===
        true
        ? 'unavailable'
        : 'failed';
    } catch {
      this.logger.warn('Turnstile verification request failed.');
      return 'unavailable';
    }
  }
}
