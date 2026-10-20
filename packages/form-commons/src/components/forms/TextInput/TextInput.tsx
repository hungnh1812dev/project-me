import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useFormContext,
  useFormState,
} from 'react-hook-form';

import { Field } from '@/components/forms/Field';
import { Input } from '@/components/ui/input';

type NativeInputProps = Omit<
  React.ComponentProps<'input'>,
  | 'name'
  | 'id'
  | 'ref'
  | 'required'
  | 'defaultValue'
  | 'aria-invalid'
  | 'aria-describedby'
  | 'aria-required'
>;

export interface TextInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends NativeInputProps {
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
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'TextInput must be rendered inside a react-hook-form <FormProvider>.',
    );
  }

  const formState = useFormState({ control: form.control, name });
  const { error } = form.getFieldState(name, formState);
  const registration = form.register(name, rules);
  const isRequired = required ?? Boolean(rules?.required);

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
