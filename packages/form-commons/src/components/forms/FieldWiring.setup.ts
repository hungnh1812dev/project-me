import * as React from 'react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormReturn,
  useFormContext,
  useFormState,
} from 'react-hook-form';

import { FIELD_ID_SUFFIX } from '@/constants/Field.constants';

/** Props of a native control that the field wiring sets itself. */
type WiredNativeProps =
  | 'name'
  | 'id'
  | 'ref'
  | 'required'
  | 'defaultValue'
  | 'aria-invalid'
  | 'aria-describedby'
  | 'aria-required';

export type NativeFieldProps<TElement extends 'input' | 'textarea' | 'select'> =
  Omit<React.ComponentProps<TElement>, WiredNativeProps>;

export function useRequiredFormContext<
  TFieldValues extends FieldValues,
>(): UseFormReturn<TFieldValues> {
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'Form inputs must be rendered inside a react-hook-form <FormProvider>.',
    );
  }
  return form;
}

interface FieldIdState {
  hasDescription: boolean;
  hasError: boolean;
}

/** Ids that link a control to its helper text and error through aria-describedby. */
export function useFieldIds(
  id: string | undefined,
  { hasDescription, hasError }: FieldIdState,
) {
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-${FIELD_ID_SUFFIX.DESCRIPTION}`;
  const errorId = `${controlId}-${FIELD_ID_SUFFIX.ERROR}`;
  const describedBy =
    [hasDescription && descriptionId, hasError && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return { controlId, descriptionId, errorId, describedBy };
}

/** RHF registration, error state and the required flag for a native control. */
export function useRegisteredField<TFieldValues extends FieldValues>(
  name: FieldPath<TFieldValues>,
  rules: RegisterOptions<TFieldValues, FieldPath<TFieldValues>> | undefined,
  required: boolean | undefined,
) {
  const form = useRequiredFormContext<TFieldValues>();
  const formState = useFormState({ control: form.control, name });
  const { error } = form.getFieldState(name, formState);
  const registration = form.register(name, rules);
  const isRequired = required ?? Boolean(rules?.required);

  return { registration, error, isRequired };
}
