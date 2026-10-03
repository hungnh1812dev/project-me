import { Controller, useFormContext } from 'react-hook-form';

import { Field } from '@/components/form/Field';
import { JsonInput } from '@/components/form/JsonInput';
import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { rulesFor } from '@/features/content/schemaForm';
import type { FieldDefinition } from '@/features/content/types';

export interface JsonFieldProps {
  field: FieldDefinition;
  label: string;
  name: string;
  className?: string;
}

/**
 * A `json` field: a `JsonInput` behind a `Controller`, holding text. Invalid text stays visible
 * and blocks the save with its parse error (`rulesFor`).
 */
export const JsonField: React.FC<JsonFieldProps> = ({ field, label, name, className }) => {
  const { control } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  return (
    <Controller
      control={control}
      name={name}
      rules={rulesFor(field)}
      render={({ field: control, fieldState }) => (
        <Field label={label} error={fieldState.error?.message} className={className}>
          <JsonInput
            ref={control.ref}
            name={control.name}
            value={typeof control.value === 'string' ? control.value : ''}
            onChange={control.onChange}
            onBlur={control.onBlur}
            readOnly={readOnly}
            expect="any"
            rows={6}
          />
        </Field>
      )}
    />
  );
};
JsonField.displayName = 'JsonField';
