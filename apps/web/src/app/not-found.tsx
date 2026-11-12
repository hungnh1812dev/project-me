'use client';

import { LAST_RESORT_TEXT, useSiteText } from '@/features/site-shell';

export default function NotFound() {
  const text = useSiteText() ?? LAST_RESORT_TEXT;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{text.notFoundTitle}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.notFoundDescription}</p>
    </>
  );
}
