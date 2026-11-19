import { renderToString } from 'react-dom/server';
import { act, render, screen } from '@testing-library/react';

import {
  finishScriptLoad,
  fireScriptEvent,
  turnstileScripts,
} from '../../test/TurnstileApi.fixture';
import { configureTurnstile, resetTurnstileRegistryForTests } from './Turnstile.client';
import { TurnstileSlot } from './TurnstileSlot';
import { useTurnstile } from './useTurnstile';

const TEXT = { loading: 'Loading check', failed: 'Check failed', expired: 'Check expired' };

function Form() {
  useTurnstile('login');
  return <TurnstileSlot formId="login" text={TEXT} />;
}

afterEach(() => {
  resetTurnstileRegistryForTests();
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('TurnstileSlot', () => {
  it('shows the loading text while the script loads, then nothing', () => {
    configureTurnstile({ siteKey: 'key' });
    render(<Form />);
    expect(screen.getByText(TEXT.loading).tagName).toBe('OUTPUT');
    finishScriptLoad();
    expect(screen.queryByText(TEXT.loading)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the widget into its container', () => {
    configureTurnstile({ siteKey: 'key' });
    const { container } = render(<Form />);
    const { widgets } = finishScriptLoad();
    expect(container.contains(widgets[0]?.container ?? null)).toBe(true);
  });

  it('shows an alert when the widget reports an error or the script fails', () => {
    configureTurnstile({ siteKey: 'key' });
    render(<Form />);
    fireScriptEvent('error');
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.failed);
  });

  it('shows an alert when the token expired', () => {
    configureTurnstile({ siteKey: 'key' });
    render(<Form />);
    const { widgets } = finishScriptLoad();
    act(() => widgets[0]?.options['expired-callback']());
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.expired);
  });

  it('renders on the server without touching window', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    // @ts-expect-error simulate a server render
    delete globalThis.window;
    try {
      const html = renderToString(<TurnstileSlot formId="login" text={TEXT} />);
      expect(html).toContain(TEXT.loading);
    } finally {
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    }
    expect(turnstileScripts()).toHaveLength(0);
  });
});
