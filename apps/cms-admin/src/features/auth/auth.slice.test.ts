import { createAuthTestStore } from './auth-test-store';
import {
  accessTokenReceived,
  selectAccessToken,
  selectCurrentUser,
  selectSessionStatus,
  signedIn,
  signedOut,
} from './auth.slice';
import { TEST_USER } from '../../../test/render-app';

describe('authSlice', () => {
  it('starts unknown, so nothing renders as signed out before the silent refresh', () => {
    const store = createAuthTestStore();
    expect(selectSessionStatus(store.getState())).toBe('unknown');
    expect(selectAccessToken(store.getState())).toBeNull();
  });

  it('keeps the token, then becomes authenticated with the /me user', () => {
    const store = createAuthTestStore();
    store.dispatch(accessTokenReceived('token-1'));
    expect(selectSessionStatus(store.getState())).toBe('unknown');
    store.dispatch(signedIn(TEST_USER));
    expect(selectSessionStatus(store.getState())).toBe('authenticated');
    expect(selectAccessToken(store.getState())).toBe('token-1');
    expect(selectCurrentUser(store.getState())).toEqual(TEST_USER);
  });

  it('clears token and user on sign-out', () => {
    const store = createAuthTestStore();
    store.dispatch(accessTokenReceived('token-1'));
    store.dispatch(signedIn(TEST_USER));
    store.dispatch(signedOut());
    expect(store.getState().auth).toEqual({
      status: 'anonymous',
      accessToken: null,
      user: null,
      endNotice: null,
    });
  });

  it('never writes the token to browser storage or cookies', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const store = createAuthTestStore();
    store.dispatch(accessTokenReceived('token-1'));
    store.dispatch(signedIn(TEST_USER));
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
    setItem.mockRestore();
  });
});
