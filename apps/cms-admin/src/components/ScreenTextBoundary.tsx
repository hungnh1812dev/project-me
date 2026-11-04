import { Component, Suspense, use, useState, type ReactNode } from 'react';
import { COMMON_TEXT, loadScreenText, type ScreenName } from '@configs/locales';

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
  const loads = screens.map((screen) => loadScreenText(screen));
  for (const load of loads) use(load);
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
  children,
}: {
  screens?: readonly ScreenName[] | undefined;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <LoadFailureBoundary key={attempt} onRetry={() => setAttempt((count) => count + 1)}>
      <Suspense fallback={<TitleSkeleton label={COMMON_TEXT.common.loadingPage} />}>
        <ScreenTextGate screens={screens}>{children}</ScreenTextGate>
      </Suspense>
    </LoadFailureBoundary>
  );
}
