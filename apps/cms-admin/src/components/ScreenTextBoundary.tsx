import { Component, Suspense, useState, type ReactNode } from 'react';
import {
  COMMON_TEXT,
  loadScreenText,
  retryFailedScreenText,
  type ScreenName,
} from '@configs/locales';

import { LoadError, TitleSkeleton } from './PageStates';

const NO_SCREENS: readonly ScreenName[] = [];

/** Suspends until every screen's text is loaded; all loads start together. */
function ScreenTextGate({
  screens,
  children,
}: {
  screens: readonly ScreenName[];
  children: ReactNode;
}) {
  const loads = screens.map((screen) => loadScreenText(screen)) as (Promise<unknown> & {
    status?: string;
    reason?: unknown;
  })[];
  // The promise is thrown, not passed to `use`: `use` must be called the same number of times on
  // every render, and a settled thenable passed to it stalls a route change inside a transition.
  for (const load of loads) {
    if (load.status === 'rejected')
      throw load.reason instanceof Error ? load.reason : new Error(String(load.reason));
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense reads a thrown promise as "still loading"
    if (load.status !== 'fulfilled') throw load;
  }
  return children;
}

interface LoadFailureBoundaryProps {
  onRetry: () => void;
  children: ReactNode;
}

class LoadFailureBoundary extends Component<LoadFailureBoundaryProps, { hasFailed: boolean }> {
  override state = { hasFailed: false };

  static getDerivedStateFromError() {
    return { hasFailed: true };
  }

  override render() {
    if (!this.state.hasFailed) return this.props.children;
    return (
      <LoadError
        message={COMMON_TEXT.common.textLoadFailed}
        onRetry={this.props.onRetry}
        isRetrying={false}
      />
    );
  }
}

/**
 * Holds a route back until its screen text is loaded. A failed load shows a
 * retry that loads the text again and re-renders the route.
 */
export function ScreenTextBoundary({
  screens = NO_SCREENS,
  fallback,
  children,
}: {
  screens?: readonly ScreenName[] | undefined;
  /** What shows while the text loads; the page skeleton when omitted. */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    retryFailedScreenText(screens);
    setAttempt((count) => count + 1);
  };
  return (
    <LoadFailureBoundary key={attempt} onRetry={retry}>
      <Suspense
        fallback={
          fallback === undefined ? (
            <TitleSkeleton label={COMMON_TEXT.common.loadingPage} />
          ) : (
            fallback
          )
        }
      >
        <ScreenTextGate screens={screens}>{children}</ScreenTextGate>
      </Suspense>
    </LoadFailureBoundary>
  );
}
