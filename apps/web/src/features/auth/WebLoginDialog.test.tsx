import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../../config/copy.constants';
import { AccountMenu } from './AccountMenu';
import type { AuthApi } from './auth.api';
import {
  fakeApi,
  httpError,
  PRIVILEGED_USER,
  TEST_USER,
  Wrapper,
} from './test-utils';

const login = COPY.login;

async function openDialog(api = fakeApi()) {
  const user = userEvent.setup();
  render(
    <Wrapper api={api}>
      <AccountMenu />
    </Wrapper>,
  );
  await user.click(
    await screen.findByRole('button', { name: COPY.session.signIn }),
  );
  return { user, api };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(new RegExp(login.emailLabel)),
    'owner@example.com',
  );
  await user.type(
    screen.getByLabelText(new RegExp(login.passwordLabel)),
    'correct horse',
  );
  await user.click(screen.getByRole('button', { name: login.submit }));
}

describe('sign-in dialog', () => {
  it('validates the fields before calling the API', async () => {
    const { user, api } = await openDialog();
    await user.click(screen.getByRole('button', { name: login.submit }));
    expect(
      await screen.findByText(login.validation.emailRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(login.validation.passwordRequired),
    ).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('signs in, closes and shows the account', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 'tok' }),
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
    });
    expect(
      screen.getByRole('button', { name: COPY.session.signOut }),
    ).toBeInTheDocument();
  });

  it('shows one generic message for wrong credentials and clears the password', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockRejectedValue(
          httpError(401, { errorCode: 'AUTH_INVALID_CREDENTIALS' }),
        ),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.errors.invalidCredentials,
    );
    expect(screen.getByLabelText(new RegExp(login.passwordLabel))).toHaveValue(
      '',
    );
    expect(screen.getByLabelText(new RegExp(login.emailLabel))).toHaveValue(
      'owner@example.com',
    );
  });

  it('tells the wait time on a rate limit', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockRejectedValue(httpError(429, {}, { 'retry-after': '120' })),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.errors.rateLimitedMinutes(2),
    );
  });

  it('asks for the authenticator code, then signs in', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockResolvedValue('tok'),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    const code = await screen.findByLabelText(
      new RegExp(login.twoFactor.totpLabel),
    );
    await user.click(
      screen.getByRole('button', { name: login.twoFactor.submit }),
    );
    expect(
      await screen.findByText(login.twoFactor.codeInvalid),
    ).toBeInTheDocument();
    expect(api.verifyTwoFactor).not.toHaveBeenCalled();
    await user.type(code, '123456');
    await user.click(
      screen.getByRole('button', { name: login.twoFactor.submit }),
    );
    expect(
      await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).toBeInTheDocument();
    expect(api.verifyTwoFactor).toHaveBeenCalledWith({
      tempToken: 'tmp',
      code: '123456',
    });
    expect(api.sendLoginEmailCode).not.toHaveBeenCalled();
  });

  it('shows a wrong-code message and keeps the step open', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockRejectedValue(
          httpError(401, { errorCode: 'AUTH_INVALID_2FA_CODE' }),
        ),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(
      await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)),
      '000000',
    );
    await user.click(
      screen.getByRole('button', { name: login.twoFactor.submit }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.twoFactor.errors.invalidCode,
    );
  });

  it('returns to the password step when the temp token expired', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockRejectedValue(
          httpError(401, { errorCode: 'AUTH_INVALID_TEMP_TOKEN' }),
        ),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(
      await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)),
      '000000',
    );
    await user.click(
      screen.getByRole('button', { name: login.twoFactor.submit }),
    );
    expect(
      await screen.findByText(login.twoFactor.expired),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(new RegExp(login.passwordLabel)),
    ).toBeInTheDocument();
  });

  it('sends the email code once and warns about its weakness', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['email'],
      }),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(
      await screen.findByText(login.twoFactor.emailWarning),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.sendLoginEmailCode).toHaveBeenCalledTimes(1),
    );
    expect(api.sendLoginEmailCode).toHaveBeenCalledWith('tmp');
  });

  it('rejects an account whose method this site does not support', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
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
    await user.type(
      screen.getByLabelText(new RegExp(login.emailLabel)),
      'x@y.co',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: COPY.session.signIn }));
    expect(screen.getByLabelText(new RegExp(login.emailLabel))).toHaveValue('');
  });
});

describe('privileged accounts', () => {
  it('tells an admin to use the admin console and stays signed out', async () => {
    const api = fakeApi({
      login: vi
        .fn<AuthApi['login']>()
        .mockResolvedValue({ kind: 'signed-in', accessToken: 'adm' }),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.errors.privileged,
    );
    expect(
      screen.queryByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).not.toBeInTheDocument();
  });

  it('refuses a privileged account at the 2FA step too', async () => {
    const api = fakeApi({
      login: vi.fn<AuthApi['login']>().mockResolvedValue({
        kind: 'two-factor-required',
        tempToken: 'tmp',
        methods: ['totp'],
      }),
      verifyTwoFactor: vi
        .fn<AuthApi['verifyTwoFactor']>()
        .mockResolvedValue('adm'),
      me: vi.fn<AuthApi['me']>().mockResolvedValue(PRIVILEGED_USER),
    });
    const { user } = await openDialog(api);
    await fillCredentials(user);
    await user.type(
      await screen.findByLabelText(new RegExp(login.twoFactor.totpLabel)),
      '123456',
    );
    await user.click(
      screen.getByRole('button', { name: login.twoFactor.submit }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      login.errors.privileged,
    );
  });
});

describe('account menu', () => {
  it('keeps the user signed in and says so when sign-out fails', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
      logout: vi
        .fn<AuthApi['logout']>()
        .mockRejectedValue(new Error('offline')),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    await user.click(
      await screen.findByRole('button', { name: COPY.session.signOut }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.session.signOutFailed,
    );
    expect(
      screen.getByRole('button', { name: COPY.session.signOut }),
    ).toBeInTheDocument();
  });

  it('shows the signed-in actor after a silent refresh and signs out', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    expect(
      await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName)),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: COPY.session.signOut }),
    );
    expect(
      await screen.findByRole('button', { name: COPY.session.signIn }),
    ).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('hides Open CMS when no admin URL is configured', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    await screen.findByText(COPY.session.signedInAs(TEST_USER.displayName));
    expect(
      screen.queryByRole('link', { name: COPY.session.openCms }),
    ).not.toBeInTheDocument();
  });
});
