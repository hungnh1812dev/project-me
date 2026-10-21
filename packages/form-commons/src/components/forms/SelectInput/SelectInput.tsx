import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useFormContext,
  useFormState,
} from 'react-hook-form';

import { Field } from '@/components/forms/Field';
import { NativeSelect } from '@/components/ui/native-select';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

type NativeSelectProps = Omit<
  React.ComponentProps<'select'>,
  | 'name'
  | 'id'
  | 'ref'
  | 'required'
  | 'defaultValue'
  | 'children'
  | 'aria-invalid'
  | 'aria-describedby'
  | 'aria-required'
>;

export interface SelectInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends NativeSelectProps {
  name: FieldPath<TFieldValues>;
  label: React.ReactNode;
  options: readonly SelectOption[];
  /** First, empty option (value `''`), e.g. "Choose a role". */
  placeholder?: string | undefined;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  /** Marker + aria-required; implied by `rules.required`. Never native `required`. */
  required?: boolean;
  id?: string | undefined;
  fieldClassName?: string | undefined;
}

/** Native select bound to the surrounding react-hook-form `FormProvider`. */
function SelectInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  options,
  placeholder,
  description,
  rules,
  required,
  id,
  fieldClassName,
  onChange,
  onBlur,
  ...selectProps
}: SelectInputProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'SelectInput must be rendered inside a react-hook-form <FormProvider>.',
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
        <NativeSelect
          {...selectProps}
          {...control}
          name={registration.name}
          ref={registration.ref}
          disabled={registration.disabled ?? selectProps.disabled}
          onChange={(event) => {
            void registration.onChange(event);
            onChange?.(event);
          }}
          onBlur={(event) => {
            void registration.onBlur(event);
            onBlur?.(event);
          }}
        >
          {placeholder === undefined ? null : (
            <option value="">{placeholder}</option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

export { SelectInput };
