import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';

import { Field } from '@/components/forms/field';
import {
  type NativeFieldProps,
  useRegisteredField,
} from '@/components/forms/FieldWiring.setup';
import { NativeSelect } from '@/components/ui/NativeSelect';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

export interface SelectInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<NativeFieldProps<'select'>, 'children'> {
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
