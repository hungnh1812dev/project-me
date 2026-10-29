import { NAV_SECTION_IDS } from '@libs/NavSections.constants';
import { describe, expect, it } from 'vitest';

import { FEATURE_LIST } from './Features.registry';

describe('feature nav items', () => {
  it('only name sections that exist in NAV_SECTIONS', () => {
    const unknownSections = FEATURE_LIST.flatMap((feature) => feature.navItems ?? [])
      .map((item) => item.section as string)
      .filter((section) => !NAV_SECTION_IDS.has(section));

    expect(unknownSections).toEqual([]);
  });
});
