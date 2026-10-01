import { describe, expect, it } from 'vitest';

import { makeMeUser } from '@/test/fixtures';

import type { AuthState } from '../types';
import authReducer, {
  initialAuthState,
  sessionCleared,
  sessionExpired,
  statusChanged,
  tokenReceived,
  userLoaded,
} from './AuthSlice';

const signedIn: AuthState = {
  status: 'authenticated',
  accessToken: 'token-1',
  user: makeMeUser(),
  error: null,
};

describe('AuthSlice', () => {
  it('starts idle with no token, user or error', () => {
    expect(authReducer(undefined, { type: '@@init' })).toEqual({
      status: 'idle',
      accessToken: null,
      user: null,
      error: null,
    });
  });

  it('tokenReceived stores the access token without changing the status', () => {
    const state = authReducer(initialAuthState, tokenReceived('token-2'));

    expect(state.accessToken).toBe('token-2');
    expect(state.status).toBe('idle');
  });

  it('userLoaded stores the user, marks the session authenticated and clears the error', () => {
    const user = makeMeUser({ email: 'ann@example.com' });
    const state = authReducer({ ...initialAuthState, error: 'old' }, userLoaded(user));

    expect(state).toMatchObject({ status: 'authenticated', user, error: null });
  });

  it('statusChanged sets the status and the error, defaulting the error to null', () => {
    const failed = authReducer(initialAuthState, statusChanged({ status: 'error', error: 'Down' }));
    expect(failed).toMatchObject({ status: 'error', error: 'Down' });

    const loading = authReducer(failed, statusChanged({ status: 'loading' }));
    expect(loading).toMatchObject({ status: 'loading', error: null });
  });

  it('sessionCleared drops the token and user and ends unauthenticated', () => {
    expect(authReducer(signedIn, sessionCleared())).toEqual({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      error: null,
    });
  });

  it('sessionExpired drops the token and user and ends unauthenticated', () => {
    expect(authReducer(signedIn, sessionExpired())).toEqual({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      error: null,
    });
  });
});
