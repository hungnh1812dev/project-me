import { RHFField } from '@repo/form-commons/components/rhf/RHFField';
import { Input } from '@repo/form-commons/components/ui/input';

import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';

export interface TextFieldProps {
  label: string;
  /** The form value path, such as `title` or `seo.metaTitle`. */
  name: string;
  className?: string;
}

/** A `text` field: an `Input` bound through `RHFField`. A missing value is empty text. */
export const TextField: React.FC<TextFieldProps> = ({ label, name, className }) => {
  const readOnly = useSchemaFormReadOnly();
  return (
    <RHFField name={name} label={label} className={className}>
      {(field) => (
        <Input
          {...field}
          value={typeof field.value === 'string' ? field.value : ''}
          readOnly={readOnly}
        />
      )}
    </RHFField>
  );
};
TextField.displayName = 'TextField';
