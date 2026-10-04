import { useFormContext } from 'react-hook-form';

import { Input } from '@repo/ui/components/input';
import { Field } from '@repo/ui/form/Field';

import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';

export interface TextFieldProps {
  label: string;
  /** The form value path, such as `title` or `seo.metaTitle`. */
  name: string;
  className?: string;
}

/** A `text` field: an `Input` registered with react-hook-form. */
export const TextField: React.FC<TextFieldProps> = ({ label, name, className }) => {
  const { register } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  return (
    <Field label={label} className={className}>
      <Input {...register(name)} readOnly={readOnly} />
    </Field>
  );
};
TextField.displayName = 'TextField';
