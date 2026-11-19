import Link from 'next/link';

import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { loadSignInText } from '@/features/auth/SignIn.server';
import { loadSiteHeader } from '@/features/site-header/SiteHeader.server';

import { AccountMenu } from './AccountMenu';
import { SiteNav } from './SiteNav';

/** Brand, nav and account menu. With no header text loaded it holds only the brand. */
export async function SiteHeader() {
  const [siteHeader, signInText] = await Promise.all([loadSiteHeader(), loadSignInText()]);
  return (
    <header className="border-border bg-card border-b">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold">
          {siteHeader?.header.appName ?? LAST_RESORT_TEXT.appName}
        </Link>
        {siteHeader === null ? null : (
          <nav className="flex items-center gap-4">
            <SiteNav navs={siteHeader.header.navs} />
            <AccountMenu author={siteHeader.header.author} signInText={signInText} />
          </nav>
        )}
      </div>
    </header>
  );
}
