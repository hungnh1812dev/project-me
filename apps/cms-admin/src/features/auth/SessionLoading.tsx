import { COPY } from '../../config/Copy.constants';

/** Shown while the silent refresh on app start settles. */
export function SessionLoading() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <output className="inline-flex items-center gap-3 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        {COPY.session.restoring}
      </output>
    </div>
  );
}
