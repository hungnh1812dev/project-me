import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';

import type { AuthState } from '../types';
import { initialAuthState } from './AuthSlice';
import {
  selectActor,
  selectAuthStatus,
  selectCurrentUser,
  selectIsAuthenticated,
  selectPermissions,
  selectRole,
  selectRoleLevel,
} from './selectors';

const stateWith = (auth: Partial<AuthState>) => ({ auth: { ...initialAuthState, ...auth } });

describe('auth selectors', () => {
  it('select the status and whether the session is authenticated', () => {
    expect(selectAuthStatus(stateWith({ status: 'loading' }))).toBe('loading');
    expect(selectIsAuthenticated(stateWith({ status: 'loading' }))).toBe(false);
    expect(selectIsAuthenticated(stateWith({ status: 'authenticated' }))).toBe(true);
  });

  it('select the current user, its role and the role permissions', () => {
    const role = makeRole({ permissions: ['user:read', 'document:read'] });
    const user = makeMeUser({ role });
    const state = stateWith({ status: 'authenticated', user });

    expect(selectCurrentUser(state)).toBe(user);
    expect(selectRole(state)).toBe(role);
    expect(selectPermissions(state)).toBe(role.permissions);
  });

  it('return a null role and the same empty permissions array when no user is loaded', () => {
    const first = selectPermissions(stateWith({}));
    const second = selectPermissions(stateWith({ status: 'unauthenticated' }));

    expect(selectRole(stateWith({}))).toBeNull();
    expect(first).toEqual([]);
    expect(second).toBe(first);
  });

  it('return the same empty permissions array for a user without a role', () => {
    const a = selectPermissions(stateWith({ user: makeMeUser({ role: null, roleId: null }) }));
    const b = selectPermissions(stateWith({ user: makeMeUser({ role: null, roleId: null }) }));

    expect(a).toEqual([]);
    expect(b).toBe(a);
  });

  it('memoize permissions while the role is unchanged', () => {
    const user = makeMeUser();
    const state = stateWith({ user });

    expect(selectPermissions({ auth: { ...state.auth, error: 'x' } })).toBe(
      selectPermissions(state),
    );
  });
});

describe('RBAC/ABAC selectors', () => {
  it('select the role level, 0 without a role', () => {
    const user = makeMeUser({ role: makeRole({ level: 50 }) });

    expect(selectRoleLevel(stateWith({ user }))).toBe(50);
    expect(selectRoleLevel(stateWith({ user: makeMeUser({ role: null }) }))).toBe(0);
    expect(selectRoleLevel(stateWith({}))).toBe(0);
  });

  it('select the actor and keep it stable while the user is unchanged', () => {
    const role = makeRole({ level: 20, permissions: ['media:read'] });
    const state = stateWith({ user: makeMeUser({ documentId: 'u-1', role }) });

    const actor = selectActor(state);

    expect(actor).toEqual({ userId: 'u-1', level: 20, permissions: ['media:read'] });
    expect(selectActor({ auth: { ...state.auth, status: 'loading' } })).toBe(actor);
  });

  it('select an anonymous actor when signed out', () => {
    expect(selectActor(stateWith({}))).toEqual({ userId: null, level: 0, permissions: [] });
  });
});
