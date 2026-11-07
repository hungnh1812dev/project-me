import '@/styles/global.css';

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { connection } from 'next/server';

import { AccountMenu } from '@/components/layouts/AccountMenu';
import { Providers } from '@/components/layouts/AppProviders';
import { CspNonce } from '@/components/layouts/CspNonce';
import { COPY } from '@/configs/Copy.constants';
import { NONCE_HEADER } from '@/configs/Security.constants';

export const metadata: Metadata = { title: COPY.app.name };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP nonce is made per request, so every page renders per request.
  await connection();
  const nonce = (await headers()).get(NONCE_HEADER);
  return (
    <html lang="en">
      <body>
        <CspNonce nonce={nonce} />
        <Providers>
          <div className="min-h-dvh">
            <header className="border-border bg-card border-b">
              <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link href="/" className="text-sm font-semibold">
                  {COPY.app.name}
                </Link>
                <nav aria-label={COPY.nav.label} className="flex items-center gap-4">
                  <Link
                    href="/cv"
                    className="text-muted-foreground hover:text-foreground text-sm font-medium"
                  >
                    {COPY.nav.cv}
                  </Link>
                  <AccountMenu />
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
