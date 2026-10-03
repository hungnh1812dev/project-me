import { useFormContext } from 'react-hook-form';

import { Input } from '@repo/ui/components/input';
import { Field } from '@repo/ui/form/Field';

import { useFieldError, useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { rulesFor } from '@/features/content/schemaForm';
import type { FieldDefinition } from '@/features/content/types';

export interface NumberFieldProps {
  field: FieldDefinition;
  label: string;
  name: string;
  className?: string;
}

/**
 * A `number` field. The input keeps its text (a `type="number"` input would empty text that isn't
 * a number, so "Enter a number." could never show); `inputMode="decimal"` still brings up the
 * numeric keyboard. Empty text saves as `null`.
 */
export const NumberField: React.FC<NumberFieldProps> = ({ field, label, name, className }) => {
  const { register } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  const error = useFieldError(name);
  return (
    <Field label={label} error={error} className={className}>
      <Input
        {...register(name, rulesFor(field))}
        inputMode="decimal"
        autoComplete="off"
        readOnly={readOnly}
        className="font-mono tabular-nums"
      />
    </Field>
  );
};
NumberField.displayName = 'NumberField';
