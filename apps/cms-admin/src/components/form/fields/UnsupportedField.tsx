import { useFormContext } from 'react-hook-form';

import { Field } from '@repo/form-commons/components/forms/Field';
import { Textarea } from '@repo/form-commons/components/ui/textarea';

export interface UnsupportedFieldProps {
  label: string;
  name: string;
  /** The field type the form can't edit. */
  type: string;
  className?: string;
}

/** The preview is read-only, so there is no edit to keep. */
const ignoreEdit = () => {};

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
        value={value === undefined ? '' : JSON.stringify(value, null, 2)}
        onChange={ignoreEdit}
        config={{ rows: 4 }}
        className="font-mono text-muted-foreground"
      />
    </Field>
  );
};
UnsupportedField.displayName = 'UnsupportedField';
