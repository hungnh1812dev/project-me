/** Where a successful login goes when there is no page to return to. */
export const DEFAULT_AFTER_LOGIN = '/admin';

/** Router state that `RequireAuth` passes to `/login`: the page to return to. */
export interface RedirectState {
  from: string;
}

interface PathParts {
  pathname: string;
  search: string;
  hash: string;
}

export function toRedirectState({ pathname, search, hash }: PathParts): RedirectState {
  return { from: `${pathname}${search}${hash}` };
}

function isSafeInAppPath(path: string): boolean {
  // `//host` and `/\host` are protocol-relative URLs that would leave the app.
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

/** The page to open after login: `state.from` when it is a safe in-app path, else `/admin`. */
export function redirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return DEFAULT_AFTER_LOGIN;
  }
  const { from } = state;
  if (typeof from !== 'string' || !isSafeInAppPath(from) || /^\/login(?:[?#]|$)/.test(from)) {
    return DEFAULT_AFTER_LOGIN;
  }
  return from;
}
