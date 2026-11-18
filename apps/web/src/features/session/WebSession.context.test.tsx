import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { AuthApi } from './Auth.api';
import { fakeApi, TEST_USER, Wrapper } from './Session.fixture';
import { useWebSession } from './WebSession.context';

function setup(api = fakeApi()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Wrapper api={api}>{children}</Wrapper>
  );
  return { api, ...renderHook(() => useWebSession(), { wrapper }) };
}

describe('useWebSession', () => {
  it('starts unknown, then anonymous when the BFF has no session', async () => {
    const { result, api } = setup();
    expect(result.current.status).toBe('unknown');
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
    expect(api.readSession).toHaveBeenCalledTimes(1);
  });

  it('restores the signed-in visitor from the BFF session on mount', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual(TEST_USER);
  });

  it('settles anonymous when the session read fails', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockRejectedValue(new Error('offline')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });

  it('reads the session once even when the effect is replayed', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useWebSession(), {
      wrapper: ({ children }) => (
        <StrictMode>
          <Wrapper api={api}>{children}</Wrapper>
        </StrictMode>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(api.readSession).toHaveBeenCalledTimes(1);
  });

  it('signs in without 2FA and exposes the visitor', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({ kind: 'signed-in', user: TEST_USER }),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signIn({
        email: 'a@b.co',
        password: 'pw',
        rememberMe: false,
        humanCheckToken: 'hc',
      });
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(TEST_USER);
    expect(api.login).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw',
      rememberMe: false,
      humanCheckToken: 'hc',
    });
  });

  it('stays anonymous at the 2FA step and completes it with the code', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'two-factor-required', methods: ['totp'] }),
      verifyTwoFactor: vi.fn<AuthApi['verifyTwoFactor']>().mockResolvedValue(TEST_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signIn({ email: 'a@b.co', password: 'pw', rememberMe: false });
    });
    expect(result.current.status).toBe('anonymous');
    await act(async () => {
      await result.current.completeTwoFactor({ code: '123456' });
    });
    expect(result.current.status).toBe('authenticated');
    expect(api.verifyTwoFactor).toHaveBeenCalledWith({ code: '123456' });
  });

  it('stays anonymous and rethrows when the sign-in is refused', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockRejectedValue(new Error('refused')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.signIn({ email: 'a@b.co', password: 'pw', rememberMe: false }),
      ).rejects.toThrow('refused');
    });
    expect(result.current.status).toBe('anonymous');
  });

  it('sends the email code request through the API', async () => {
    const { result, api } = setup();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(() => result.current.sendLoginEmailCode({ humanCheckToken: 'hc' }));
    expect(api.sendLoginEmailCode).toHaveBeenCalledWith({ humanCheckToken: 'hc' });
  });

  it('signs out through the API and resets', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('stays signed in and reports the failure when logout fails', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
      logout: vi.fn<AuthApi['logout']>().mockRejectedValue(new Error('offline')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('offline');
    });
    expect(result.current.status).toBe('authenticated');
  });

  it('exposes no token, reviewer or storage state', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(Object.keys(result.current).sort()).toEqual([
      'completeTwoFactor',
      'sendLoginEmailCode',
      'signIn',
      'signOut',
      'status',
      'user',
    ]);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).toBe('{}');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useWebSession())).toThrow(/WebSessionProvider/);
  });
});
