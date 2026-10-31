import { COPY } from './Copy.constants';
import type { PermissionAction } from './PermissionAction.constants';

/** A heading of the side menu; `subSections` nest under it, items attach to leaves. */
interface NavSectionDefinition {
  id: string;
  label: string;
  subSections?: readonly NavSectionDefinition[];
}

/** Menu structure in display order. A new section is one entry here plus one copy label. */
export const NAV_SECTIONS = [
  {
    id: 'content',
    label: COPY.access.nav.content,
    subSections: [
      { id: 'singleTypes', label: COPY.access.nav.singleTypes },
      { id: 'collectionTypes', label: COPY.access.nav.collectionTypes },
    ],
  },
  { id: 'utilities', label: COPY.access.nav.utilities },
  { id: 'systemSettings', label: COPY.access.nav.systemSettings },
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
