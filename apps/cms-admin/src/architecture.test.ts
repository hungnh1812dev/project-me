import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import * as appWiring from './features/auth/app-wiring';
import * as authFacade from './features/auth';

const FEATURES_DIR = resolve(import.meta.dirname, 'features');
const EXPORT_LIST = /export\s+(?:type\s+)?\{([^}]+)\}/g;
const SIBLING_FEATURE_IMPORT = /from\s+'\.\.\/([^./][^'/]*)(\/[^']*)?'/g;
const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;

function indexFileOf(feature: string): string {
  return join(FEATURES_DIR, feature, 'index.ts');
}

function namesExportedBy(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(EXPORT_LIST)]
    .flatMap(([, names = '']) => names.split(','))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
}

function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFilesIn(path);
    return SOURCE_FILE.test(entry) && !TEST_FILE.test(entry) ? [path] : [];
  });
}

function featureFolders(): string[] {
  return readdirSync(FEATURES_DIR)
    .map((entry) => join(FEATURES_DIR, entry))
    .filter((path) => statSync(path).isDirectory());
}

// `../x` means a sibling feature only inside a feature folder; files directly
// in features/ (the registry) reach lib/ and config/ the same way.
function deepCrossFeatureImports(): string[] {
  return featureFolders()
    .flatMap(sourceFilesIn)
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SIBLING_FEATURE_IMPORT)]
        .filter(([, , subpath]) => subpath !== undefined)
        .map(
          ([statement]) => `${file.replace(FEATURES_DIR, '')}: ${statement}`,
        ),
    );
}

const FACADE_EXPORTS: Record<string, string[]> = {
  access: [
    'AccountsPage',
    'ApiTokensPage',
    'CONTENT_WILDCARD_SUBJECT',
    'PermissionAction',
    'RolePermissionsPage',
    'RolesPage',
    'isForbidden',
    'toAccessError',
    'useCallerAccess',
  ],
  auth: [
    'PASSWORDS_MATCH_ISSUE',
    'Session',
    'newPasswordShape',
    'passwordsMatch',
    'useCurrentUser',
    'useEmailCode',
    'useSession',
  ],
  content: ['CollectionListPage', 'DocumentEditPage'],
  media: ['MediaField', 'MediaLibraryPage', 'mediaToApi', 'mediaToForm'],
  reviewer: ['ReviewerSessionsPage'],
  security: ['CSP_NONCE_META_NAME', 'SecuritySettingsPage'],
};

describe('feature facades', () => {
  it.each(Object.entries(FACADE_EXPORTS))(
    '%s exposes exactly its listed names',
    (feature, names) => {
      expect(namesExportedBy(indexFileOf(feature))).toEqual([...names].sort());
    },
  );

  it.each(Object.keys(FACADE_EXPORTS))(
    '%s keeps no wildcard export in its facade',
    (feature) => {
      expect(readFileSync(indexFileOf(feature), 'utf8')).not.toMatch(
        /export\s+\*/,
      );
    },
  );

  it('has every cross-feature import target an index.ts', () => {
    expect(deepCrossFeatureImports()).toEqual([]);
  });
});

describe('auth feature boundary', () => {
  it('exposes only the narrow hooks and form helpers at runtime', () => {
    expect(Object.keys(authFacade).sort()).toEqual([
      'PASSWORDS_MATCH_ISSUE',
      'newPasswordShape',
      'passwordsMatch',
      'useCurrentUser',
      'useEmailCode',
      'useSession',
    ]);
  });

  it('gives the app only what wiring needs', () => {
    expect(Object.keys(appWiring).sort()).toEqual([
      'accessTokenOf',
      'authReducer',
      'browserCrossTabOptions',
      'createAuthApi',
      'createSession',
      'installAuthInterceptor',
    ]);
  });
});
