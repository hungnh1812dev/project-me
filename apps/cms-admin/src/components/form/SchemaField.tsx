import { fieldKind, fieldLabel } from '@/features/content/schema';
import type { FieldDefinition } from '@/features/content/types';

import { NumberField } from './fields/NumberField';
import { TextField } from './fields/TextField';

export interface SchemaFieldProps {
  field: FieldDefinition;
  /** The form value path of this field (`title`, `seo.metaTitle`, `gallery.0.caption`). */
  name: string;
  /** Layout classes for the field's wrapper, such as its grid span. */
  className?: string;
}

/** Renders the control for one schema field, chosen by its kind. */
export const SchemaField: React.FC<SchemaFieldProps> = ({ field, name, className }) => {
  const label = fieldLabel(field);
  switch (fieldKind(field)) {
    case 'text':
      return <TextField label={label} name={name} className={className} />;
    case 'richtext':
      // A plain HTML textarea until the Tiptap editor lands (task 5.4).
      return <TextField label={label} name={name} multiline className={className} />;
    case 'number':
      return <NumberField field={field} label={label} name={name} className={className} />;
    default:
      // The value stays in the form state and is sent back unchanged.
      return null;
  }
};
SchemaField.displayName = 'SchemaField';
