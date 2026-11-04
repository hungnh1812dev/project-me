import { ScreenTextBoundary } from '@components/ScreenTextBoundary';
import { useScreenText } from '@configs/locales';

/**
 * Shown to a reviewer session in the admin console. Informational: the API
 * refuses every write for this role (403) whatever the screen shows.
 */
function ReviewerBannerContent() {
  const { reviewer } = useScreenText('reviewer');
  return (
    <output className="block border-b border-border bg-info-soft text-info-strong">
      <p className="mx-auto max-w-5xl px-4 py-2 text-sm sm:px-6">
        <span className="font-medium">{reviewer.banner.title}.</span> {reviewer.banner.message}
      </p>
    </output>
  );
}

/** Sits in the shell, outside any route, so it waits for its own text and shows nothing meanwhile. */
export function ReviewerBanner() {
  return (
    <ScreenTextBoundary screens={['reviewer']} fallback={null}>
      <ReviewerBannerContent />
    </ScreenTextBoundary>
  );
}
