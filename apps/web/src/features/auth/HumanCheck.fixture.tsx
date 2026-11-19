import { useEffect, useSyncExternalStore } from 'react';

/** State of the fake Turnstile kit: `solves` decides whether a mount or a reset issues a token. */
export const humanCheckFake = {
  solves: true,
  tokensIssued: 0,
  resetFormIds: [] as string[],
  tokens: new Map<string, string>(),
  listeners: new Set<() => void>(),
};

export function resetHumanCheckFake(): void {
  humanCheckFake.solves = true;
  humanCheckFake.tokensIssued = 0;
  humanCheckFake.resetFormIds = [];
  humanCheckFake.tokens.clear();
}

function setToken(formId: string, token: string): void {
  humanCheckFake.tokens.set(formId, token);
  humanCheckFake.listeners.forEach((listener) => listener());
}

function issueToken(formId: string): void {
  setToken(formId, humanCheckFake.solves ? `${formId}-token-${++humanCheckFake.tokensIssued}` : '');
}

/**
 * Stands in for `@abyss/form-commons/human-check` (Cloudflare is not reachable in tests): a
 * mount issues a token, `resetTurnstile` replaces it, and the form id keys every token.
 */
export function fakeHumanCheckKit(constants: object) {
  return {
    ...constants,
    useTurnstile(formId: string): string {
      useEffect(() => {
        issueToken(formId);
        return () => {
          humanCheckFake.tokens.delete(formId);
        };
      }, [formId]);
      return useSyncExternalStore(
        (listener) => {
          humanCheckFake.listeners.add(listener);
          return () => humanCheckFake.listeners.delete(listener);
        },
        () => humanCheckFake.tokens.get(formId) ?? '',
        () => '',
      );
    },
    TurnstileSlot: ({ formId }: { formId: string }) => <div data-testid={`turnstile-${formId}`} />,
    resetTurnstile(formId: string): void {
      humanCheckFake.resetFormIds.push(formId);
      issueToken(formId);
    },
  };
}
