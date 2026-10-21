import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useFormContext,
  useFormState,
} from 'react-hook-form';

import { Field } from '@/components/forms/Field';
import { Textarea } from '@/components/ui/textarea';

type NativeTextareaProps = Omit<
  React.ComponentProps<'textarea'>,
  | 'name'
  | 'id'
  | 'ref'
  | 'required'
  | 'defaultValue'
  | 'aria-invalid'
  | 'aria-describedby'
  | 'aria-required'
>;

export interface TextAreaInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends NativeTextareaProps {
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
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'TextAreaInput must be rendered inside a react-hook-form <FormProvider>.',
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
