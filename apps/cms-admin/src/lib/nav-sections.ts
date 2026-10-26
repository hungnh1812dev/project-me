import { COPY } from '../config/copy.constants';

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

const collectLeafIds = (sections: readonly NavSectionDefinition[]): string[] =>
  sections.flatMap((section) =>
    section.subSections ? collectLeafIds(section.subSections) : [section.id],
  );

export const NAV_SECTION_IDS: ReadonlySet<string> = new Set(
  collectLeafIds(NAV_SECTIONS),
);
