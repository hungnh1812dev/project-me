import { useFormContext } from 'react-hook-form';

import { Field } from '@/components/form/Field';
import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface TextFieldProps {
  label: string;
  /** The form value path, such as `title` or `seo.metaTitle`. */
  name: string;
  /** A textarea instead of a one-line input. */
  multiline?: boolean;
  className?: string;
}

/** A `text` field: an `Input` registered with react-hook-form. */
export const TextField: React.FC<TextFieldProps> = ({
  label,
  name,
  multiline = false,
  className,
}) => {
  const { register } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  return (
    <Field label={label} className={className}>
      {multiline ? (
        <Textarea {...register(name)} readOnly={readOnly} />
      ) : (
        <Input {...register(name)} readOnly={readOnly} />
      )}
    </Field>
  );
};
TextField.displayName = 'TextField';
