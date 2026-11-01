import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { COPY } from '../../configs/Copy.constants';
import { getServerEnv } from '../../configs/Server.env';
import { StatusCard } from '../../views/status/StatusCard';

export default async function StatusPage() {
  // Read per request, so one build serves both states of the switch.
  await connection();
  if (!getServerEnv().isStatusPageEnabled) notFound();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{COPY.page.title}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{COPY.page.description}</p>
      <div className="mt-8">
        <StatusCard />
      </div>
    </>
  );
}
