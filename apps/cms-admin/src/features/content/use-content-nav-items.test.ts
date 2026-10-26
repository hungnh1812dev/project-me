import { describe, expect, it } from 'vitest';

import type { ContentType } from '../content-types';
import { contentNavItemsOf } from './use-content-nav-items';

const typeOf = (slug: string, kind: string): ContentType => ({
  slug,
  kind,
  draftAndPublish: false,
  fields: [],
});

const TYPES = [
  typeOf('cv-page', 'single'),
  typeOf('post', 'collection'),
  typeOf('legacy', 'unknown-kind'),
];

describe('contentNavItemsOf', () => {
  it('puts each kind under its section with the list path', () => {
    const items = contentNavItemsOf(TYPES, () => true);

    expect(
      items.map(({ label, path, section }) => ({ label, path, section })),
    ).toEqual([
      { label: 'cv-page', path: '/content/cv-page', section: 'singleTypes' },
      { label: 'post', path: '/content/post', section: 'collectionTypes' },
    ]);
  });

  it('keeps only the types the caller may read by slug', () => {
    const items = contentNavItemsOf(
      TYPES,
      (subject, action) => subject === 'post' && action === 'read',
    );

    expect(items.map((item) => item.label)).toEqual(['post']);
    expect(items[0]?.subject).toBe('post');
  });

  it('accepts the content wildcard and names it as the subject', () => {
    const items = contentNavItemsOf(TYPES, (subject) => subject === '*');

    expect(items.map((item) => item.subject)).toEqual(['*', '*']);
  });

  it('lists nothing when the caller can read nothing', () => {
    expect(contentNavItemsOf(TYPES, () => false)).toEqual([]);
  });
});
