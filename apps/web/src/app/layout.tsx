import '@/styles/global.css';

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';

import { Providers } from '@/components/layouts/AppProviders';
import { CspNonce } from '@/components/layouts/CspNonce';
import { SiteHeader } from '@/components/layouts/SiteHeader';
import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { NONCE_HEADER } from '@/configs/Security.constants';
import { loadSiteHeader } from '@/features/site-header/SiteHeader.server';

export async function generateMetadata(): Promise<Metadata> {
  const siteHeader = await loadSiteHeader();
  return { title: siteHeader?.header.appName ?? LAST_RESORT_TEXT.appName };
}

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
            <SiteHeader />
            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
