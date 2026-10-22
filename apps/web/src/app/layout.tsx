import './app.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { COPY } from '../config/copy.constants';
import { AccountMenu } from '../features/auth/AccountMenu';
import { Providers } from './providers';

export const metadata: Metadata = { title: COPY.app.name };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-dvh">
            <header className="border-b border-border bg-card">
              <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
                <span className="text-sm font-semibold">{COPY.app.name}</span>
                <AccountMenu />
              </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
