import { selectCurrentUser } from './auth.slice';
import { useAuthSelector } from './auth-hooks';

/** The signed-in user, or null while the session is unknown or anonymous. */
export function useCurrentUser() {
  return useAuthSelector(selectCurrentUser);
}
