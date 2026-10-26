import { join } from 'node:path';

import {
  assertPinnedPathsExist,
  listSourceFiles,
  withoutComments,
} from './ImportGraph.analyzer';
import {
  IDENTITY_DIRECTORY,
  REVIEWER_ACCOUNT_ADAPTER_FILE,
  ACCOUNT_VERSION_REPOSITORY_FILE,
} from './SourcePaths.constants';

/**
 * SPEC D9 (R1-09): identity owns session state. Only `modules/identity/`
 * references the `RefreshToken` model or writes `accounts.token_version`.
 * Writes that remain elsewhere are listed in `TOKEN_VERSION_WRITE_ALLOWLIST`
 * with the reason; a listed file that no longer writes fails the spec.
 */
const SRC_ROOT = join(__dirname, '..');
const GENERATED_DIRECTORY = 'generated';

const REFRESH_TOKEN_REFERENCE =
  /\brefreshToken\b|\bRefreshToken\b|refresh_tokens/;
/**
 * Any `tokenVersion:` that is not a read (`: true` in a select, `: number` in
 * a type) counts as a write, and so does a raw `token_version =` with or
 * without quoted identifiers.
 */
const TOKEN_VERSION_WRITE = new RegExp(
  [
    String.raw`\btokenVersion\s*:(?!\s*(?:true|false|number)\b)`,
    String.raw`["\x60]?\btoken_version["\x60]?\s*=`,
  ].join('|'),
  'g',
);

/** Files outside identity that may write, with how many writes they hold. */
const TOKEN_VERSION_WRITE_ALLOWLIST = new Map<string, number>([
  // Switching reviewer access off bumps every reviewer account (one raw
  // UPDATE); reviewers hold no refresh token.
  [REVIEWER_ACCOUNT_ADAPTER_FILE, 1],
  // Copies the column into the in-memory cache entry; not a database write.
  [ACCOUNT_VERSION_REPOSITORY_FILE, 1],
]);

const referencesRefreshToken = (code: string): boolean =>
  REFRESH_TOKEN_REFERENCE.test(withoutComments(code));

const countTokenVersionWrites = (code: string): number =>
  withoutComments(code).match(TOKEN_VERSION_WRITE)?.length ?? 0;

describe('session ownership (D9)', () => {
  const sources = listSourceFiles(SRC_ROOT).filter(
    ({ file }) => !file.startsWith(GENERATED_DIRECTORY),
  );
  const outsideIdentity = sources.filter(
    ({ file }) => !file.startsWith(IDENTITY_DIRECTORY),
  );

  it('scans the source tree and identity', () => {
    assertPinnedPathsExist(SRC_ROOT, [
      IDENTITY_DIRECTORY,
      ...TOKEN_VERSION_WRITE_ALLOWLIST.keys(),
    ]);
    expect(outsideIdentity.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(outsideIdentity.length);
  });

  it('only identity references the RefreshToken model', () => {
    const offenders = outsideIdentity
      .filter(({ text }) => referencesRefreshToken(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('only identity and the allowlisted files write token_version', () => {
    const offenders = outsideIdentity
      .filter(
        ({ file, text }) =>
          countTokenVersionWrites(text) !==
          (TOKEN_VERSION_WRITE_ALLOWLIST.get(file) ?? 0),
      )
      .map(({ file, text }) => `${file}: ${countTokenVersionWrites(text)}`);
    expect(offenders).toEqual([]);
  });

  it('every allowlisted file exists', () => {
    const files = sources.map(({ file }) => file);
    expect(
      [...TOKEN_VERSION_WRITE_ALLOWLIST.keys()].filter(
        (listed) => !files.includes(listed),
      ),
    ).toEqual([]);
  });
});

describe('session ownership detectors', () => {
  it('finds a RefreshToken delegate and a raw table name', () => {
    expect(referencesRefreshToken('tx.refreshToken.updateMany({})')).toBe(true);
    expect(referencesRefreshToken('SELECT 1 FROM refresh_tokens')).toBe(true);
  });

  it('ignores comments and service names', () => {
    expect(referencesRefreshToken('// a refreshToken row')).toBe(false);
    expect(referencesRefreshToken('class RefreshTokenService {}')).toBe(false);
  });

  it.each([
    'data: { tokenVersion: { increment: 1 } }',
    'data: { tokenVersion: account.tokenVersion + 1 }',
    'data: { tokenVersion: 0 }',
    'SET token_version = token_version + 1',
    'UPDATE accounts SET "token_version" = "token_version" + 1',
  ])('counts %s as a write', (code) => {
    expect(countTokenVersionWrites(code)).toBe(1);
  });

  it.each([
    'select: { tokenVersion: true }',
    'readonly tokenVersion: number;',
    '// tokenVersion: { increment: 1 }',
  ])('does not count %s', (code) => {
    expect(countTokenVersionWrites(code)).toBe(0);
  });
});
