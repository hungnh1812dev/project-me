import { RHFField } from '@repo/form-commons/components/rhf/RHFField';
import { Switch } from '@repo/form-commons/components/ui/switch';

import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';

export interface BooleanFieldProps {
  label: string;
  name: string;
  className?: string;
}

/** A `boolean` field: a `Switch` bound through `RHFField`. A missing value is off. */
export const BooleanField: React.FC<BooleanFieldProps> = ({ label, name, className }) => {
  const readOnly = useSchemaFormReadOnly();
  return (
    <RHFField name={name} label={label} className={className}>
      {(field) => <Switch {...field} value={field.value === true} readOnly={readOnly} />}
    </RHFField>
  );
};
BooleanField.displayName = 'BooleanField';
