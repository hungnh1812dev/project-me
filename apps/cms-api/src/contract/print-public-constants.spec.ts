import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_PUBLIC_CONSTANTS_FILE,
  printPublicConstants,
} from './print-public-constants';
import { buildPublicConstants } from './public-constants';

const SOURCE_FILE = join(__dirname, 'public-constants.ts');
const SECRET_KEY_PATTERN = /secret|pepper|enc_?key|private/i;

describe('public constants snapshot', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'public-constants-'));
    file = join(dir, 'public-constants.json');
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the file, then reports it up to date', async () => {
    expect(await printPublicConstants({ file, check: false })).toEqual({
      status: 'written',
    });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(
      buildPublicConstants(),
    );
    expect(await printPublicConstants({ file, check: false })).toEqual({
      status: 'up-to-date',
    });
  });

  it('--check reports a missing or stale file and writes nothing', async () => {
    expect(await printPublicConstants({ file, check: true })).toEqual({
      status: 'missing',
    });
    await writeFile(file, '{}\n');
    expect(await printPublicConstants({ file, check: true })).toEqual({
      status: 'stale',
    });
    expect(await readFile(file, 'utf8')).toBe('{}\n');
  });

  it('the committed file matches the constants', async () => {
    expect(
      await printPublicConstants({
        file: DEFAULT_PUBLIC_CONSTANTS_FILE,
        check: true,
      }),
    ).toEqual({ status: 'up-to-date' });
  });

  it('holds the values the clients mirror', () => {
    const constants = buildPublicConstants();
    expect(constants.password).toEqual({ minLength: 12, maxLength: 128 });
    expect(constants.setupTokenMaxLength).toBe(256);
    expect(constants.otp).toEqual({ digits: 6, ttlSeconds: 300 });
    expect(constants.totp).toEqual({ digits: 6, periodSeconds: 30 });
    expect(constants.refreshCookieName).toBe('__Secure-abyss_rt');
    expect(constants.reviewerInputLimits.NOTES_MAX_LENGTH).toBe(500);
    expect(constants.permissionActions).toEqual(
      expect.arrayContaining(['read', 'create', 'update', 'delete']),
    );
    expect(Object.keys(constants.systemSubjects)).toContain(
      'reviewer_settings',
    );
    expect(constants.richtextUrlSchemes).toEqual([
      'http',
      'https',
      'mailto',
      'tel',
    ]);
    expect(constants.errorCodes.auth.INVALID_CREDENTIALS).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('carries no env or secret value', () => {
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(collect);
      if (value !== null && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          collect(inner);
        }
      }
    };
    collect(buildPublicConstants());
    expect(keys.filter((key) => SECRET_KEY_PATTERN.test(key))).toEqual([]);
  });

  it('builds from *.constants.ts modules only', async () => {
    const source = await readFile(SOURCE_FILE, 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1] ?? '',
    );
    expect(imports.filter((path) => !/\.constants$/.test(path))).toEqual([]);
  });
});
