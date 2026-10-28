import { selectCurrentUser } from './Auth.slice';
import { useAuthSelector } from './useAuthSelector';

/** The signed-in user, or null while the session is unknown or anonymous. */
export function useCurrentUser() {
  return useAuthSelector(selectCurrentUser);
}
