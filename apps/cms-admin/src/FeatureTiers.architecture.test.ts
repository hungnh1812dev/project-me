import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import * as appWiring from './features/auth/AuthWiring.setup';
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
  backups: ['BackupsPage'],
  content: ['CollectionListPage', 'DocumentEditPage'],
  media: ['MediaField', 'MediaLibraryPage', 'mediaToApi', 'mediaToForm'],
  reviewer: ['ReviewerSessionsPage'],
  security: ['ConfirmWithCodeForm', 'SecuritySettingsPage', 'useSecurityApi'],
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

describe('list tables', () => {
  const MATRIX_FILES = ['PermissionMatrix.tsx', 'TokenScopeEditor.tsx'];

  it('keeps hand-written tables to the two matrices; lists use SortableSheet', () => {
    const withTable = sourceFilesIn(resolve(import.meta.dirname))
      .filter((file) => readFileSync(file, 'utf8').includes('<table'))
      .map((file) => basename(file))
      .sort();
    expect(withTable).toEqual(MATRIX_FILES);
  });
});

// Comments describe the code, not the backlog: task and question IDs rot once
// the backlog is archived. SPEC IDs (`D9`, `§9`) stay and are not matched.
const BACKLOG_ID = /\b(T\d{1,3}[a-z]?|OS\d+|Q-?[A-Z]*\d+)\b/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(?:^|\s)\/\/.*$/gm;

function backlogIdsInComments(text: string): string[] {
  const comments = [
    ...(text.match(BLOCK_COMMENT) ?? []),
    ...(text.match(LINE_COMMENT) ?? []),
  ];
  return comments.flatMap((comment) =>
    comment
      .split('\n')
      .map((line) => BACKLOG_ID.exec(line)?.[1])
      .filter((id): id is string => id !== undefined),
  );
}

describe('comments carry no backlog IDs', () => {
  it('no non-test source comment names a task, question or OS ID', () => {
    const offenders = sourceFilesIn(resolve(import.meta.dirname))
      .map((file) => ({
        file: file.replace(import.meta.dirname, ''),
        ids: backlogIdsInComments(readFileSync(file, 'utf8')),
      }))
      .filter(({ ids }) => ids.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('the guard itself', () => {
    it('flags task, question and OS IDs in block, doc and line comments', () => {
      expect(backlogIdsInComments('/** Throttle (T10a). */')).toEqual(['T10a']);
      expect(backlogIdsInComments('const a = 1; // see Q-G4')).toEqual([
        'Q-G4',
      ]);
      expect(backlogIdsInComments('/*\n * OS4 walk\n * and Q5\n */')).toEqual([
        'OS4',
        'Q5',
      ]);
    });

    it('ignores SPEC IDs, section marks, 2fa and code outside comments', () => {
      expect(
        backlogIdsInComments('/** SPEC D9, D14 and §9 for 2fa. */'),
      ).toEqual([]);
      expect(backlogIdsInComments('Date.parse(`${raw}T00:00:00Z`);')).toEqual(
        [],
      );
      expect(backlogIdsInComments("const kind = 'T10';")).toEqual([]);
      expect(backlogIdsInComments("fetch('https://x.test/T10')")).toEqual([]);
    });
  });
});
