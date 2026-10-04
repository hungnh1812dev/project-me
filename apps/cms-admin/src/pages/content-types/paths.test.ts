import { describe, expect, it } from 'vitest';

import { announcementOf, documentPath, listPath } from './paths';

describe('content-type paths', () => {
  it('encodes the slug and the documentId', () => {
    expect(listPath('my type')).toBe('/admin/content-types/my%20type');
    expect(documentPath('article', 'a/b')).toBe('/admin/content-types/article/a%2Fb');
  });

  it.each([
    [{ announce: 'Entry created.' }, 'Entry created.'],
    [{ announce: '' }, null],
    [{ announce: 3 }, null],
    [{ other: 'x' }, null],
    [null, null],
    ['Entry created.', null],
  ])('reads the announcement of %j', (state, expected) => {
    expect(announcementOf(state)).toBe(expected);
  });
});
