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

  it('removes the failed script, then adds one new one on the next mount and renders the widget', () => {
    configureTurnstile({ siteKey: 'key' });
    registerTurnstileForm('login', undefined);
    fireScriptEvent('error');
    expect(turnstileScripts()).toHaveLength(0);
    registerTurnstileForm('two-factor', undefined);
    attachTurnstileContainer('login', document.createElement('div'));
    expect(turnstileScripts()).toHaveLength(1);
    expect(getTurnstileState('login').status).toBe('loading');
    const { widgets } = installFakeTurnstile();
    fireScriptEvent('load');
    expect(widgets).toHaveLength(1);
  });

  it('adds one new script element when resetTurnstile follows a load error', () => {
    registerTurnstileForm('login', undefined);
    fireScriptEvent('error');
    resetTurnstile('login');
    resetTurnstile('login');
    expect(turnstileScripts()).toHaveLength(1);
  });

  it('rejects a form id outside HUMAN_CHECK_FORMS at type level', () => {
    // @ts-expect-error not a HumanCheckForm
    expect(() => resetTurnstile('unknown-form')).not.toThrow();
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
