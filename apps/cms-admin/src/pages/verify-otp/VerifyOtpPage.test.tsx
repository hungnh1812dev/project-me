import { act, screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import VerifyOtpPage from './VerifyOtpPage';

const Where = () => {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} with {JSON.stringify(location.state)}
    </p>
  );
};

const routes = [
  { path: '/', element: null },
  { path: '/verify-otp', element: <VerifyOtpPage /> },
  { path: '/login', element: <Where /> },
];

async function renderVerify(state: unknown = { email: 'jane@example.com' }) {
  const rendered = renderRoutes(routes, { route: '/', auth: { status: 'unauthenticated' } });
  await act(() => rendered.router.navigate('/verify-otp', { state }));
  return rendered;
}

function apiError(status: number, message = 'Server says no') {
  return HttpResponse.json({ statusCode: status, message, error: 'Error' }, { status });
}

describe('VerifyOtpPage', () => {
  it('prefills the email from router state and asks for a 6-digit code', async () => {
    await renderVerify();

    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
    const otp = screen.getByLabelText('Verification code');
    expect(otp).toHaveAttribute('inputmode', 'numeric');
    expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('starts with an empty email when there is no state', async () => {
    await renderVerify(null);

    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('rejects a code that is not 6 digits without calling the API', async () => {
    let called = false;
    server.use(
      http.post('*/api/v1/auth/verify-otp', () => {
        called = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = await renderVerify();

    await user.type(screen.getByLabelText('Verification code'), '12a4');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6-digit code.');
    expect(called).toBe(false);
  });

  it('verifies and goes to /login with the verified notice', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/verify-otp', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'Verified' });
      }),
    );
    const { user } = await renderVerify();

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('at /login with {"notice":"verified"}')).toBeInTheDocument();
    expect(body).toEqual({ email: 'jane@example.com', otp: '123456' });
  });

  it('disables Verify while the request is pending', async () => {
    server.use(
      http.post('*/api/v1/auth/verify-otp', async () => {
        await delay(50);
        return apiError(400);
      }),
    );
    const { user } = await renderVerify();

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it.each([
    [400, 'The code is invalid or has expired.'],
    [404, 'No account was found for this email.'],
    [429, 'Too many attempts. Please try again later.'],
    [500, 'Server says no'],
  ])('shows the %i verify error', async (status, shown) => {
    server.use(http.post('*/api/v1/auth/verify-otp', () => apiError(status)));
    const { user } = await renderVerify();

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).not.toBeInTheDocument();
  });

  it('links to sign in when the email is already verified (409)', async () => {
    server.use(http.post('*/api/v1/auth/verify-otp', () => apiError(409)));
    const { user } = await renderVerify();

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This email is already verified.');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
  });

  it('resends the code and confirms it', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/resend-otp', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'Sent' });
      }),
    );
    const { user } = await renderVerify();

    await user.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'A new code was sent to jane@example.com.',
    );
    expect(body).toEqual({ email: 'jane@example.com' });
  });

  it('asks for an email before resending', async () => {
    const { user } = await renderVerify(null);

    await user.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.');
  });

  it.each([
    [404, 'No account was found for this email.'],
    [409, 'This email is already verified.'],
    [429, 'Too many attempts. Please try again later.'],
  ])('shows the %i resend error', async (status, shown) => {
    server.use(http.post('*/api/v1/auth/resend-otp', () => apiError(status)));
    const { user } = await renderVerify();

    await user.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
