import { RHFField } from '@repo/form-commons/components/rhf/RHFField';
import { Input } from '@repo/form-commons/components/ui/input';

import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { rulesFor } from '@/features/content/schemaForm';
import type { FieldDefinition } from '@/features/content/types';

export interface NumberFieldProps {
  field: FieldDefinition;
  label: string;
  name: string;
  className?: string;
}

/**
 * A `number` field bound through `RHFField`, with "Enter a number." from `rules`. The input keeps
 * its text (a `type="number"` input would empty text that isn't a number, so "Enter a number."
 * could never show); `inputMode="decimal"` still brings up the numeric keyboard. Empty text saves
 * as `null`.
 */
export const NumberField: React.FC<NumberFieldProps> = ({ field, label, name, className }) => {
  const readOnly = useSchemaFormReadOnly();
  return (
    <RHFField name={name} label={label} rules={rulesFor(field)} className={className}>
      {(bound) => (
        <Input
          {...bound}
          value={typeof bound.value === 'string' ? bound.value : ''}
          config={{ inputMode: 'decimal', autoComplete: 'off' }}
          readOnly={readOnly}
          className="font-mono tabular-nums"
        />
      )}
    </RHFField>
  );
};
NumberField.displayName = 'NumberField';
