import type { FieldValues } from 'react-hook-form';

import {
  TextAreaInput,
  type TextAreaInputProps,
} from '@/components/forms/TextAreaInput';
import { cn } from 'cn';

export interface JsonInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends TextAreaInputProps<TFieldValues> {
  /** Error shown when the text is not valid JSON. */
  invalidMessage: string;
}

/** Whether `text` parses as JSON. Blank text counts as "no value". */
export function isValidJsonText(text: string): boolean {
  if (text.trim() === '') return true;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON editor (a monospace textarea). The form value is the raw text; blank
 * means "no value". Invalid JSON is reported on blur / submit.
 */
function JsonInput<TFieldValues extends FieldValues = FieldValues>({
  invalidMessage,
  rules,
  className,
  ...props
}: JsonInputProps<TFieldValues>) {
  return (
    <TextAreaInput<TFieldValues>
      {...props}
      spellCheck={false}
      autoComplete="off"
      className={cn('font-mono', className)}
      rules={{
        ...rules,
        validate: (value, formValues) => {
          if (typeof value === 'string' && !isValidJsonText(value)) {
            return invalidMessage;
          }
          const extra = rules?.validate;
          return typeof extra === 'function' ? extra(value, formValues) : true;
        },
      }}
    />
  );
}

export { JsonInput };
