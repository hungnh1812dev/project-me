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
import { Textarea } from '@/components/ui/textarea';

export interface TextAreaInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends NativeFieldProps<'textarea'> {
  name: FieldPath<TFieldValues>;
  label: React.ReactNode;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  /** Marker + aria-required; implied by `rules.required`. Never native `required`. */
  required?: boolean;
  id?: string | undefined;
  fieldClassName?: string | undefined;
}

/** Multi-line text bound to the surrounding react-hook-form `FormProvider`. */
function TextAreaInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  rules,
  required,
  id,
  fieldClassName,
  onChange,
  onBlur,
  ...textareaProps
}: TextAreaInputProps<TFieldValues>) {
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
        <Textarea
          {...textareaProps}
          {...control}
          name={registration.name}
          ref={registration.ref}
          disabled={registration.disabled ?? textareaProps.disabled}
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

export { TextAreaInput };
