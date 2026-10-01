import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import App from './App';
import { resetBootstrapLatch } from './features/auth/store/sessionThunks';

beforeEach(() => {
  resetBootstrapLatch();
});

describe('App', () => {
  it('bootstraps the session and sends a signed-out visitor to /login', async () => {
    window.history.replaceState(null, '', '/admin/profile');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.history.state?.usr).toEqual({ from: '/admin/profile' });
  });
});
