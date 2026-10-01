import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { toRedirectState } from '../redirect';

const FULL_SCREEN: React.CSSProperties = {
  minHeight: '100svh',
  display: 'grid',
  placeContent: 'center',
  gap: '0.75rem',
  textAlign: 'center',
};

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
      <div role="alert" style={FULL_SCREEN}>
        <p>Can&apos;t reach the server.</p>
        <button type="button" onClick={() => void retryBootstrap()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div role="status" style={FULL_SCREEN}>
      Connecting…
    </div>
  );
};
RequireAuth.displayName = 'RequireAuth';

export default RequireAuth;
