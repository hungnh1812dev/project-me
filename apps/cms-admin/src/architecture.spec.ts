import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as appWiring from './features/auth/app-wiring';
import * as authFacade from './features/auth';

const AUTH_INDEX_FILE = resolve(import.meta.dirname, 'features/auth/index.ts');
const EXPORT_LIST = /export\s+(?:type\s+)?\{([^}]+)\}/g;

function namesExportedBy(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(EXPORT_LIST)]
    .flatMap(([, names = '']) => names.split(','))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
}

describe('auth feature boundary', () => {
  it('exposes exactly the narrow hooks and the Session type', () => {
    expect(namesExportedBy(AUTH_INDEX_FILE)).toEqual([
      'Session',
      'useCurrentUser',
      'useSession',
    ]);
    expect(Object.keys(authFacade).sort()).toEqual([
      'useCurrentUser',
      'useSession',
    ]);
  });

  it('keeps no wildcard export in the facade', () => {
    expect(readFileSync(AUTH_INDEX_FILE, 'utf8')).not.toMatch(/export\s+\*/);
  });

  it('gives the app only what wiring needs', () => {
    expect(Object.keys(appWiring).sort()).toEqual([
      'accessTokenOf',
      'authReducer',
      'createAuthApi',
      'createSession',
    ]);
  });
});
