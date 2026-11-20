import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { TurnstileClient, UnconfiguredTurnstileVerifier } from './adapters/Turnstile.client';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from './application/HumanCheck.port';
import { HumanCheckService } from './application/HumanCheck.service';
import { HumanCheckGuard } from './http/HumanCheck.guard';

export function createTurnstileVerifier(config: IAppConfig): TurnstileVerifier {
  const secret = config.secrets.turnstileSecretKey;
  return secret === undefined
    ? new UnconfiguredTurnstileVerifier()
    : new TurnstileClient(secret, { expectedHostnames: config.humanCheck.expectedHostnames });
}

/** The human check (Cloudflare Turnstile) of public forms and reviewer sessions (D25). */
@Module({
  providers: [
    HumanCheckService,
    HumanCheckGuard,
    { provide: TURNSTILE_VERIFIER, inject: [APP_CONFIG], useFactory: createTurnstileVerifier },
  ],
  exports: [HumanCheckService, HumanCheckGuard, TURNSTILE_VERIFIER],
})
export class HumanCheckModule {}
