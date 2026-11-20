import { Inject, Injectable } from '@nestjs/common';

import {
  humanCheckFailed,
  humanCheckUnavailable,
  TURNSTILE_TOKEN_MAX_LENGTH,
  type HumanCheckForm,
} from '../domain/HumanCheck.rules';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from './HumanCheck.port';

/** Answers "did a person pass the check for this form" (D25); refusals are domain errors. */
@Injectable()
export class HumanCheckService {
  constructor(@Inject(TURNSTILE_VERIFIER) private readonly verifier: TurnstileVerifier) {}

  /** Throws 503 `HUMAN_CHECK_UNAVAILABLE` or 400 `HUMAN_CHECK_FAILED`; returns when the token passed. */
  async assertPassed(
    formId: HumanCheckForm,
    token: unknown,
    clientIp: string | undefined,
  ): Promise<void> {
    if (!this.verifier.isConfigured) throw humanCheckUnavailable();
    if (typeof token !== 'string' || token === '' || token.length > TURNSTILE_TOKEN_MAX_LENGTH) {
      throw humanCheckFailed();
    }
    const outcome = await this.verifier.verify(token, clientIp, formId);
    if (outcome === 'unavailable') throw humanCheckUnavailable();
    if (outcome === 'failed') throw humanCheckFailed();
  }
}
