import { describe, expect, it } from 'vitest';

import { NAV_SECTION_IDS, NAV_SECTIONS } from './nav-sections';

describe('NAV_SECTIONS', () => {
  it('lists the leaf sections items can join', () => {
    expect([...NAV_SECTION_IDS]).toEqual([
      'singleTypes',
      'collectionTypes',
      'utilities',
      'systemSettings',
    ]);
  });

  it('gives every section a label', () => {
    expect(NAV_SECTIONS.every((section) => section.label.length > 0)).toBe(
      true,
    );
  });
});
