import {
  AlignLeft,
  Braces,
  Calendar,
  CalendarClock,
  Hash,
  Image,
  LayoutList,
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
}

/** Palette order. A new field type is one entry here plus one copy label. */
export const FIELD_TYPES = [
  { type: 'text', icon: TextCursorInput, copyKey: 'text' },
  { type: 'string', icon: AlignLeft, copyKey: 'string' },
  { type: 'richtext', icon: Pilcrow, copyKey: 'richtext' },
  { type: 'integer', icon: Hash, copyKey: 'integer' },
  { type: 'decimal', icon: Percent, copyKey: 'decimal' },
  { type: 'boolean', icon: ToggleLeft, copyKey: 'boolean' },
  { type: 'date', icon: Calendar, copyKey: 'date' },
  { type: 'datetime', icon: CalendarClock, copyKey: 'datetime' },
  { type: 'json', icon: Braces, copyKey: 'json' },
  { type: 'media', icon: Image, copyKey: 'media' },
  { type: 'component', icon: LayoutList, copyKey: 'component' },
] as const satisfies readonly FieldTypeEntry[];

export type FieldTypeName = (typeof FIELD_TYPES)[number]['type'];

/** The one type whose fields hold children. */
export const COMPONENT_FIELD_TYPE = 'component' satisfies FieldTypeName;

export function findFieldType(type: string): (typeof FIELD_TYPES)[number] | undefined {
  return FIELD_TYPES.find((entry) => entry.type === type);
}
