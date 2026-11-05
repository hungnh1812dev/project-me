import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../../configs/Copy.constants';
import { PrivilegedAccessError, type AuthApi } from '../../features/session/Auth.api';
import { fakeApi, httpError, TEST_USER, Wrapper } from '../../features/session/Session.fixture';
import { AccountMenu } from './AccountMenu';

const humanCheck = vi.hoisted(() => ({ solves: true, tokensIssued: 0, siteKey: 'site-key' }));

vi.mock('../../configs/Browser.env', () => ({
  appEnv: {
    get turnstileSiteKey() {
      return humanCheck.siteKey || undefined;
    },
    adminUrl: undefined,
  },
}));
// Stands in for Cloudflare: solves on every mount (a fresh challenge) with a new token.
vi.mock('../../features/auth/TurnstileWidget', () => ({
  TurnstileWidget: ({ action, onToken }: { action: string; onToken: (token: string) => void }) => {
    useEffect(() => {
      if (humanCheck.solves) onToken(`${action}-token-${++humanCheck.tokensIssued}`);
      // Once per mount, like the real widget (it keeps its callbacks in a ref).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid={`turnstile-${action}`} />;
  },
}));

beforeEach(() => {
  humanCheck.solves = true;
  humanCheck.tokensIssued = 0;
  humanCheck.siteKey = 'site-key';
});

const login = COPY.login;

async function openDialog(api = fakeApi()) {
  const user = userEvent.setup();
  render(
    <Wrapper api={api}>
      <AccountMenu />
    </Wrapper>,
  );
  await user.click(await screen.findByRole('button', { name: COPY.session.signIn }));
  return { user, api };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(new RegExp(login.emailLabel)), 'owner@example.com');
  await user.type(screen.getByLabelText(new RegExp(login.passwordLabel)), 'correct horse');
  await user.click(screen.getByRole('button', { name: login.submit }));
}

describe('sign-in dialog', () => {
  it('validates the fields before calling the API', async () => {
    const { user, api } = await openDialog();
    await user.click(screen.getByRole('button', { name: login.submit }));
    expect(await screen.findByText(login.validation.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(login.validation.passwordRequired)).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('signs in, closes and shows the account', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({ kind: 'signed-in', user: TEST_USER }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(
      await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'correct horse',
      humanCheckToken: 'login-token-1',
    });
    expect(screen.getByRole('button', { name: COPY.session.signOut })).toBeInTheDocument();
  });

  it('shows one generic message for wrong credentials and clears the password', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockRejectedValue(httpError(401, { errorCode: 'BFF_INVALID_CREDENTIALS' })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(login.errors.invalidCredentials);
    expect(screen.getByLabelText(new RegExp(login.passwordLabel))).toHaveValue('');
    expect(screen.getByLabelText(new RegExp(login.emailLabel))).toHaveValue('owner@example.com');
  });

  it('tells the wait time on a rate limit', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockRejectedValue(httpError(429, {}, { 'retry-after': '120' })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(login.errors.rateLimitedMinutes(2));
  });

  it.each([
    ['BFF_HUMAN_CHECK_FAILED', 403, login.errors.humanCheckFailed],
    ['BFF_HUMAN_CHECK_UNAVAILABLE', 503, login.errors.humanCheckUnavailable],
    ['BFF_PRIVILEGED_ACCOUNT', 403, login.errors.privileged],
    ['BFF_UPSTREAM_FAILED', 502, login.errors.unexpected],
  ])('maps %s to its message', async (errorCode, status, message) => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockRejectedValue(httpError(status, { errorCode })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('asks for the authenticator code, then signs in', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi.fn<AuthApi['verifyTwoFactor']>().mockResolvedValue(TEST_USER),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    const code = await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel));
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    expect(await screen.findByText(login.twoFactor.codeInvalid)).toBeInTheDocument();
    expect(api.verifyTwoFactor).not.toHaveBeenCalled();
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    expect(
      await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).toBeInTheDocument();
    expect(api.verifyTwoFactor).toHaveBeenCalledWith({
      code: '123456',
      humanCheckToken: expect.stringMatching(/^two-factor-token-/) as unknown,
    });
    expect(api.sendLoginEmailCode).not.toHaveBeenCalled();
  });

  it('shows a wrong-code message and keeps the step open', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockRejectedValue(httpError(401, { errorCode: 'BFF_INVALID_TWO_FACTOR_CODE' })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)), '000000');
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(login.twoFactor.errors.invalidCode);
  });

  it('returns to the password step when the temp token expired', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockRejectedValue(httpError(401, { errorCode: 'BFF_TWO_FACTOR_EXPIRED' })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)), '000000');
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    expect(await screen.findByText(login.twoFactor.expired)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(login.passwordLabel))).toBeInTheDocument();
  });

  it('sends the email code once and warns about its weakness', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['email'],
      }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByText(login.twoFactor.emailWarning)).toBeInTheDocument();
    await waitFor(() => expect(api.sendLoginEmailCode).toHaveBeenCalledTimes(1));
    expect(api.sendLoginEmailCode).toHaveBeenCalledWith({
      humanCheckToken: expect.stringMatching(/^two-factor-token-/) as unknown,
    });
  });

  it('sends a new token for the emailed code, the resend and the verify', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['email'],
      }),
      verifyTwoFactor: vi.fn<AuthApi['verifyTwoFactor']>().mockResolvedValue(TEST_USER),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await waitFor(() => expect(api.sendLoginEmailCode).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole('button', { name: login.twoFactor.resend }));
    await waitFor(() => expect(api.sendLoginEmailCode).toHaveBeenCalledTimes(2));
    await user.type(screen.getByLabelText(new RegExp(login.twoFactor.emailLabel)), '123456');
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    await waitFor(() => expect(api.verifyTwoFactor).toHaveBeenCalledTimes(1));
    const tokens = [
      ...vi.mocked(api.sendLoginEmailCode).mock.calls.map(([input]) => input?.humanCheckToken),
      vi.mocked(api.verifyTwoFactor).mock.calls[0]?.[0].humanCheckToken,
    ];
    expect(tokens).toHaveLength(3);
    expect(new Set(tokens).size).toBe(3);
  });

  it('holds the emailed code until the second check passes', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockImplementation(() => {
        humanCheck.solves = false;
        return Promise.resolve({ kind: 'two-factor-required', methods: ['email'] });
      }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await screen.findByText(login.twoFactor.emailWarning);
    expect(api.sendLoginEmailCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: login.twoFactor.resend }));
    expect(await screen.findByText(login.humanCheck.required)).toBeInTheDocument();
    expect(api.sendLoginEmailCode).not.toHaveBeenCalled();
  });

  it('rejects an account whose method this site does not support', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['sms'],
      }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.twoFactor.errors.unsupportedMethod,
    );
  });

  it('closes on Esc and starts clean when reopened', async () => {
    const { user } = await openDialog();
    await user.type(screen.getByLabelText(new RegExp(login.emailLabel)), 'x@y.co');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: COPY.session.signIn }));
    expect(screen.getByLabelText(new RegExp(login.emailLabel))).toHaveValue('');
  });
});

describe('human check', () => {
  it('renders a login widget and blocks the call until it passes', async () => {
    humanCheck.solves = false;
    const { user, api } = await openDialog();
    expect(screen.getByTestId('turnstile-login')).toBeInTheDocument();
    await fillCredentials(user);
    expect(await screen.findByText(login.humanCheck.required)).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('asks for a fresh check after a failed sign-in', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockRejectedValueOnce(httpError(403, { errorCode: 'BFF_HUMAN_CHECK_FAILED' }))
        .mockResolvedValue({ kind: 'signed-in', user: TEST_USER }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(login.errors.humanCheckFailed);
    await user.type(screen.getByLabelText(new RegExp(login.passwordLabel)), 'correct horse');
    await user.click(screen.getByRole('button', { name: login.submit }));
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(2));
    const tokens = vi.mocked(api.login).mock.calls.map(([input]) => input.humanCheckToken);
    expect(new Set(tokens).size).toBe(2);
  });

  it('says sign-in is unavailable when no site key is configured', async () => {
    humanCheck.siteKey = '';
    await openDialog();
    expect(screen.getByText(login.humanCheck.unavailable)).toBeInTheDocument();
    expect(screen.queryByLabelText(new RegExp(login.emailLabel))).not.toBeInTheDocument();
  });

  it('shows no reviewer entry', async () => {
    render(
      <Wrapper api={fakeApi()}>
        <AccountMenu />
      </Wrapper>,
    );
    await screen.findByRole('button', { name: COPY.session.signIn });
    expect(screen.queryByRole('button', { name: /reviewer/i })).not.toBeInTheDocument();
  });
});

describe('privileged accounts', () => {
  it('tells an admin to use the admin console and stays signed out', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockRejectedValue(new PrivilegedAccessError()),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(login.errors.privileged);
    expect(
      screen.queryByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).not.toBeInTheDocument();
  });

  it('refuses a privileged account at the 2FA step too', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockRejectedValue(new PrivilegedAccessError()),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)), '123456');
    await user.click(screen.getByRole('button', { name: login.twoFactor.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(login.errors.privileged);
  });
});

describe('account menu', () => {
  it('keeps the user signed in and says so when sign-out fails', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
      logout: vi.fn<AuthApi['logout']>().mockRejectedValue(new Error('offline')),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    await user.click(await screen.findByRole('button', { name: COPY.session.signOut }));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.session.signOutFailed);
    expect(screen.getByRole('button', { name: COPY.session.signOut })).toBeInTheDocument();
  });

  it('shows the signed-in actor after a silent refresh and signs out', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    expect(
      await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: COPY.session.signOut }));
    expect(await screen.findByRole('button', { name: COPY.session.signIn })).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('hides Open CMS when no admin URL is configured', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName));
    expect(screen.queryByRole('link', { name: COPY.session.openCms })).not.toBeInTheDocument();
  });
});
