import { render, screen } from '@testing-library/react';

import { COPY } from '../../config/copy.constants';
import { AccountMenu } from '../auth/AccountMenu';
import { fakeApi, Wrapper } from '../auth/test-utils';

const isEnabled = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('../../config/env.client', () => ({
  appEnv: {
    apiBaseUrl: '/api/v1',
    adminUrl: undefined,
    turnstileSiteKey: 'site-key',
  },
}));
vi.mock('./reviewer.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reviewer.api')>()),
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
    expect(
      await screen.findByRole('button', { name: COPY.reviewer.open }),
    ).toBeInTheDocument();
  });

  it('hides it while the switch is off', async () => {
    isEnabled.mockResolvedValue(false);
    renderMenu();
    await screen.findByRole('button', { name: COPY.session.signIn });
    expect(isEnabled).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: COPY.reviewer.open }),
    ).not.toBeInTheDocument();
  });

  it('hides it when the status cannot be read', async () => {
    isEnabled.mockRejectedValue(new Error('down'));
    renderMenu();
    await screen.findByRole('button', { name: COPY.session.signIn });
    expect(
      screen.queryByRole('button', { name: COPY.reviewer.open }),
    ).not.toBeInTheDocument();
  });
});
