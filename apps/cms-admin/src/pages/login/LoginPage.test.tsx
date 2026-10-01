import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import LoginPage from './LoginPage';

const Where = () => <p>at {useLocation().pathname}</p>;

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/admin', element: <Where /> },
  { path: '/admin/profile', element: <Where /> },
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

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
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
});
