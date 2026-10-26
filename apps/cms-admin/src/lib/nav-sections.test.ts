import { describe, expect, it } from 'vitest';

import { FEATURE_LIST } from '../features/registry';
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

describe('feature nav items', () => {
  it('only name sections that exist in NAV_SECTIONS', () => {
    const unknownSections = FEATURE_LIST.flatMap(
      (feature) => feature.navItems ?? [],
    )
      .map((item) => item.section as string)
      .filter((section) => !NAV_SECTION_IDS.has(section));

    expect(unknownSections).toEqual([]);
  });
});
