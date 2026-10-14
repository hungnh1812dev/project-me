'use client';

import {
  useController,
  type Control,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  type RefCallBack,
  type UseControllerProps,
} from 'react-hook-form';

import type { InputValueProps } from '../../lib/inputContract';
import { Field, type FieldControlProps, type FieldProps } from '../forms/Field';

/** What the `children` render prop gets: the controlled value props, typed from `name` (D-8). */
export interface RHFFieldRenderProps<
  TValues extends FieldValues = FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
> extends InputValueProps<FieldPathValue<TValues, TName>> {
  onBlur: () => void;
  name: TName;
  ref: RefCallBack;
  disabled?: boolean;
}

export interface RHFFieldProps<
  TValues extends FieldValues = FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
> extends Omit<FieldProps, 'error' | 'children'> {
  name: TName;
  /** Defaults to the control from `useFormContext()`. */
  control?: Control<TValues>;
  rules?: UseControllerProps<TValues, TName>['rules'];
  /** Renders exactly one control from the bound field, for example `(field) => <Switch {...field} />`. */
  children: (field: RHFFieldRenderProps<TValues, TName>) => React.ReactElement<FieldControlProps>;
}

/**
 * `Field` bound to react-hook-form through `useController`: the label, description, required mark and
 * `aria-*` wiring are `Field`'s, the error is `fieldState.error.message`, and `required` defaults to
 * `!!rules.required`.
 */
export const RHFField = <
  TValues extends FieldValues = FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
>({
  name,
  control,
  rules,
  required,
  children,
  ...fieldProps
}: RHFFieldProps<TValues, TName>): React.ReactElement => {
  const { field, fieldState } = useController<TValues, TName>({ name, control, rules });

  return (
    <Field
      {...fieldProps}
      error={fieldState.error?.message}
      required={required ?? Boolean(rules?.required)}
    >
      {children({
        value: field.value,
        onChange: field.onChange,
        onBlur: field.onBlur,
        name: field.name,
        ref: field.ref,
        disabled: field.disabled,
      })}
    </Field>
  );
};
RHFField.displayName = 'RHFField';
