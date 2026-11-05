import { render } from '@testing-library/react';

import { TURNSTILE } from '../../configs/Security.constants';
import type { TurnstileApi } from './Turnstile.client';
import { TurnstileWidget } from './TurnstileWidget';

vi.mock('next/script', () => ({ default: () => null }));

function stubTurnstile() {
  const api = {
    render: vi.fn<TurnstileApi['render']>().mockReturnValue('widget-1'),
    reset: vi.fn<TurnstileApi['reset']>(),
    remove: vi.fn<TurnstileApi['remove']>(),
  };
  window.turnstile = api;
  return api;
}

afterEach(() => {
  delete window.turnstile;
});

describe('TurnstileWidget', () => {
  it('renders the challenge for the action of its step and removes it on unmount', () => {
    const api = stubTurnstile();
    const { unmount } = render(
      <TurnstileWidget
        siteKey="site-key"
        action={TURNSTILE.ACTIONS.TWO_FACTOR}
        hasScriptFailed={false}
        onFailed={vi.fn()}
        onToken={vi.fn()}
        onExpired={vi.fn()}
      />,
    );
    expect(api.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: 'site-key', action: 'two-factor' }),
    );
    unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('hands the token and the failure to its parent', () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    const onFailed = vi.fn();
    render(
      <TurnstileWidget
        siteKey="site-key"
        action={TURNSTILE.ACTIONS.LOGIN}
        hasScriptFailed={false}
        onFailed={onFailed}
        onToken={onToken}
        onExpired={vi.fn()}
      />,
    );
    const options = api.render.mock.calls[0]?.[1];
    options?.callback('abc');
    options?.['error-callback']();
    expect(onToken).toHaveBeenCalledWith('abc');
    expect(onFailed).toHaveBeenCalled();
  });
});
