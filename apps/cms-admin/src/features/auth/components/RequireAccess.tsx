import { useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAppSelector } from '@/app/hooks';

import { checkAccess, type AccessRequirements } from '../permissions/access';
import { selectActor } from '../store/selectors';

export interface RequireAccessProps extends AccessRequirements {
  /** Rendered when allowed. Defaults to the matched child route (`<Outlet />`). */
  children?: React.ReactNode;
}

/** Router state that `RequireAccess` passes to `/403`. */
export interface ForbiddenState {
  reason: string | null;
  from: string;
}

/**
 * Route guard for `permission`, `minLevel` and/or `can` (all given checks must pass). Place it
 * inside `RequireAuth`. A denial redirects to `/403` with the reason.
 */
const RequireAccess: React.FC<RequireAccessProps> = ({
  children,
  permission,
  mode,
  contentTypeSlug,
  minLevel,
  can,
}) => {
  const actor = useAppSelector(selectActor);
  const location = useLocation();
  const decision = useMemo(
    () => checkAccess(actor, { permission, mode, contentTypeSlug, minLevel, can }),
    [actor, permission, mode, contentTypeSlug, minLevel, can],
  );

  if (!decision.allowed) {
    const state: ForbiddenState = { reason: decision.reason, from: location.pathname };
    return <Navigate to="/403" replace state={state} />;
  }
  return children ?? <Outlet />;
};
RequireAccess.displayName = 'RequireAccess';

export default RequireAccess;
