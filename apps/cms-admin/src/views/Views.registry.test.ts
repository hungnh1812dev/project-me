import { NAV_SECTION_IDS } from '@configs/NavSections.constants';
import { describe, expect, it } from 'vitest';

import { APP_NAV } from './Views.registry';

describe('view nav items', () => {
  it('only name sections that exist in NAV_SECTIONS', () => {
    const unknownSections = APP_NAV.items
      .map((item) => item.section as string)
      .filter((section) => !NAV_SECTION_IDS.has(section));

    expect(unknownSections).toEqual([]);
  });
});
