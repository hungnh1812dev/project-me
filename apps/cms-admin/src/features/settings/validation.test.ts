import { describe, expect, it } from 'vitest';

import { makePermission, makeRole } from '@/test/fixtures';

import {
  PERMISSION_SLUG_PATTERN,
  permissionChanges,
  ROLE_SLUG_PATTERN,
  roleChanges,
  roleSlugFromName,
  validatePermission,
  validateRole,
  validateTokenName,
} from './validation';

const VALID = { slug: 'article:export', name: 'Export articles', description: 'Download as CSV.' };

describe('PERMISSION_SLUG_PATTERN (AC-25)', () => {
  it.each(['article:export', 'api_token:read', 'a:b', 'media2:upload_v2'])('accepts %s', (slug) => {
    expect(PERMISSION_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each([
    'Article:export',
    'article',
    'article:',
    ':export',
    '1article:export',
    'article:1export',
    'article:export:post',
    'article-x:export',
    ' article:export',
  ])('rejects %s', (slug) => {
    expect(PERMISSION_SLUG_PATTERN.test(slug)).toBe(false);
  });
});

describe('validatePermission (AC-25)', () => {
  it('returns no errors for valid values', () => {
    expect(validatePermission(VALID)).toEqual({});
  });

  it('requires every field', () => {
    expect(validatePermission({ slug: '', name: '  ', description: '' })).toEqual({
      slug: 'Enter a slug.',
      name: 'Enter a name.',
      description: 'Enter a description.',
    });
  });

  it('checks the slug format', () => {
    expect(validatePermission({ ...VALID, slug: 'Article Export' }).slug).toBe(
      'Use resource:action in lowercase, for example article:export.',
    );
  });

  it('limits the name to 100 characters, after trimming', () => {
    expect(validatePermission({ ...VALID, name: ` ${'a'.repeat(100)} ` })).toEqual({});
    expect(validatePermission({ ...VALID, name: 'a'.repeat(101) }).name).toBe(
      'Use 100 characters or fewer.',
    );
  });

  it('limits the description to 500 characters', () => {
    expect(validatePermission({ ...VALID, description: 'a'.repeat(500) })).toEqual({});
    expect(validatePermission({ ...VALID, description: 'a'.repeat(501) }).description).toBe(
      'Use 500 characters or fewer.',
    );
  });

  it('skips the slug on edit, because it is read-only', () => {
    expect(validatePermission({ ...VALID, slug: '' }, { isEdit: true })).toEqual({});
  });
});

describe('permissionChanges (AC-26)', () => {
  const original = makePermission({ name: 'Read roles', description: 'List roles.' });

  it('returns only the changed fields, trimmed', () => {
    expect(
      permissionChanges(original, { name: ' Read roles ', description: 'List every role.' }),
    ).toEqual({ description: 'List every role.' });
    expect(permissionChanges(original, { name: 'View roles', description: 'List roles.' })).toEqual(
      { name: 'View roles' },
    );
  });

  it('returns an empty object when nothing changed', () => {
    expect(
      permissionChanges(original, { name: 'Read roles', description: 'List roles. ' }),
    ).toEqual({});
  });

  it('treats a null description as empty', () => {
    const blank = makePermission({ description: null });
    expect(permissionChanges(blank, { name: blank.name, description: 'Now set.' })).toEqual({
      description: 'Now set.',
    });
  });
});

describe('roleSlugFromName (AC-19)', () => {
  it.each([
    ['Content Writer', 'content-writer'],
    ['  Senior   Editor!! ', 'senior-editor'],
    ['Équipe — Média 2', 'quipe-m-dia-2'],
    ['--a__b--', 'a-b'],
    ['!!!', ''],
    ['', ''],
  ])('derives %j as %j', (name, slug) => {
    expect(roleSlugFromName(name)).toBe(slug);
  });

  it('keeps at most 63 characters, without a trailing dash', () => {
    const slug = roleSlugFromName(`${'a'.repeat(62)} bcd`);
    expect(slug).toBe('a'.repeat(62));
    expect(roleSlugFromName('x'.repeat(80))).toHaveLength(63);
  });
});

describe('ROLE_SLUG_PATTERN (AC-19)', () => {
  it.each(['writer', 'content-writer', 'a1-2b', '9'])('accepts %s', (slug) => {
    expect(ROLE_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['Writer', '-writer', 'writer-', 'content--writer', 'content_writer', 'a b', ''])(
    'rejects %j',
    (slug) => {
      expect(ROLE_SLUG_PATTERN.test(slug)).toBe(false);
    },
  );
});

describe('validateRole (AC-19, AC-20, D4)', () => {
  const VALID_ROLE = { name: 'Writer', slug: 'writer', level: '10', permissions: [] };

  it('returns no errors for valid values, including levels 0 and 100', () => {
    expect(validateRole(VALID_ROLE)).toEqual({});
    expect(validateRole({ ...VALID_ROLE, level: '0' })).toEqual({});
    expect(validateRole({ ...VALID_ROLE, level: '100' })).toEqual({});
  });

  it.each([
    ['an empty name', { name: '  ' }, { name: 'Enter a name.' }],
    ['a long name', { name: 'n'.repeat(101) }, { name: 'Use 100 characters or fewer.' }],
    ['an empty slug', { slug: '' }, { slug: 'Enter a slug.' }],
    [
      'a bad slug',
      { slug: 'Bad Slug' },
      { slug: 'Use lowercase letters, numbers and single dashes, for example content-writer.' },
    ],
    ['a long slug', { slug: 's'.repeat(64) }, { slug: 'Use 63 characters or fewer.' }],
    ['an empty level', { level: ' ' }, { level: 'Enter a level.' }],
    ['a level above 100', { level: '101' }, { level: 'Use a whole number from 0 to 100.' }],
    ['a negative level', { level: '-1' }, { level: 'Use a whole number from 0 to 100.' }],
    ['a decimal level', { level: '1.5' }, { level: 'Use a whole number from 0 to 100.' }],
  ])('flags %s', (_, change, errors) => {
    expect(validateRole({ ...VALID_ROLE, ...change })).toEqual(errors);
  });

  it('skips the slug on edit, where it is read-only', () => {
    expect(validateRole({ ...VALID_ROLE, slug: 'Legacy_Slug' }, { isEdit: true })).toEqual({});
  });
});

describe('roleChanges (AC-20)', () => {
  const ROLE = makeRole({ name: 'Editor', level: 20, permissions: ['a:b', 'c:d'] });
  const SAME = { name: 'Editor', slug: 'editor', level: '20', permissions: ['c:d', 'a:b'] };

  it('is empty when nothing changed (permission order and name whitespace ignored)', () => {
    expect(roleChanges(ROLE, { ...SAME, name: ' Editor ' })).toEqual({});
  });

  it('returns only the changed fields, trimmed and typed', () => {
    expect(roleChanges(ROLE, { ...SAME, name: ' Senior editor ' })).toEqual({
      name: 'Senior editor',
    });
    expect(roleChanges(ROLE, { ...SAME, level: '30' })).toEqual({ level: 30 });
    expect(roleChanges(ROLE, { ...SAME, permissions: ['a:b'] })).toEqual({ permissions: ['a:b'] });
    expect(roleChanges(ROLE, { ...SAME, permissions: ['a:b', 'c:d', 'e:f'] })).toEqual({
      permissions: ['a:b', 'c:d', 'e:f'],
    });
  });

  it('treats the same permissions with a duplicate as unchanged', () => {
    expect(roleChanges(ROLE, { ...SAME, permissions: ['a:b', 'c:d', 'a:b'] })).toEqual({});
  });
});

describe('validateTokenName (AC-29)', () => {
  it.each([
    ['', 'Enter a name.'],
    ['   ', 'Enter a name.'],
    ['a'.repeat(101), 'Use 100 characters or fewer.'],
  ])('rejects %j', (name, message) => {
    expect(validateTokenName(name)).toBe(message);
  });

  it.each(['CI', ` ${'a'.repeat(100)} `])('accepts %j (trimmed)', (name) => {
    expect(validateTokenName(name)).toBeUndefined();
  });
});
