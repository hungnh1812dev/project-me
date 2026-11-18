import type { ReactNode } from 'react';
import { Card } from '@abyss/form-commons';
import { COMMON_TEXT } from '@configs/locales';

/** Narrow single-column frame of the signed-out pages (sign in, reset, set). */
export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-12 sm:py-20">
      <main className="mx-auto w-full max-w-sm">
        <Card className="grid gap-4">
          <p className="m-0 text-sm font-semibold">{COMMON_TEXT.app.name}</p>
          {children}
        </Card>
      </main>
    </div>
  );
}
