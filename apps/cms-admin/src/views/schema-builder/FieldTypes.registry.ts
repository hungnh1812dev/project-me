import {
  AlignLeft,
  Braces,
  Calendar,
  CalendarClock,
  Clock,
  Hash,
  Image,
  LayoutList,
  ListChecks,
  Percent,
  Pilcrow,
  TextCursorInput,
  ToggleLeft,
  type LucideIcon,
} from 'lucide-react';

/** A field type of the schema format (content-schema.md "Field types"). */
interface FieldTypeEntry {
  type: string;
  icon: LucideIcon;
  /** Key of this type's label in the schema-builder screen copy (`fieldTypes.<copyKey>`). */
  copyKey: string;
  /** Whether a repeatable component may name a field of this type as its `titleField` or `subtitleField` (CM-14). */
  canTitleItem: boolean;
}

/** Every field type of the format. A new field type is one entry here plus one copy label. */
export const FIELD_TYPES = [
  { type: 'text', icon: TextCursorInput, copyKey: 'text', canTitleItem: true },
  { type: 'string', icon: AlignLeft, copyKey: 'string', canTitleItem: true },
  { type: 'richtext', icon: Pilcrow, copyKey: 'richtext', canTitleItem: false },
  { type: 'integer', icon: Hash, copyKey: 'integer', canTitleItem: true },
  { type: 'biginteger', icon: Hash, copyKey: 'biginteger', canTitleItem: true },
  { type: 'float', icon: Percent, copyKey: 'float', canTitleItem: true },
  { type: 'double', icon: Percent, copyKey: 'double', canTitleItem: true },
  { type: 'decimal', icon: Percent, copyKey: 'decimal', canTitleItem: true },
  { type: 'boolean', icon: ToggleLeft, copyKey: 'boolean', canTitleItem: false },
  { type: 'date', icon: Calendar, copyKey: 'date', canTitleItem: true },
  { type: 'datetime', icon: CalendarClock, copyKey: 'datetime', canTitleItem: true },
  { type: 'time', icon: Clock, copyKey: 'time', canTitleItem: true },
  { type: 'enumeration', icon: ListChecks, copyKey: 'enumeration', canTitleItem: true },
  { type: 'json', icon: Braces, copyKey: 'json', canTitleItem: false },
  { type: 'media', icon: Image, copyKey: 'media', canTitleItem: false },
  { type: 'component', icon: LayoutList, copyKey: 'component', canTitleItem: false },
] as const satisfies readonly FieldTypeEntry[];

export type FieldTypeName = (typeof FIELD_TYPES)[number]['type'];

/** The one type whose fields hold children. */
export const COMPONENT_FIELD_TYPE = 'component' satisfies FieldTypeName;

/** The direct children of a component that may be its item title or subtitle field (CM-14), in field order. */
export function titleFieldCandidates<T extends { type: string }>(component: {
  fields: readonly T[];
}): T[] {
  return component.fields.filter((child) => findFieldType(child.type)?.canTitleItem === true);
}

export function findFieldType(type: string): (typeof FIELD_TYPES)[number] | undefined {
  return FIELD_TYPES.find((entry) => entry.type === type);
}

/** One choice inside a group: a field type, plus the key it presets (`unsigned`) when it is not just the type. */
interface FieldVariantEntry {
  /** Unique across groups; the key of its label in the copy (`fieldVariants.<key>`). */
  key: string;
  type: FieldTypeName;
  unsigned?: true;
}

/** Several field types shown as one palette item with a type select in the field properties (SB-4). */
interface FieldGroupEntry {
  key: string;
  icon: LucideIcon;
  defaultVariant: string;
  variants: readonly FieldVariantEntry[];
}

/** A new kind of text, number or date is one variant entry here plus one label in `fieldVariants`. */
export const FIELD_TYPE_GROUPS = [
  {
    key: 'textInput',
    icon: TextCursorInput,
    defaultVariant: 'singleLine',
    variants: [
      { key: 'singleLine', type: 'text' },
      { key: 'multiLine', type: 'string' },
    ],
  },
  {
    key: 'number',
    icon: Hash,
    defaultVariant: 'integer',
    variants: [
      { key: 'unsignedInteger', type: 'integer', unsigned: true },
      { key: 'integer', type: 'integer' },
      { key: 'biginteger', type: 'biginteger' },
      { key: 'float', type: 'float' },
      { key: 'double', type: 'double' },
      { key: 'decimal', type: 'decimal' },
    ],
  },
  {
    key: 'datetimePicker',
    icon: CalendarClock,
    defaultVariant: 'datetime',
    variants: [
      { key: 'date', type: 'date' },
      { key: 'datetime', type: 'datetime' },
      { key: 'time', type: 'time' },
    ],
  },
] as const satisfies readonly FieldGroupEntry[];

export type FieldGroupKey = (typeof FIELD_TYPE_GROUPS)[number]['key'];
export type FieldVariantKey = (typeof FIELD_TYPE_GROUPS)[number]['variants'][number]['key'];

type FieldGroup = (typeof FIELD_TYPE_GROUPS)[number];
type FieldVariant = FieldGroup['variants'][number];

/** The group and variant a field belongs to, from its `type` and `unsigned`; `undefined` for an ungrouped type. */
export function variantOf(field: {
  type: string;
  unsigned?: boolean;
}): { group: FieldGroup; variant: FieldVariant } | undefined {
  const isUnsigned = field.unsigned === true;
  for (const group of FIELD_TYPE_GROUPS) {
    const ofType: readonly FieldVariant[] = group.variants.filter(
      (variant) => variant.type === field.type,
    );
    const variant =
      (isUnsigned ? ofType.find((candidate) => 'unsigned' in candidate) : undefined) ??
      ofType.find((candidate) => !('unsigned' in candidate));
    if (variant !== undefined) return { group, variant };
  }
  return undefined;
}

export function findVariant(key: string): FieldVariant | undefined {
  for (const group of FIELD_TYPE_GROUPS) {
    const variant = group.variants.find((candidate) => candidate.key === key);
    if (variant !== undefined) return variant;
  }
  return undefined;
}

/** Palette order: a field type, or a group standing in for its member types. */
const PALETTE_ORDER: readonly (FieldTypeName | FieldGroupKey)[] = [
  'textInput',
  'richtext',
  'number',
  'boolean',
  'datetimePicker',
  'enumeration',
  'json',
  'media',
  'component',
];

export interface PaletteItem {
  /** The type a pick or drop creates (a group's default variant). */
  defaultType: FieldTypeName;
  icon: LucideIcon;
  /** Set for a group item: its label is `fieldGroups.<group>`; otherwise `fieldTypes.<copyKey>`. */
  group?: FieldGroupKey;
  copyKey: string;
}

export function paletteItems(): PaletteItem[] {
  return PALETTE_ORDER.map((entry): PaletteItem => {
    const group = FIELD_TYPE_GROUPS.find((candidate) => candidate.key === entry);
    if (group !== undefined) {
      const defaultType = group.variants.find(
        (variant) => variant.key === group.defaultVariant,
      )!.type;
      return { defaultType, icon: group.icon, group: group.key, copyKey: defaultType };
    }
    const type = FIELD_TYPES.find((candidate) => candidate.type === entry)!;
    return { defaultType: type.type, icon: type.icon, copyKey: type.copyKey };
  });
}

export function paletteItemOfType(type: string): PaletteItem | undefined {
  return paletteItems().find((item) => item.defaultType === type);
}

interface FieldTypeLabels {
  fieldTypes: Readonly<Record<string, string>>;
  fieldGroups: Readonly<Record<string, string>>;
}

export function paletteItemLabel(item: PaletteItem, copy: FieldTypeLabels): string {
  const label =
    item.group === undefined ? copy.fieldTypes[item.copyKey] : copy.fieldGroups[item.group];
  return label ?? item.copyKey;
}
