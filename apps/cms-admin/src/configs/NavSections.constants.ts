import { Files, FileText, Layers, Settings, Wrench, type LucideIcon } from 'lucide-react';

import { COMMON_TEXT } from './locales';
import type { PermissionAction } from './PermissionAction.constants';

/** A heading of the side menu; `subSections` nest under it, items attach to leaves. */
interface NavSectionDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  subSections?: readonly NavSectionDefinition[];
}

/** Browser storage key holding which sub-groups are open (`{ [sectionId]: boolean }`). */
export const NAV_GROUP_OPEN_STORAGE_KEY = 'abyss.cms-admin.nav-groups-open';

/** Menu structure in display order. A new section is one entry here plus one copy label. */
export const NAV_SECTIONS = [
  {
    id: 'content',
    label: COMMON_TEXT.nav.content,
    icon: Files,
    subSections: [
      { id: 'singleTypes', label: COMMON_TEXT.nav.singleTypes, icon: FileText },
      { id: 'collectionTypes', label: COMMON_TEXT.nav.collectionTypes, icon: Layers },
    ],
  },
  { id: 'utilities', label: COMMON_TEXT.nav.utilities, icon: Wrench },
  { id: 'systemSettings', label: COMMON_TEXT.nav.systemSettings, icon: Settings },
] as const satisfies readonly NavSectionDefinition[];

type LeafIds<Section> = Section extends {
  subSections: readonly (infer Sub)[];
}
  ? LeafIds<Sub>
  : Section extends { id: infer Id }
    ? Id
    : never;

/** Sections a nav item can belong to: the sections without sub-sections. */
export type NavSectionId = LeafIds<(typeof NAV_SECTIONS)[number]>;

export const collectLeafIds = (sections: readonly NavSectionDefinition[]): string[] =>
  sections.flatMap((section) =>
    section.subSections ? collectLeafIds(section.subSections) : [section.id],
  );

export const NAV_SECTION_IDS: ReadonlySet<string> = new Set(collectLeafIds(NAV_SECTIONS));

/** The section whose items come from loaded data; the menu shows its loading and error rows. */
export const DATA_BACKED_SECTION_ID = 'content';

/** A nav link, listed under `section`, shown only to callers holding `action` on `subject`. */
export interface NavItem {
  label: string;
  path: string;
  section: NavSectionId;
  subject: string;
  action: PermissionAction;
}

/** What a data-backed nav hook returns: its items and the load state the menu shows. */
export interface NavItemsState {
  items: readonly NavItem[];
  isLoading: boolean;
  hasFailed: boolean;
  retry: () => void;
}

/** Everything the side menu lists: fixed items, then the items of data-backed hooks. */
export interface NavSource {
  items: readonly NavItem[];
  /** A module constant, so the menu calls the hooks in the same order every render. */
  hooks: readonly (() => NavItemsState)[];
}
