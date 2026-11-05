import { render, screen } from '@testing-library/react';

import { COPY } from '../../configs/Copy.constants';
import type { AuthApi } from '../../features/session/Auth.api';
import { fakeApi, TEST_USER, Wrapper } from '../../features/session/Session.fixture';
import { AccountMenu } from './AccountMenu';

vi.mock('../../configs/Browser.env', () => ({
  appEnv: { apiBaseUrl: '/api/v1', adminUrl: 'https://admin.example.com' },
}));

describe('account menu with an admin URL', () => {
  it('links Open CMS to the admin console', async () => {
    const api = fakeApi({
      readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    expect(await screen.findByRole('link', { name: COPY.session.openCms })).toHaveAttribute(
      'href',
      'https://admin.example.com',
    );
  });
});
