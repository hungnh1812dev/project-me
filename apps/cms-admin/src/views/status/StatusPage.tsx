import { useScreenText } from '@configs/locales';

import { StatusCard } from './StatusCard';

/** Placeholder home until the content screens exist. */
export function StatusPage() {
  const { page } = useScreenText('status');
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{page.description}</p>
      <div className="mt-8 grid gap-6 lg:gap-8">
        <StatusCard />
      </div>
    </>
  );
}
