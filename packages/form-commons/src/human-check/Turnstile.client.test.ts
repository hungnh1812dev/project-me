import { act } from '@testing-library/react';

import {
  fireScriptEvent,
  installFakeTurnstile,
  turnstileScripts,
} from '../../test/TurnstileApi.fixture';
import { TURNSTILE_SCRIPT_URL } from '../constants/Security.constants';
import {
  attachTurnstileContainer,
  configureTurnstile,
  getTurnstileState,
  registerTurnstileForm,
  resetTurnstile,
  resetTurnstileRegistryForTests,
  resolveTurnstileSiteKey,
} from './Turnstile.client';

afterEach(() => {
  resetTurnstileRegistryForTests();
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('Turnstile registry', () => {
  it('adds no script at import or configure time', () => {
    configureTurnstile({ siteKey: 'key' });
    expect(turnstileScripts()).toHaveLength(0);
  });

  it('adds one script element for two forms and a remount', () => {
    registerTurnstileForm('login', undefined);
    registerTurnstileForm('two-factor', undefined);
    const stop = attachTurnstileContainer('login', document.createElement('div'));
    stop();
    attachTurnstileContainer('login', document.createElement('div'));
    expect(turnstileScripts()).toHaveLength(1);
    expect(turnstileScripts()[0]?.src).toBe(TURNSTILE_SCRIPT_URL);
  });

  it('prefers the form site key over the configured one and names configureTurnstile when none exists', () => {
    expect(() => resolveTurnstileSiteKey()).toThrow(/configureTurnstile/);
    configureTurnstile({ siteKey: 'configured' });
    expect(resolveTurnstileSiteKey()).toBe('configured');
    expect(resolveTurnstileSiteKey('override')).toBe('override');
  });

  it('renders each widget with its form id as action, after the script loaded', () => {
    configureTurnstile({ siteKey: 'configured' });
    const { widgets } = installFakeTurnstile();
    registerTurnstileForm('login', undefined);
    registerTurnstileForm('two-factor', 'override');
    attachTurnstileContainer('login', document.createElement('div'));
    attachTurnstileContainer('two-factor', document.createElement('div'));
    expect(widgets.map((widget) => widget.options)).toEqual([
      expect.objectContaining({
        sitekey: 'configured',
        action: 'login',
        appearance: 'interaction-only',
      }),
      expect.objectContaining({ sitekey: 'override', action: 'two-factor' }),
    ]);
  });

  it('follows token, expiry and error callbacks and clears the token on reset', () => {
    configureTurnstile({ siteKey: 'key' });
    const { api, widgets } = installFakeTurnstile();
    registerTurnstileForm('login', undefined);
    attachTurnstileContainer('login', document.createElement('div'));
    const options = widgets[0]?.options;
    act(() => options?.callback('token-1'));
    expect(getTurnstileState('login')).toEqual({ token: 'token-1', status: 'ready' });
    act(() => options?.['expired-callback']());
    expect(getTurnstileState('login')).toEqual({ token: '', status: 'expired' });
    act(() => options?.callback('token-2'));
    resetTurnstile('login');
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(getTurnstileState('login').token).toBe('');
    act(() => options?.['error-callback']());
    expect(getTurnstileState('login').status).toBe('failed');
  });

  it('marks every form failed when the script cannot load', () => {
    registerTurnstileForm('login', undefined);
    attachTurnstileContainer('login', document.createElement('div'));
    fireScriptEvent('error');
    expect(getTurnstileState('login').status).toBe('failed');
  });

  it('renders the widget once the script finishes loading and removes it on detach', () => {
    configureTurnstile({ siteKey: 'key' });
    registerTurnstileForm('login', undefined);
    const stop = attachTurnstileContainer('login', document.createElement('div'));
    const { api, widgets } = installFakeTurnstile();
    expect(widgets).toHaveLength(0);
    fireScriptEvent('load');
    expect(widgets).toHaveLength(1);
    stop();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });
});
