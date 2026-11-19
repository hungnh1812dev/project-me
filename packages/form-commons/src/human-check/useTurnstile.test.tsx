import { act, render, screen } from '@testing-library/react';

import { finishScriptLoad, turnstileScripts } from '../../test/TurnstileApi.fixture';
import { configureTurnstile, resetTurnstileRegistryForTests } from './Turnstile.client';
import { TurnstileSlot } from './TurnstileSlot';
import { useTurnstile } from './useTurnstile';

const TEXT = { loading: 'Loading check', failed: 'Check failed', expired: 'Check expired' };

function Form({ formId, siteKey }: { formId: string; siteKey?: string }) {
  const token = useTurnstile(formId, siteKey);
  return (
    <div>
      <output data-testid={`token-${formId}`}>{token}</output>
      <TurnstileSlot formId={formId} text={TEXT} />
    </div>
  );
}

afterEach(() => {
  resetTurnstileRegistryForTests();
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('useTurnstile', () => {
  it('throws an error naming configureTurnstile without a site key', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Form formId="login" />)).toThrow(/configureTurnstile/);
  });

  it('returns the token once the widget solved it and an empty string after expiry', () => {
    configureTurnstile({ siteKey: 'key' });
    render(<Form formId="login" />);
    const { widgets } = finishScriptLoad();
    expect(screen.getByTestId('token-login')).toHaveTextContent('');
    act(() => widgets[0]?.options.callback('token-1'));
    expect(screen.getByTestId('token-login')).toHaveTextContent('token-1');
    act(() => widgets[0]?.options['expired-callback']());
    expect(screen.getByTestId('token-login')).toHaveTextContent('');
  });

  it('uses the hook site key over the configured one', () => {
    configureTurnstile({ siteKey: 'configured' });
    render(<Form formId="login" siteKey="override" />);
    const { widgets } = finishScriptLoad();
    expect(widgets[0]?.options.sitekey).toBe('override');
  });

  it('shares one script between two forms on a page', () => {
    configureTurnstile({ siteKey: 'key' });
    render(
      <>
        <Form formId="login" />
        <Form formId="two-factor" />
      </>,
    );
    expect(turnstileScripts()).toHaveLength(1);
    const { widgets } = finishScriptLoad();
    expect(widgets.map((widget) => widget.options.action)).toEqual(['login', 'two-factor']);
  });
});
