import type { AppDispatch, AppThunk } from '@/app/store';
import { authApi } from '@/core/api/AuthApi';
import { toApiErrorData, type ApiErrorData } from '@/core/api/axiosBaseQuery';
import { refreshAccessToken } from '@/core/api/CmsApi';

import type { LoginRequest, MeUser } from '../types';
import { sessionCleared, statusChanged, tokenReceived, userLoaded } from './AuthSlice';

/** Waits before each bootstrap retry. A network error, 5xx or 429 is retried; nothing else is. */
export const BOOTSTRAP_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

export type LoginResult = { ok: true } | { ok: false; message: string };

const LOGIN_MESSAGES: Record<number, string> = {
  401: 'Invalid email or password.',
  403: "Your email address isn't verified yet.",
  429: 'Too many attempts. Please try again later.',
};

export function loginErrorMessage(error: Pick<ApiErrorData, 'status' | 'message'>): string {
  return LOGIN_MESSAGES[error.status] ?? error.message;
}

function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Always-fresh `GET /auth/me`, with no subscription left behind. */
function fetchMe(dispatch: AppDispatch): Promise<MeUser> {
  return dispatch(
    authApi.endpoints.me.initiate(undefined, { subscribe: false, forceRefetch: true }),
  ).unwrap();
}

async function runBootstrap(dispatch: AppDispatch): Promise<void> {
  dispatch(statusChanged({ status: 'loading' }));
  // A refresh rotates (and blacklists) the cookie, so once one succeeds, retries only redo `me`.
  let refreshed = false;
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (!refreshed) {
        dispatch(tokenReceived(await refreshAccessToken()));
        refreshed = true;
      }
      dispatch(userLoaded(await fetchMe(dispatch)));
      return;
    } catch (thrown) {
      const error = toApiErrorData(thrown);
      if (error.status === 401) {
        dispatch(sessionCleared());
        return;
      }
      const delay = BOOTSTRAP_RETRY_DELAYS_MS[attempt];
      if (!isRetryable(error.status) || delay === undefined) {
        dispatch(statusChanged({ status: 'error', error: error.message }));
        return;
      }
      await sleep(delay);
    }
  }
}

// One bootstrap per page load: the latch survives React StrictMode's double mount.
let bootstrapRun: Promise<void> | null = null;
let bootstrapRunning = false;

function startBootstrap(dispatch: AppDispatch): Promise<void> {
  bootstrapRunning = true;
  bootstrapRun = runBootstrap(dispatch).finally(() => {
    bootstrapRunning = false;
  });
  return bootstrapRun;
}

/** Restores the session from the refresh cookie (refresh → me). Runs once per page load. */
export const bootstrapSession = (): AppThunk<Promise<void>> => (dispatch) =>
  bootstrapRun ?? startBootstrap(dispatch);

/** Runs the bootstrap again (the Retry button), or joins the run still in flight. */
export const retryBootstrap = (): AppThunk<Promise<void>> => (dispatch) =>
  bootstrapRunning && bootstrapRun ? bootstrapRun : startBootstrap(dispatch);

/** Test-only: forget that bootstrap ran, as a page reload would. */
export function resetBootstrapLatch(): void {
  bootstrapRun = null;
  bootstrapRunning = false;
}

/** `POST /auth/login` → token → `GET /auth/me`. Resolves with a user-facing message on failure. */
export const login =
  (credentials: LoginRequest): AppThunk<Promise<LoginResult>> =>
  async (dispatch) => {
    const request = dispatch(authApi.endpoints.login.initiate(credentials));
    try {
      const { accessToken } = await request.unwrap();
      dispatch(tokenReceived(accessToken));
      dispatch(userLoaded(await fetchMe(dispatch)));
      return { ok: true };
    } catch (thrown) {
      const message = loginErrorMessage(toApiErrorData(thrown));
      dispatch(sessionCleared());
      dispatch(statusChanged({ status: 'unauthenticated', error: message }));
      return { ok: false, message };
    } finally {
      // Drops the mutation result, so the token is not kept in the RTK Query state.
      request.reset();
    }
  };

/** Signs out locally at once (state and caches), then tells the server best-effort. */
export const logout =
  (): AppThunk<Promise<void>> =>
  async (dispatch, _getState, { queryClient }) => {
    dispatch(sessionCleared());
    dispatch(authApi.util.resetApiState());
    queryClient.clear();

    const request = dispatch(authApi.endpoints.logout.initiate());
    try {
      await request.unwrap();
    } catch {
      // Logout never blocks the user: the local session is already gone.
    } finally {
      request.reset();
    }
  };
