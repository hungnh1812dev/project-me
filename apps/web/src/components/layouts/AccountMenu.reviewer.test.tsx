import { render, screen } from '@testing-library/react';

import { COPY } from '../../configs/Copy.constants';
import type { AuthApi } from '../../features/session/Auth.api';
import { fakeApi, TEST_USER, Wrapper } from '../../features/session/Session.fixture';
import { AccountMenu } from './AccountMenu';

const isEnabled = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('../../configs/Browser.env', () => ({
  appEnv: {
    apiBaseUrl: '/api/v1',
    adminUrl: undefined,
    turnstileSiteKey: 'site-key',
  },
}));
vi.mock('../../features/reviewer/Reviewer.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/reviewer/Reviewer.api')>()),
  createReviewerApi: () => ({
    isEnabled,
    createSession: vi.fn<() => Promise<never>>(),
  }),
}));

function renderMenu() {
  render(
    <Wrapper api={fakeApi()}>
      <AccountMenu />
    </Wrapper>,
  );
}

describe('account menu reviewer entry', () => {
  it('offers reviewer access while the owner switch is on', async () => {
    isEnabled.mockResolvedValue(true);
    renderMenu();
    expect(await screen.findByRole('button', { name: COPY.reviewer.open })).toBeInTheDocument();
  });

  it('hides it while the switch is off', async () => {
    isEnabled.mockResolvedValue(false);
    renderMenu();
    await screen.findByRole('button', { name: COPY.session.signIn });
    expect(isEnabled).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: COPY.reviewer.open })).not.toBeInTheDocument();
  });

  it('hides it when the status cannot be read', async () => {
    isEnabled.mockRejectedValue(new Error('down'));
    renderMenu();
    await screen.findByRole('button', { name: COPY.session.signIn });
    expect(screen.queryByRole('button', { name: COPY.reviewer.open })).not.toBeInTheDocument();
  });

  it('never reads the switch for a signed-in user', async () => {
    isEnabled.mockClear();
    isEnabled.mockResolvedValue(true);
    render(
      <Wrapper
        api={fakeApi({
          readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
        })}
      >
        <AccountMenu />
      </Wrapper>,
    );
    await screen.findByRole('button', { name: COPY.session.signOut });
    expect(isEnabled).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: COPY.reviewer.open })).not.toBeInTheDocument();
  });
});
