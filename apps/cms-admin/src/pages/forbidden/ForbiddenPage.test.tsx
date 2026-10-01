import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderRoutes } from '@/test/renderWithProviders';

import ForbiddenPage from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('explains the denial and links back to /admin', () => {
    renderRoutes([{ path: '/403', element: <ForbiddenPage /> }], { route: '/403' });

    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view this page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to admin home' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('shows the reason passed by the guard', async () => {
    const { router } = renderRoutes([{ path: '/403', element: <ForbiddenPage /> }], {
      route: '/',
    });

    await router.navigate('/403', {
      state: { reason: 'Requires the "user:read" permission.', from: '/admin/users' },
    });

    expect(await screen.findByText('Requires the "user:read" permission.')).toBeInTheDocument();
  });
});
