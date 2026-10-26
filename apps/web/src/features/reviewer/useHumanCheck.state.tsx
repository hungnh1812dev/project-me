import { useState } from 'react';

import { COPY } from '../../config/Copy.constants';
import { TurnstileWidget } from './TurnstileWidget';

const copy = COPY.reviewer.turnstile;

/**
 * Owns the Turnstile token and its error for the reviewer form.
 * `field` is the widget plus its error line; render it only on the step that
 * asks for the check.
 */
export function useHumanCheck(siteKey: string) {
  const [token, setToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const [hasScriptFailed, setHasScriptFailed] = useState(false);

  /** Returns the token, or null after showing the "required" message. */
  const requireToken = () => {
    setErrorMessage(token === null ? copy.required : null);
    return token;
  };

  /** A Turnstile token works once: drop it and mount a fresh widget. */
  const renewChallenge = () => {
    setToken(null);
    setChallengeKey((key) => key + 1);
  };

  const discard = () => {
    setToken(null);
    setErrorMessage(null);
  };

  const field = (
    <div className="grid gap-1">
      <TurnstileWidget
        siteKey={siteKey}
        key={challengeKey}
        hasScriptFailed={hasScriptFailed}
        onFailed={() => setHasScriptFailed(true)}
        onToken={(value) => {
          setToken(value);
          setErrorMessage(null);
        }}
        onExpired={() => {
          setToken(null);
          setErrorMessage(copy.expired);
        }}
      />
      {errorMessage !== null ? (
        <p role="alert" className="text-sm text-destructive-strong">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );

  return { field, requireToken, renewChallenge, discard };
}
