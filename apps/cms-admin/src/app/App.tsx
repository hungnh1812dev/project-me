import { COPY } from '../config/copy.constants';
import { StatusCard } from '../features/status/StatusCard';

export function App() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <span className="text-sm font-semibold">{COPY.app.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          {COPY.page.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {COPY.page.description}
        </p>
        <div className="mt-8">
          <StatusCard />
        </div>
      </main>
    </div>
  );
}
