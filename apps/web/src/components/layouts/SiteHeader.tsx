import Link from 'next/link';

import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { loadSignInText } from '@/features/auth/SignIn.server';
import { loadSiteHeader } from '@/features/site-header/SiteHeader.server';

import { AccountMenu } from './AccountMenu';
import { MobileNavDrawer } from './MobileNavDrawer';
import { SiteNav } from './SiteNav';

/** Brand, nav (a drawer below `md`) and account menu. With no header text loaded it holds only the brand. */
export async function SiteHeader() {
  const [siteHeader, signInText] = await Promise.all([loadSiteHeader(), loadSignInText()]);
  const appName = siteHeader?.header.appName ?? LAST_RESORT_TEXT.appName;
  return (
    <header className="border-border bg-card border-b print:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="min-w-0 truncate text-sm font-semibold">
          {appName}
        </Link>
        {siteHeader === null ? null : (
          <nav className="flex shrink-0 items-center gap-4">
            <div className="hidden md:flex">
              <SiteNav navs={siteHeader.header.navs} />
            </div>
            <AccountMenu author={siteHeader.header.author} signInText={signInText} />
            <div className="md:hidden">
              <MobileNavDrawer navs={siteHeader.header.navs ?? []} appName={appName} />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
