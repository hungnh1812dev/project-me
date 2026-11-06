import { useRef, useState } from 'react';

import { COPY } from '@/configs/Copy.constants';
import type { TurnstileAction } from '@/configs/Security.constants';

import { TurnstileWidget } from './TurnstileWidget';

const copy = COPY.login.humanCheck;

/**
 * Owns the Turnstile token and its error for one sign-in step. `field` is the
 * widget plus its error line. A token works once, so taking it mounts a fresh
 * challenge: every request carries a token of its own.
 */
export function useHumanCheck(siteKey: string, action: TurnstileAction) {
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const [hasScriptFailed, setHasScriptFailed] = useState(false);

  const keepToken = (value: string | null) => {
    tokenRef.current = value;
    setToken(value);
  };

  /** Hands out the token and starts a fresh challenge; null when none is ready. */
  const takeToken = () => {
    const taken = tokenRef.current;
    keepToken(null);
    setChallengeKey((key) => key + 1);
    return taken;
  };

  /** Like `takeToken`, and shows the "required" message when none is ready. */
  const requireToken = () => {
    if (tokenRef.current === null) {
      setErrorMessage(copy.required);
      return null;
    }
    setErrorMessage(null);
    return takeToken();
  };

  const field = (
    <div className="grid gap-1">
      <TurnstileWidget
        siteKey={siteKey}
        action={action}
        key={challengeKey}
        hasScriptFailed={hasScriptFailed}
        onFailed={() => setHasScriptFailed(true)}
        onToken={(value) => {
          keepToken(value);
          setErrorMessage(null);
        }}
        onExpired={() => {
          keepToken(null);
          setErrorMessage(copy.expired);
        }}
      />
      {errorMessage !== null ? (
        <p role="alert" className="text-destructive-strong text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );

  return { field, hasToken: token !== null, takeToken, requireToken };
}
