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
import { Switch } from '@/components/ui/switch';
import { FIELD_ID_SUFFIX } from '@/constants/field.constants';

export interface SwitchInputProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  name: FieldPath<TFieldValues>;
  /** Visible label, to the right of the switch. */
  label: React.ReactNode;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

/** Boolean on/off switch bound to the surrounding `FormProvider` (role `switch`). */
function SwitchInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  rules,
  disabled,
  id,
  className,
}: SwitchInputProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  if (!form) {
    throw new Error(
      'SwitchInput must be rendered inside a react-hook-form <FormProvider>.',
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
      data-slot="switch-field"
      data-invalid={hasError || undefined}
      className={cn('flex items-start gap-3', className)}
    >
      <Switch
        id={controlId}
        name={field.name}
        ref={attachElement}
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked)}
        onBlur={field.onBlur}
        disabled={disabled ?? field.disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
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

export { SwitchInput };
