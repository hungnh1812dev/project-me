import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import RegisterPage from './RegisterPage';

const Where = () => {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} with {JSON.stringify(location.state)}
    </p>
  );
};

const routes = [
  { path: '/register', element: <RegisterPage /> },
  { path: '/verify-otp', element: <Where /> },
  { path: '/login', element: <Where /> },
];

function renderRegister() {
  return renderRoutes(routes, { route: '/register', auth: { status: 'unauthenticated' } });
}

type User = ReturnType<typeof renderRegister>['user'];

async function fill(
  user: User,
  values = {
    name: 'Jane Doe',
    username: 'janedoe',
    email: 'jane@example.com',
    password: 'secret-pass',
  },
) {
  if (values.name) await user.type(screen.getByLabelText('Name'), values.name);
  if (values.username) await user.type(screen.getByLabelText('Username'), values.username);
  if (values.email) await user.type(screen.getByLabelText('Email'), values.email);
  if (values.password) await user.type(screen.getByLabelText('Password'), values.password);
}

describe('RegisterPage', () => {
  it('shows "Set up admin account" when the CMS has no users', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: false })));
    renderRegister();

    expect(
      await screen.findByRole('heading', { name: 'Set up admin account' }),
    ).toBeInTheDocument();
  });

  it('shows "Create account" when users already exist', async () => {
    renderRegister();

    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('renders in AuthLayout with Field-wired inputs and a password toggle (AC-41, AC-42)', async () => {
    renderRegister();

    expect(await screen.findByRole('main')).toHaveTextContent('hungnhdev CMS');
    for (const label of ['Name', 'Username', 'Email', 'Password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    }
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('shows the field errors through Field as alerts (AC-7, AC-42)', async () => {
    const { user } = renderRegister();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required.');
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toContain('Name is required.');
  });

  it('validates every field before calling the API', async () => {
    let called = false;
    server.use(
      http.post('*/api/v1/auth/register', () => {
        called = true;
        return HttpResponse.json({ message: 'ok' }, { status: 201 });
      }),
    );
    const { user } = renderRegister();

    await fill(user, { name: ' ', username: 'ab', email: 'nope', password: 'short' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(
      'Username must be 3–32 letters, digits, dots, dashes or underscores.',
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('registers with accountType true and goes to /verify-otp with the email', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'Registered' }, { status: 201 });
      }),
    );
    const { user } = renderRegister();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('at /verify-otp with {"email":"jane@example.com"}'),
    ).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Jane Doe',
      username: 'janedoe',
      email: 'jane@example.com',
      password: 'secret-pass',
      accountType: true,
    });
  });

  it('disables the submit button while registering', async () => {
    server.use(
      http.post('*/api/v1/auth/register', async () => {
        await delay(50);
        return HttpResponse.json({ statusCode: 409, message: 'Conflict' }, { status: 409 });
      }),
    );
    const { user } = renderRegister();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const button = screen.getByRole('button', { name: 'Creating account…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it.each([
    [409, 'Email or username is already in use.'],
    [429, 'Too many attempts. Please try again later.'],
    [500, 'Database exploded'],
  ])('shows the %i error in an alert', async (status, shown) => {
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ statusCode: status, message: 'Database exploded' }, { status }),
      ),
    );
    const { user } = renderRegister();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });
});
