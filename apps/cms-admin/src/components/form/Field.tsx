import { cloneElement, useId } from 'react';

import { Label } from '@repo/ui/components/label';
import { cn } from '@repo/ui/lib/cn';

/** The props `Field` sets on its control. Any input primitive in this folder accepts them. */
export interface FieldControlProps {
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
}

export interface FieldProps {
  /** Always required: every control gets a visible (or `hideLabel`) label. */
  label: React.ReactNode;
  /** Keeps the label for screen readers only. */
  hideLabel?: boolean;
  description?: React.ReactNode;
  /** Shown as an alert under the control; also marks the control invalid. */
  error?: React.ReactNode;
  required?: boolean;
  /** The control id. Defaults to the control's own id, then a generated one. */
  id?: string;
  className?: string;
  /** Exactly one control element. */
  children: React.ReactElement<FieldControlProps>;
}

const joinIds = (...ids: (string | undefined | false)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

/** Label, control, description and error, with the ids and `aria-*` attributes wired up. */
export const Field: React.FC<FieldProps> = ({
  label,
  hideLabel = false,
  description,
  error,
  required = false,
  id,
  className,
  children,
}) => {
  const generatedId = useId();
  const controlId = children.props.id ?? id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const hasDescription = description != null && description !== false;
  const hasError = error != null && error !== false && error !== '';

  const control = cloneElement(children, {
    id: controlId,
    'aria-describedby': joinIds(
      children.props['aria-describedby'],
      hasDescription && descriptionId,
      hasError && errorId,
    ),
    ...(hasError && { 'aria-invalid': true }),
    ...(required && { required: true, 'aria-required': true }),
  });

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      {/* The required mark is CSS content with empty alt text, so it stays out of the accessible name. */}
      <Label
        htmlFor={controlId}
        data-required={required || undefined}
        className={cn(
          hideLabel && 'sr-only',
          required && "after:text-destructive after:content-['*'_/_'']",
        )}
      >
        {label}
      </Label>
      {control}
      {hasDescription && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {hasError && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
Field.displayName = 'Field';
