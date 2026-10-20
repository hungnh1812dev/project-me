import { COPY } from '../../config/copy.constants';
import { StatusCard } from './StatusCard';

/** Placeholder home until the content screens exist. */
export function StatusPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {COPY.page.title}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {COPY.page.description}
      </p>
      <div className="mt-8">
        <StatusCard />
      </div>
    </>
  );
}
