import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { renderRoutes } from '@/test/renderWithProviders';

import type { AccessRequirements } from '../permissions/access';
import RequireAccess from './RequireAccess';

const ForbiddenProbe = () => {
  const state: unknown = useLocation().state;
  return <p>forbidden: {JSON.stringify(state)}</p>;
};

function renderGuarded(requirements: AccessRequirements, permissions: string[], level = 20) {
  return renderRoutes(
    [
      { path: '/403', element: <ForbiddenProbe /> },
      {
        path: '/admin/users',
        element: <RequireAccess {...requirements} />,
        children: [{ index: true, element: <p>Users</p> }],
      },
    ],
    {
      route: '/admin/users',
      auth: {
        status: 'authenticated',
        user: makeMeUser({ documentId: 'me', role: makeRole({ permissions, level }) }),
      },
    },
  );
}

describe('<RequireAccess>', () => {
  it('renders the child route when the permission is held', () => {
    renderGuarded({ permission: 'user:read' }, ['user:read']);

    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('redirects to /403 with the reason when a permission is missing', () => {
    const { router } = renderGuarded({ permission: 'user:read' }, []);

    expect(router.state.location.pathname).toBe('/403');
    expect(router.state.location.state).toEqual({
      reason: 'Requires the "user:read" permission.',
      from: '/admin/users',
    });
  });

  it('redirects to /403 when the role level is too low', () => {
    const { router } = renderGuarded({ minLevel: 50 }, ['user:read'], 20);

    expect(router.state.location.pathname).toBe('/403');
  });

  it('allows when the role level is high enough', () => {
    renderGuarded({ minLevel: 50 }, [], 50);

    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('checks an ABAC policy given in `can`', () => {
    const { router } = renderGuarded({ can: { I: 'read', a: 'role' } }, ['user:read']);

    expect(router.state.location.pathname).toBe('/403');
  });

  it('renders children instead of an outlet when given', () => {
    renderRoutes(
      [
        {
          path: '/',
          element: (
            <RequireAccess permission="user:read">
              <p>Inline child</p>
            </RequireAccess>
          ),
        },
      ],
      {
        auth: {
          status: 'authenticated',
          user: makeMeUser({ role: makeRole({ permissions: ['user:read'] }) }),
        },
      },
    );

    expect(screen.getByText('Inline child')).toBeInTheDocument();
  });
});
