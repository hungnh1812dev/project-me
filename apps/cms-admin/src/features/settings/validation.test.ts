import { describe, expect, it } from 'vitest';

import { makePermission } from '@/test/fixtures';

import { PERMISSION_SLUG_PATTERN, permissionChanges, validatePermission } from './validation';

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
