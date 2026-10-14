'use client';

import {
  useController,
  type Control,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  type RefCallBack,
  type UseControllerProps,
  type Validate,
} from 'react-hook-form';

import type { InputValueProps } from '../../lib/inputContract';
import { schemaRule, type StandardSchemaV1 } from '../../lib/standardSchema';
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
  /** Native react-hook-form rules: `required`, `min`, `maxLength`, `pattern`, `validate`, ... */
  rules?: UseControllerProps<TValues, TName>['rules'];
  /**
   * A Standard Schema (zod, valibot, ArkType, ...) for this field's value. It runs after `rules`
   * (as a `validate` named `schema`), and its first issue's message is the error. It doesn't set
   * the required mark: pass `required` when the schema refuses an empty value.
   */
  schema?: StandardSchemaV1;
  /** Renders exactly one control from the bound field, for example `(field) => <Switch {...field} />`. */
  children: (field: RHFFieldRenderProps<TValues, TName>) => React.ReactElement<FieldControlProps>;
}

type Rules<TValues extends FieldValues, TName extends FieldPath<TValues>> = NonNullable<
  UseControllerProps<TValues, TName>['rules']
>;
type FieldValidate<TValues extends FieldValues, TName extends FieldPath<TValues>> = Validate<
  FieldPathValue<TValues, TName>,
  TValues
>;

/** `rules` with `schema` added to `validate`, next to a `validate` function or map it already has. */
function withSchema<TValues extends FieldValues, TName extends FieldPath<TValues>>(
  rules: RHFFieldProps<TValues, TName>['rules'],
  schema: StandardSchemaV1,
): Rules<TValues, TName> {
  const fromSchema = schemaRule(schema) as FieldValidate<TValues, TName>;
  const own = rules?.validate;
  const validate =
    own === undefined
      ? { schema: fromSchema }
      : typeof own === 'function'
        ? { rule: own, schema: fromSchema }
        : { ...own, schema: fromSchema };
  return { ...rules, validate } as Rules<TValues, TName>;
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
  schema,
  required,
  children,
  ...fieldProps
}: RHFFieldProps<TValues, TName>): React.ReactElement => {
  const { field, fieldState } = useController<TValues, TName>({
    name,
    control,
    rules: schema ? withSchema(rules, schema) : rules,
  });

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
