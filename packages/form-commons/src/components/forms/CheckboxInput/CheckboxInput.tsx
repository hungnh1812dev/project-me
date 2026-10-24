import * as React from 'react';
import { cn } from 'cn';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useController,
} from 'react-hook-form';

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useFieldIds,
  useRequiredFormContext,
} from '@/components/forms/field-wiring';

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
  const form = useRequiredFormContext<TFieldValues>();
  const {
    field: { ref: attachElement, ...field },
    fieldState,
  } = useController({
    name,
    control: form.control,
    ...(rules === undefined ? {} : { rules }),
  });
  const hasDescription = description !== undefined && description !== null;
  const errorMessage = fieldState.error?.message;
  const hasError = errorMessage !== undefined && errorMessage !== '';
  const { controlId, descriptionId, errorId, describedBy } = useFieldIds(id, {
    hasDescription,
    hasError,
  });

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
