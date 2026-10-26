import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { type AuthApi, PrivilegedAccessError } from './Auth.api';
import {
  fakeApi,
  PRIVILEGED_USER,
  TEST_USER,
  Wrapper,
} from './Session.fixture';
import { useWebSession } from './WebSession.context';

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

  it('does not revoke the refresh family after the silent refresh (I3)', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('revokes the refresh family when a privileged 2FA completes (I3)', async () => {
    const api = fakeApi({
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockResolvedValue('adm'),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.completeTwoFactor({ tempToken: 't', code: '123456' }),
      ).rejects.toBeInstanceOf(PrivilegedAccessError);
    });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('refuses a privileged reviewer token without revoking anything (I3)', async () => {
    const api = fakeApi({
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await expect(
        result.current.startReviewerSession('rev'),
      ).rejects.toBeInstanceOf(PrivilegedAccessError);
    });
    expect(api.logout).not.toHaveBeenCalled();
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('holds no token while the account is still loading (I2)', async () => {
    let finishMe: (user: typeof TEST_USER) => void = () => undefined;
    const api = fakeApi({
      me: vi.fn<AuthApi['me']>().mockReturnValue(
        new Promise((resolve) => {
          finishMe = resolve;
        }),
      ),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.startReviewerSession('rev');
    });
    expect(result.current.getAccessToken()).toBeNull();
    await act(async () => {
      finishMe(TEST_USER);
      await pending;
    });
    expect(result.current.getAccessToken()).toBe('rev');
  });

  it('keeps the token out of state, context fields and storage (I4)', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('secret-tok'),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const { getAccessToken, ...fields } = result.current;
    expect(getAccessToken()).toBe('secret-tok');
    expect(JSON.stringify(fields)).not.toContain('secret-tok');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-tok');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-tok');
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

describe('reviewer session', () => {
  it('holds a reviewer token in memory and ends it without calling the API', async () => {
    const api = fakeApi();
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await act(() => result.current.startReviewerSession('rev-tok'));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.kind).toBe('reviewer');
    expect(result.current.getAccessToken()).toBe('rev-tok');

    await act(() => result.current.signOut());
    expect(api.logout).not.toHaveBeenCalled();
    expect(result.current.status).toBe('anonymous');
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('drops the token when /auth/me refuses it', async () => {
    const api = fakeApi({
      me: vi.fn<AuthApi['me']>().mockRejectedValue(new Error('401')),
    });
    const { result } = setup(api);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await expect(
      act(() => result.current.startReviewerSession('bad')),
    ).rejects.toThrow('401');
    expect(result.current.getAccessToken()).toBeNull();
  });
});
