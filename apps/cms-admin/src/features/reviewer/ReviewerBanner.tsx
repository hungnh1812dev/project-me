import { COPY } from '../../config/copy.constants';

/**
 * Shown to a reviewer session in the admin console. Informational: the API
 * refuses every write for this role (403) whatever the screen shows.
 */
export function ReviewerBanner() {
  return (
    <output className="block border-b border-border bg-info-soft text-info-strong">
      <p className="mx-auto max-w-5xl px-4 py-2 text-sm sm:px-6">
        <span className="font-medium">{COPY.reviewer.banner.title}.</span>{' '}
        {COPY.reviewer.banner.message}
      </p>
    </output>
  );
}
