import * as React from 'react';
import { cn } from 'cn';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useController,
  useFormContext,
} from 'react-hook-form';

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FIELD_ID_SUFFIX } from '@/constants/field.constants';

export interface CheckboxInputProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  name: FieldPath<TFieldValues>;
  /** Visible label, to the right of the box. */
  label: React.ReactNode;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

/**
 * Boolean checkbox bound to the surrounding react-hook-form `FormProvider`.
 * The box sits left of its label; description and error go below the label.
 */
function CheckboxInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  rules,
  disabled,
  id,
  className,
}: CheckboxInputProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'CheckboxInput must be rendered inside a react-hook-form <FormProvider>.',
    );
  }
  const {
    field: { ref: attachElement, ...field },
    fieldState,
  } = useController({
    name,
    control: form.control,
    ...(rules === undefined ? {} : { rules }),
  });
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-${FIELD_ID_SUFFIX.DESCRIPTION}`;
  const errorId = `${controlId}-${FIELD_ID_SUFFIX.ERROR}`;
  const hasDescription = description !== undefined && description !== null;
  const errorMessage = fieldState.error?.message;
  const hasError = errorMessage !== undefined && errorMessage !== '';
  const describedBy =
    [hasDescription && descriptionId, hasError && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div
      data-slot="checkbox-field"
      data-invalid={hasError || undefined}
      className={cn('flex items-start gap-2', className)}
    >
      <Checkbox
        id={controlId}
        name={field.name}
        ref={attachElement}
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked === true)}
        onBlur={field.onBlur}
        disabled={disabled ?? field.disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className="mt-0.5"
      />
      <div className="grid gap-1">
        <Label htmlFor={controlId} className="leading-5">
          {label}
        </Label>
        {hasDescription && (
          <p
            id={descriptionId}
            data-slot="field-description"
            className="m-0 text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}
        {hasError && (
          <p
            id={errorId}
            data-slot="field-error"
            className="m-0 text-sm text-destructive-strong"
          >
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export { CheckboxInput };
