import { act, screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { loginNoticeState } from '@/features/auth/onboarding';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import LoginPage from './LoginPage';

const Where = () => <p>at {useLocation().pathname}</p>;

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/admin', element: <Where /> },
  { path: '/admin/profile', element: <Where /> },
  { path: '/register', element: <Where /> },
];

function renderLogin(auth: Parameters<typeof renderRoutes>[1] = {}) {
  return renderRoutes(routes, { route: '/login', auth: { status: 'unauthenticated' }, ...auth });
}

function apiError(status: number, message: string) {
  return HttpResponse.json({ statusCode: status, message, error: 'Error' }, { status });
}

async function fillAndSubmit(user: ReturnType<typeof renderLogin>['user']) {
  await user.type(screen.getByLabelText('Email'), 'jane@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret-pass');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('has labelled email, password and remember-me fields', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).not.toBeChecked();
  });

  it('renders in AuthLayout with Field-wired inputs and a password toggle (AC-41, AC-42)', () => {
    renderLogin();

    expect(screen.getByRole('main')).toHaveTextContent('hungnhdev CMS');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).toHaveAttribute(
      'data-slot',
      'checkbox',
    );
  });

  it('marks the submit button busy while signing in (AC-43)', async () => {
    server.use(
      http.post('*/api/v1/auth/login', async () => {
        await delay(50);
        return apiError(401, 'Unauthorized');
      }),
    );
    const { user } = renderLogin();

    await fillAndSubmit(user);

    expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-slot', 'alert');
  });

  it('signs in, sends the form values, and goes to /admin', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'ok', accessToken: 'tok' });
      }),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(makeMeUser())),
    );
    const { user, store } = renderLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('at /admin')).toBeInTheDocument();
    expect(body).toEqual({ email: 'jane@example.com', password: 'secret-pass', rememberMe: true });
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('returns to the page in state.from after signing in', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'ok', accessToken: 't' }),
      ),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(makeMeUser())),
    );
    const { user, router } = renderLogin();
    await router.navigate('/login', { state: { from: '/admin/profile' } });

    await fillAndSubmit(user);

    expect(await screen.findByText('at /admin/profile')).toBeInTheDocument();
  });

  it('disables the submit button while signing in', async () => {
    server.use(
      http.post('*/api/v1/auth/login', async () => {
        await delay(50);
        return apiError(401, 'Unauthorized');
      }),
    );
    const { user } = renderLogin();

    await fillAndSubmit(user);

    expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each([
    [401, 'Unauthorized', 'Invalid email or password.'],
    [403, 'Email not verified', "Your email address isn't verified yet."],
    [429, 'ThrottlerException', 'Too many attempts. Please try again later.'],
    [500, 'Database exploded', 'Database exploded'],
  ])('shows the %i error in an alert', async (status, serverMessage, shown) => {
    server.use(http.post('*/api/v1/auth/login', () => apiError(status, serverMessage)));
    const { user } = renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('clears the previous error when submitting again', async () => {
    server.use(http.post('*/api/v1/auth/login', () => apiError(401, 'Unauthorized')));
    const { user } = renderLogin();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    server.use(
      http.post('*/api/v1/auth/login', async () => {
        await delay(50);
        return apiError(401, 'Unauthorized');
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it.each(['idle', 'loading'] as const)(
    'keeps submit disabled while the session is checked (%s)',
    (status) => {
      renderLogin({ auth: { status } });

      expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    },
  );

  it('redirects an already signed-in user to /admin', async () => {
    renderLogin({ auth: { status: 'authenticated', user: makeMeUser() } });

    expect(await screen.findByText('at /admin')).toBeInTheDocument();
  });

  it('goes to /register when the CMS has no users yet', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: false })));
    renderLogin();

    expect(await screen.findByText('at /register')).toBeInTheDocument();
  });

  it('re-checks has-users on mount instead of trusting a cached "no users"', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: false })));
    const { router } = renderLogin();
    expect(await screen.findByText('at /register')).toBeInTheDocument();

    // Meanwhile the first account is registered and verified on other pages.
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: true })));
    await act(() => delay(10));
    await act(() => router.navigate('/login'));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await act(() => delay(50));
    expect(router.state.location.pathname).toBe('/login');
  });

  it('stays on the form when the has-users check fails', async () => {
    let checked = false;
    server.use(
      http.get('*/api/v1/auth/has-users', () => {
        checked = true;
        return apiError(500, 'Down');
      }),
    );
    renderLogin();

    await vi.waitFor(() => expect(checked).toBe(true));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it.each([
    ['verified', 'Your email is verified. Please sign in.'],
    ['passwordReset', 'Your password has been reset. Please sign in.'],
  ] as const)('shows the %s notice from router state', async (notice, text) => {
    const { router } = renderLogin();
    await router.navigate('/login', { state: loginNoticeState(notice) });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(text);
    expect(status).toHaveAttribute('data-slot', 'alert');
  });

  it('links to password recovery and registration', () => {
    renderLogin();

    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
