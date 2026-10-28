import type { FieldValues } from 'react-hook-form';

import { TextInput, type TextInputProps } from '@/components/forms/text-input';

const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export type NumberMode = 'integer' | 'decimal';

export interface NumberInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<TextInputProps<TFieldValues>, 'type' | 'inputMode'> {
  /** `integer` accepts digits only; `decimal` also one fractional part. */
  mode: NumberMode;
  /** Error shown when the text is not a number of the chosen mode. */
  invalidMessage: string;
}

/**
 * Number field whose form value stays the typed **string**, so values past
 * 2^53 (bigint ids, long decimals) are never rounded. Convert at the edge
 * (`BigInt(value)`, `Number(value)`) when the API needs it. Empty is valid
 * unless `rules.required` says otherwise.
 */
function NumberInput<TFieldValues extends FieldValues = FieldValues>({
  mode,
  invalidMessage,
  rules,
  ...props
}: NumberInputProps<TFieldValues>) {
  const pattern = mode === 'integer' ? INTEGER_PATTERN : DECIMAL_PATTERN;
  return (
    <TextInput<TFieldValues>
      {...props}
      type="text"
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      autoComplete="off"
      rules={
        {
          ...rules,
          pattern: { value: pattern, message: invalidMessage },
        } as NonNullable<typeof rules>
      }
    />
  );
}

export { NumberInput };
