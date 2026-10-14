import { JsonInput } from '@repo/form-commons/components/forms/JsonInput';
import { RHFField } from '@repo/form-commons/components/rhf/RHFField';

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
 * A `json` field: a `JsonInput` bound through `RHFField`, holding text. Invalid text stays visible
 * and blocks the save with its parse error (`rules.validate` from `parseJson`, via `rulesFor`).
 * The label names the in-shadow editor, and the ref's `focus()` moves focus into it (an invalid
 * save focuses it).
 */
export const JsonField: React.FC<JsonFieldProps> = ({ field, label, name, className }) => {
  const readOnly = useSchemaFormReadOnly();
  return (
    <RHFField name={name} label={label} rules={rulesFor(field)} className={className}>
      {(bound) => (
        <JsonInput
          {...bound}
          value={typeof bound.value === 'string' ? bound.value : ''}
          readOnly={readOnly}
          config={{ label, expect: 'any', rows: 6 }}
        />
      )}
    </RHFField>
  );
};
JsonField.displayName = 'JsonField';
