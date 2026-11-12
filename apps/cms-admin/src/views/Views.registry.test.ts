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

  it('ask for read permission, so a page the caller cannot read has no item', () => {
    expect(APP_NAV.items.length).toBeGreaterThan(0);
    expect(APP_NAV.items.filter((item) => item.action !== 'read')).toEqual([]);
  });
});
