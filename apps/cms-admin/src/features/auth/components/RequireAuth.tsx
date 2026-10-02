import { Loader2Icon } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import { useAuth } from '../hooks/useAuth';
import { toRedirectState } from '../redirect';

/** A centred full-screen state, outside the shell (AC-40). */
const FULL_SCREEN =
  'grid min-h-svh place-content-center justify-items-center gap-3 bg-background p-4 text-center text-sm text-muted-foreground';

/**
 * Layout route for signed-in pages. Waits for the session bootstrap, sends signed-out users to
 * `/login` (with `state.from`, so login can return them here), and offers Retry when the server
 * can't be reached.
 */
const RequireAuth: React.FC = () => {
  const { status, retryBootstrap } = useAuth();
  const location = useLocation();

  if (status === 'authenticated') return <Outlet />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={toRedirectState(location)} />;
  }
  if (status === 'error') {
    return (
      <div role="alert" className={FULL_SCREEN}>
        <p className="text-base font-medium text-foreground">Can&apos;t reach the server.</p>
        <Button variant="outline" onClick={() => void retryBootstrap()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div role="status" className={FULL_SCREEN}>
      <Loader2Icon aria-hidden="true" className="size-6 animate-spin text-primary" />
      Connecting…
    </div>
  );
};
RequireAuth.displayName = 'RequireAuth';

export default RequireAuth;
