import { fieldKind, fieldLabel } from '@/features/content/schema';
import type { FieldDefinition } from '@/features/content/types';

import { BooleanField } from './fields/BooleanField';
import { ComponentField } from './fields/ComponentField';
import { JsonField } from './fields/JsonField';
import { MediaField } from './fields/MediaField';
import { NumberField } from './fields/NumberField';
import { RepeatableField } from './fields/RepeatableField';
import { RichTextField } from './fields/RichTextField';
import { TextField } from './fields/TextField';
import { UnsupportedField } from './fields/UnsupportedField';

export interface SchemaFieldProps {
  field: FieldDefinition;
  /** The form value path of this field (`title`, `seo.metaTitle`, `gallery.0.caption`). */
  name: string;
  /** Inside a component or a repeatable entry, not at the top level of the form. */
  nested?: boolean;
  /** Layout classes for the field's wrapper, such as its grid span. */
  className?: string;
}

/** Renders the control for one schema field, chosen by its kind. */
export const SchemaField: React.FC<SchemaFieldProps> = ({
  field,
  name,
  nested = false,
  className,
}) => {
  const label = fieldLabel(field);
  switch (fieldKind(field)) {
    case 'text':
      return <TextField label={label} name={name} className={className} />;
    case 'richtext':
      return <RichTextField label={label} name={name} className={className} />;
    case 'number':
      return <NumberField field={field} label={label} name={name} className={className} />;
    case 'boolean':
      return <BooleanField label={label} name={name} className={className} />;
    case 'json':
      return <JsonField field={field} label={label} name={name} className={className} />;
    case 'component':
      return (
        <ComponentField
          field={field}
          label={label}
          name={name}
          nested={nested}
          className={className}
        />
      );
    case 'media':
      return <MediaField label={label} name={name} className={className} />;
    case 'repeatable':
      return <RepeatableField field={field} label={label} name={name} className={className} />;
    default:
      // Unknown types: a read-only preview whose value is sent back unchanged.
      return <UnsupportedField label={label} name={name} type={field.type} className={className} />;
  }
};
SchemaField.displayName = 'SchemaField';
