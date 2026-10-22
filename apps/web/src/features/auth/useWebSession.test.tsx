import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { type AuthApi, PrivilegedAccessError } from './auth.api';
import { fakeApi, PRIVILEGED_USER, TEST_USER, Wrapper } from './test-utils';
import { useWebSession } from './useWebSession';

function setup(api = fakeApi()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Wrapper api={api}>{children}</Wrapper>
  );
  return { api, ...renderHook(() => useWebSession(), { wrapper }) };
}

describe('useWebSession', () => {
  it('starts unknown, then anonymous when the silent refresh is refused', async () => {
    const { result, api } = setup();
    expect(result.current.status).toBe('unknown');
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.getAccessToken()).toBeNull();
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.me).not.toHaveBeenCalled();
  });

  it('restores the session from the refresh cookie on mount', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok-1'),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual(TEST_USER);
    expect(result.current.getAccessToken()).toBe('tok-1');
    expect(api.me).toHaveBeenCalledWith('tok-1');
  });

  it('refreshes once even when the effect is replayed', async () => {
    const api = fakeApi();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Wrapper api={api}>{children}</Wrapper>
    );
    const { result } = renderHook(() => useWebSession(), {
      wrapper: ({ children }) => (
        <StrictModeWrapper>{wrapper({ children })}</StrictModeWrapper>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('signs in without 2FA and exposes the actor', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 't2' }),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signIn({ email: 'a@b.co', password: 'pw' });
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.getAccessToken()).toBe('t2');
  });

  it('stays anonymous at the 2FA step and completes it with the code', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockResolvedValue('t3'),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signIn({ email: 'a@b.co', password: 'pw' });
    });
    expect(result.current.status).toBe('anonymous');
    await act(async () => {
      await result.current.completeTwoFactor({
        tempToken: 'tmp',
        code: '123456',
      });
    });
    expect(result.current.status).toBe('authenticated');
    expect(api.verifyTwoFactor).toHaveBeenCalledWith({
      tempToken: 'tmp',
      code: '123456',
    });
  });

  it('drops the token when the account cannot be loaded', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 't' }),
      me: vi.fn<AuthApi['me']>().mockRejectedValue(new Error('boom')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.signIn({ email: 'a@b.co', password: 'pw' }),
      ).rejects.toThrow('boom');
    });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('signs out through the API and resets', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('stays signed in and reports the failure when logout fails', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
      logout: vi
        .fn<AuthApi['logout']>()
        .mockRejectedValue(new Error('offline')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('offline');
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.getAccessToken()).toBe('tok');
  });

  it('holds no session for a privileged account after the silent refresh', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('refuses a privileged sign-in and keeps the web anonymous', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 'adm' }),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.signIn({ email: 'a@b.co', password: 'pw' }),
      ).rejects.toBeInstanceOf(PrivilegedAccessError);
    });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.getAccessToken()).toBeNull();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('still refuses a privileged sign-in when the revoking logout fails', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 'adm' }),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
      logout: vi.fn<AuthApi['logout']>().mockRejectedValue(new Error('down')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.signIn({ email: 'a@b.co', password: 'pw' }),
      ).rejects.toBeInstanceOf(PrivilegedAccessError);
    });
    expect(result.current.status).toBe('anonymous');
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useWebSession())).toThrow(
      /WebSessionProvider/,
    );
  });
});

import { StrictMode } from 'react';
function StrictModeWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}
