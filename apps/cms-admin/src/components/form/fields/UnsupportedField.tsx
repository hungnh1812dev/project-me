import { useFormContext } from 'react-hook-form';

import { Field } from '@/components/form/Field';
import { Textarea } from '@/components/ui/textarea';

export interface UnsupportedFieldProps {
  label: string;
  name: string;
  /** The field type the form can't edit. */
  type: string;
  className?: string;
}

/**
 * A field the form can't edit (a type the client doesn't know): a read-only JSON preview. The value
 * is never registered or changed, so the save sends it back as it came.
 */
export const UnsupportedField: React.FC<UnsupportedFieldProps> = ({
  label,
  name,
  type,
  className,
}) => {
  const { getValues } = useFormContext();
  const value: unknown = getValues(name);
  return (
    <Field label={label} description={`Unsupported field type "${type}"`} className={className}>
      <Textarea
        readOnly
        rows={4}
        value={value === undefined ? '' : JSON.stringify(value, null, 2)}
        className="font-mono text-muted-foreground"
      />
    </Field>
  );
};
UnsupportedField.displayName = 'UnsupportedField';
