import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SIGN_IN_MOCK } from '@/apis/server/graphql/mocks/SignIn.mock';

import { fakeApi, TEST_USER, Wrapper } from '../session/Session.fixture';
import { resetHumanCheckFake } from './HumanCheck.fixture';
import { WebLoginDialog } from './WebLoginDialog';

const copy = SIGN_IN_MOCK.signInText;

vi.mock('@abyss/form-commons/human-check', async (importOriginal) =>
  (await import('./HumanCheck.fixture')).fakeHumanCheckKit(await importOriginal<object>()),
);

vi.mock('@/configs/Browser.env', () => ({
  appEnv: { turnstileSiteKey: 'site-key' },
}));

beforeEach(resetHumanCheckFake);

function renderDialog(api = fakeApi()) {
  render(
    <Wrapper api={api}>
      <WebLoginDialog open onOpenChange={() => undefined} text={copy} />
    </Wrapper>,
  );
  return api;
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(new RegExp(copy.emailLabel)), 'reader@example.com');
  await user.type(screen.getByLabelText(new RegExp(copy.passwordLabel)), 'pw');
}

describe('WebLoginDialog keep me signed in', () => {
  it('shows the box unticked, described by its hint', () => {
    renderDialog();
    const box = screen.getByRole('checkbox', { name: copy.rememberMeLabel });
    expect(box).not.toBeChecked();
    const hint = screen.getByText(copy.rememberMeHint);
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
  });

  it('puts the box after the password and before the human check', () => {
    renderDialog();
    const password = screen.getByLabelText(new RegExp(copy.passwordLabel));
    const box = screen.getByRole('checkbox', { name: copy.rememberMeLabel });
    const humanCheck = screen.getByTestId('turnstile-login');
    expect(password.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(humanCheck) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends rememberMe false when the box is left unticked', async () => {
    const user = userEvent.setup();
    const api = renderDialog();
    api.login.mockResolvedValue({ kind: 'signed-in', user: TEST_USER });
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    expect(api.login).toHaveBeenCalledWith({
      email: 'reader@example.com',
      password: 'pw',
      rememberMe: false,
      turnstileToken: 'login-token-1',
    });
  });

  it('sends rememberMe true when the box is ticked', async () => {
    const user = userEvent.setup();
    const api = renderDialog();
    api.login.mockResolvedValue({ kind: 'signed-in', user: TEST_USER });
    await fillCredentials(user);
    await user.click(screen.getByRole('checkbox', { name: copy.rememberMeLabel }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    expect(api.login).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: true }));
  });

  it('unticks the box after a failed sign-in', async () => {
    const user = userEvent.setup();
    const api = renderDialog();
    api.login.mockRejectedValue(new Error('refused'));
    await fillCredentials(user);
    await user.click(screen.getByRole('checkbox', { name: copy.rememberMeLabel }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: copy.rememberMeLabel })).not.toBeChecked(),
    );
  });
});
