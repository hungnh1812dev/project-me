import { render, screen } from '@testing-library/react';

import { COPY } from '../configs/Copy.constants';
import RootLayout from './layout';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('../components/layouts/AccountMenu', () => ({ AccountMenu: () => <div>menu</div> }));
vi.mock('../components/layouts/AppProviders', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/layouts/CspNonce', () => ({ CspNonce: () => null }));

describe('RootLayout', () => {
  it('links the header to the CV page', async () => {
    render(await RootLayout({ children: <p>page</p> }), { container: document.documentElement });
    expect(screen.getByRole('link', { name: COPY.nav.cv })).toHaveAttribute('href', '/cv');
  });
});
