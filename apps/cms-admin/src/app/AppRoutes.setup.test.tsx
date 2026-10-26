import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { APP_ROUTES } from '../config/App.routes';
import { PUBLIC_ROUTE_PATHS } from '../features/auth/Auth.feature';
import { FEATURES } from '../features/Features.registry';
import { appRoutes } from './AppRoutes.setup';

const FEATURES_DIR = resolve(import.meta.dirname, '../features');

describe('route table', () => {
  it('has exactly four public routes', () => {
    expect([...PUBLIC_ROUTE_PATHS].sort()).toEqual(
      [
        APP_ROUTES.LOGIN,
        APP_ROUTES.SETUP,
        APP_ROUTES.RESET_PASSWORD,
        APP_ROUTES.SET_PASSWORD,
      ].sort(),
    );
  });

  it('serves only the allowlisted paths outside the protected branch', () => {
    const openPaths = appRoutes
      .filter((route) => route.path !== undefined && route.path !== '*')
      .map((route) => route.path);
    expect(openPaths.sort()).toEqual([...PUBLIC_ROUTE_PATHS].sort());
  });

  it('puts every other feature route behind sign-in', () => {
    const protectedBranch = appRoutes.find((route) => route.children);
    const shell = protectedBranch?.children?.[0];
    const paths = shell?.children?.map((route) => route.path);
    expect(paths).toContain(APP_ROUTES.ACCOUNTS);
    expect(paths).toContain(APP_ROUTES.SECURITY_SETTINGS);
    expect(paths).not.toContain(APP_ROUTES.LOGIN);
    expect(shell?.children?.some((route) => route.index === true)).toBe(true);
  });

  it('keeps the catch-all route last', () => {
    expect(appRoutes.at(-1)?.path).toBe('*');
    expect(appRoutes.filter((route) => route.path === '*')).toHaveLength(1);
  });
});

describe('feature registry', () => {
  it('registers every features/* folder', () => {
    const folders = readdirSync(FEATURES_DIR).filter((entry) =>
      statSync(resolve(FEATURES_DIR, entry)).isDirectory(),
    );
    expect(Object.keys(FEATURES).sort()).toEqual(folders.sort());
  });
});
