import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import ResetPasswordPage from './ResetPasswordPage';

const Where = () => {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} with {JSON.stringify(location.state)}
    </p>
  );
};

const routes = [
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/login', element: <Where /> },
];

function renderReset(route = '/reset-password?token=reset-tok') {
  return renderRoutes(routes, { route, auth: { status: 'unauthenticated' } });
}

type User = ReturnType<typeof renderReset>['user'];

async function submit(user: User, password = 'new-password', confirmation = password) {
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm new password'), confirmation);
  await user.click(screen.getByRole('button', { name: 'Reset password' }));
}

function expectLinkExpired() {
  expect(screen.getByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
}

describe('ResetPasswordPage', () => {
  it('shows the link-expired state when there is no token', () => {
    renderReset('/reset-password');

    expectLinkExpired();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('renders the link-expired state in AuthLayout (AC-41)', () => {
    renderReset('/reset-password');

    expect(screen.getByRole('main')).toHaveTextContent('hungnhdev CMS');
  });

  it('renders the form in AuthLayout with password toggles (AC-41, AC-42)', () => {
    renderReset();

    expect(screen.getByRole('main')).toHaveTextContent('hungnhdev CMS');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2);
  });

  it('shows the form with labelled password fields', () => {
    renderReset();

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password');
  });

  it.each([
    ['short', 'short', 'Password must be at least 8 characters.'],
    ['new-password', 'other-password', 'Passwords do not match.'],
  ])('rejects %j / %j without calling the API', async (password, confirmation, shown) => {
    let called = false;
    server.use(
      http.post('*/api/v1/auth/reset-password', () => {
        called = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderReset();

    await submit(user, password, confirmation);

    expect(screen.getByRole('alert')).toHaveTextContent(shown);
    expect(called).toBe(false);
  });

  it('resets the password and goes to /login with a notice', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/reset-password', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'Password reset' });
      }),
    );
    const { user } = renderReset();

    await submit(user);

    expect(
      await screen.findByText('at /login with {"notice":"passwordReset"}'),
    ).toBeInTheDocument();
    expect(body).toEqual({ token: 'reset-tok', newPassword: 'new-password' });
  });

  it('shows the link-expired state on a 400', async () => {
    server.use(
      http.post('*/api/v1/auth/reset-password', () =>
        HttpResponse.json({ statusCode: 400, message: 'Invalid token' }, { status: 400 }),
      ),
    );
    const { user } = renderReset();

    await submit(user);

    expect(await screen.findByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
    expectLinkExpired();
  });

  it('shows other errors in an alert and keeps the form', async () => {
    server.use(
      http.post('*/api/v1/auth/reset-password', async () => {
        await delay(50);
        return HttpResponse.json({ statusCode: 500, message: 'Boom' }, { status: 500 });
      }),
    );
    const { user } = renderReset();

    await submit(user);

    const button = screen.getByRole('button', { name: 'Resetting…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeEnabled();
  });
});
