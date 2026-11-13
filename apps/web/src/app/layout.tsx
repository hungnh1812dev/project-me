import '@/styles/global.css';

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { connection } from 'next/server';

import { AccountMenu } from '@/components/layouts/AccountMenu';
import { Providers } from '@/components/layouts/AppProviders';
import { CspNonce } from '@/components/layouts/CspNonce';
import { SiteNav } from '@/components/layouts/SiteNav';
import { NONCE_HEADER } from '@/configs/Security.constants';
import { LAST_RESORT_TEXT, SiteTextProvider } from '@/features/site-shell';
import { loadSiteShell } from '@/features/site-shell/SiteShell.server';

export async function generateMetadata(): Promise<Metadata> {
  const shell = await loadSiteShell();
  return { title: shell?.header.name ?? LAST_RESORT_TEXT.appName };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP nonce is made per request, so every page renders per request.
  await connection();
  const nonce = (await headers()).get(NONCE_HEADER);
  const shell = await loadSiteShell();
  return (
    <html lang="en">
      <body>
        <CspNonce nonce={nonce} />
        {shell === null ? (
          <Providers>
            <SiteFrame brand={LAST_RESORT_TEXT.appName}>{children}</SiteFrame>
          </Providers>
        ) : (
          <SiteTextProvider
            header={shell.header}
            siteText={shell.siteText}
            signInText={shell.signInText}
          >
            <Providers>
              <SiteFrame
                brand={shell.header.name ?? LAST_RESORT_TEXT.appName}
                navLabel={shell.siteText.navLabel}
                hasNav
              >
                {children}
              </SiteFrame>
            </Providers>
          </SiteTextProvider>
        )}
      </body>
    </html>
  );
}

interface SiteFrameProps {
  brand: string;
  children: ReactNode;
  /** Without it (the shell text did not load) the header holds only the brand. */
  hasNav?: boolean;
  navLabel?: string;
}

function SiteFrame({ brand, children, hasNav = false, navLabel }: SiteFrameProps) {
  return (
    <div className="min-h-dvh">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold">
            {brand}
          </Link>
          {hasNav ? (
            <nav aria-label={navLabel} className="flex items-center gap-4">
              <SiteNav />
              <AccountMenu />
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
