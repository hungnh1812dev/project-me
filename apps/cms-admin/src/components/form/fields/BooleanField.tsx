import { Controller, useFormContext } from 'react-hook-form';

import { Switch } from '@repo/ui/components/switch';

import { Field } from '@/components/form/Field';
import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';

export interface BooleanFieldProps {
  label: string;
  name: string;
  className?: string;
}

/** A `boolean` field: a `Switch` behind a react-hook-form `Controller`. A missing value is off. */
export const BooleanField: React.FC<BooleanFieldProps> = ({ label, name, className }) => {
  const { control } = useFormContext();
  const readOnly = useSchemaFormReadOnly();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field label={label} className={className}>
          <Switch
            ref={field.ref}
            name={field.name}
            checked={field.value === true}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            readOnly={readOnly}
          />
        </Field>
      )}
    />
  );
};
BooleanField.displayName = 'BooleanField';
