import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import ForgotPasswordPage from './ForgotPasswordPage';

const GENERIC = 'If that email exists, a reset link was sent.';

function renderForgot() {
  return renderRoutes([{ path: '/forgot-password', element: <ForgotPasswordPage /> }], {
    route: '/forgot-password',
    auth: { status: 'unauthenticated' },
  });
}

describe('ForgotPasswordPage', () => {
  it('has a labelled email field and a link back to sign in', () => {
    renderForgot();

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('posts the email and shows the generic message', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/forgot-password', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderForgot();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(GENERIC);
    expect(body).toEqual({ email: 'jane@example.com' });
  });

  it.each([404, 429, 500])('shows the same generic message on a %i', async (status) => {
    server.use(
      http.post('*/api/v1/auth/forgot-password', () =>
        HttpResponse.json({ statusCode: status, message: 'Nope' }, { status }),
      ),
    );
    const { user } = renderForgot();

    await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(GENERIC);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a connection error when the request never reached the server', async () => {
    server.use(http.post('*/api/v1/auth/forgot-password', () => HttpResponse.error()));
    const { user } = renderForgot();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('validates the email before calling the API', async () => {
    let called = false;
    server.use(
      http.post('*/api/v1/auth/forgot-password', () => {
        called = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderForgot();

    await user.type(screen.getByLabelText('Email'), 'jane');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.');
    expect(called).toBe(false);
  });

  it('disables the button while sending', async () => {
    server.use(
      http.post('*/api/v1/auth/forgot-password', async () => {
        await delay(50);
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderForgot();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
