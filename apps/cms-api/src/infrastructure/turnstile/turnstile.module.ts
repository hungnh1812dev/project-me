import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  TurnstileClient,
  UnconfiguredTurnstileVerifier,
} from './turnstile.client';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from './turnstile.port';

export function createTurnstileVerifier(config: IAppConfig): TurnstileVerifier {
  const secret = config.secrets.turnstileSecretKey;
  return secret === undefined
    ? new UnconfiguredTurnstileVerifier()
    : new TurnstileClient(secret, {
        expectedHostname: config.reviewer.turnstileExpectedHostname,
      });
}

/** Provides `TURNSTILE_VERIFIER` (T31). */
@Module({
  providers: [
    {
      provide: TURNSTILE_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: createTurnstileVerifier,
    },
  ],
  exports: [TURNSTILE_VERIFIER],
})
export class TurnstileModule {}
