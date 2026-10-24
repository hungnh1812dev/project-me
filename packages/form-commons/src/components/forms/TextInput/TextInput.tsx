import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';

import { Field } from '@/components/forms/Field';
import {
  type NativeFieldProps,
  useRegisteredField,
} from '@/components/forms/field-wiring';
import { Input } from '@/components/ui/input';

export interface TextInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends NativeFieldProps<'input'> {
  name: FieldPath<TFieldValues>;
  label: React.ReactNode;
  description?: React.ReactNode | undefined;
  /** RHF validation rules (required, minLength, pattern, validate...). */
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  /**
   * Shows the required marker and sets aria-required. Implied by
   * `rules.required`; set it yourself when a Zod schema makes the field required.
   * Never sets the native `required` attribute, so the browser's own
   * validation bubble does not compete with the inline error.
   */
  required?: boolean;
  id?: string | undefined;
  /** Class for the wrapping field (label + control + helper text). */
  fieldClassName?: string | undefined;
}

/**
 * Text input bound to the surrounding react-hook-form `FormProvider`.
 * Errors come from RHF state, so native `rules` and a Zod resolver both work.
 */
function TextInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  rules,
  required,
  id,
  fieldClassName,
  onChange,
  onBlur,
  ...inputProps
}: TextInputProps<TFieldValues>) {
  const { registration, error, isRequired } = useRegisteredField<TFieldValues>(
    name,
    rules,
    required,
  );

  return (
    <Field
      label={label}
      description={description}
      error={error?.message}
      required={isRequired}
      className={fieldClassName}
      id={id}
    >
      {(control) => (
        <Input
          {...inputProps}
          {...control}
          name={registration.name}
          ref={registration.ref}
          disabled={registration.disabled ?? inputProps.disabled}
          onChange={(event) => {
            void registration.onChange(event);
            onChange?.(event);
          }}
          onBlur={(event) => {
            void registration.onBlur(event);
            onBlur?.(event);
          }}
        />
      )}
    </Field>
  );
}

export { TextInput };
