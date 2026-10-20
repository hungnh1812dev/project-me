import * as React from 'react';
import { cn } from 'cn';

import { Label } from '@/components/ui/label';
import { FIELD_ID_SUFFIX } from '@/constants/field.constants';

/** Props a control must spread to be linked to its label and helper text. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
}

export interface FieldProps {
  /** Visible label, always above the control. */
  label: React.ReactNode;
  /** Helper text shown under the control. */
  description?: React.ReactNode | undefined;
  /** Error text; when set the control is marked invalid. */
  error?: string | undefined;
  /** Shows the required marker and sets aria-required. */
  required?: boolean | undefined;
  /** Control id. Generated when omitted. */
  id?: string | undefined;
  className?: string | undefined;
  children: (control: FieldControlProps) => React.ReactNode;
}

/**
 * Lays out label, control, description and error, and wires the a11y
 * attributes between them. The control is rendered by `children`.
 */
function Field({
  label,
  description,
  error,
  required = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-${FIELD_ID_SUFFIX.DESCRIPTION}`;
  const errorId = `${controlId}-${FIELD_ID_SUFFIX.ERROR}`;
  const hasDescription = description !== undefined && description !== null;
  const hasError = error !== undefined && error !== '';

  const describedBy =
    [hasDescription && descriptionId, hasError && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div
      data-slot="field"
      data-invalid={hasError || undefined}
      className={cn('grid gap-1.5', className)}
    >
      <Label htmlFor={controlId}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive-strong">
            *
          </span>
        )}
      </Label>
      {children({
        id: controlId,
        'aria-invalid': hasError || undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
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
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };
