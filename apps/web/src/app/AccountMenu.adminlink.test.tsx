import { render, screen } from '@testing-library/react';

import { COPY } from '../config/copy.constants';
import { AccountMenu } from './AccountMenu';
import type { AuthApi } from '../features/session/auth.api';
import { fakeApi, Wrapper } from '../features/session/session-test-utils';

vi.mock('../config/env.client', () => ({
  appEnv: { apiBaseUrl: '/api/v1', adminUrl: 'https://admin.example.com' },
}));

describe('account menu with an admin URL', () => {
  it('links Open CMS to the admin console', async () => {
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('tok'),
    });
    render(
      <Wrapper api={api}>
        <AccountMenu />
      </Wrapper>,
    );
    expect(
      await screen.findByRole('link', { name: COPY.session.openCms }),
    ).toHaveAttribute('href', 'https://admin.example.com');
  });
});
