import './app.css';

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { NONCE_HEADER } from '../config/security.constants';
import { COPY } from '../config/copy.constants';
import { AccountMenu } from '../features/auth/AccountMenu';
import { CspNonce } from './CspNonce';
import { Providers } from './providers';

export const metadata: Metadata = { title: COPY.app.name };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The CSP nonce is made per request, so every page renders per request.
  await connection();
  const nonce = (await headers()).get(NONCE_HEADER);
  return (
    <html lang="en">
      <body>
        <CspNonce nonce={nonce} />
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
