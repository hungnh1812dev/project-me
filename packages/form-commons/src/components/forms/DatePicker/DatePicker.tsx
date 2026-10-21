import type { FieldValues } from 'react-hook-form';

import { TextInput, type TextInputProps } from '@/components/forms/TextInput';

export type DatePickerProps<TFieldValues extends FieldValues = FieldValues> =
  Omit<TextInputProps<TFieldValues>, 'type'>;

/** Form value is the native `YYYY-MM-DD` string; empty string when cleared. */
function DatePicker<TFieldValues extends FieldValues = FieldValues>(
  props: DatePickerProps<TFieldValues>,
) {
  return <TextInput<TFieldValues> {...props} type="date" />;
}

/**
 * Form value is the native local `YYYY-MM-DDTHH:mm` string (no time zone).
 * The caller converts to and from an absolute instant.
 */
function DateTimePicker<TFieldValues extends FieldValues = FieldValues>(
  props: DatePickerProps<TFieldValues>,
) {
  return <TextInput<TFieldValues> {...props} type="datetime-local" />;
}

export { DatePicker, DateTimePicker };
