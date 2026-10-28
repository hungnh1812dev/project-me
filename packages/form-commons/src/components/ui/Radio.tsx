import * as React from 'react';
import { cn } from 'cn';
import { CONTROL_FOCUS_RING_ONLY_CLASSES } from '@/components/ui/Control.constants';

/**
 * Styled native radio input, on purpose not a Radix RadioGroup: it keeps
 * `name` grouping and inherits `<fieldset disabled>`, which callers rely on.
 */
function Radio({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="radio"
      data-slot="radio"
      className={cn(
        'size-4 shrink-0 cursor-pointer accent-primary outline-none',
        CONTROL_FOCUS_RING_ONLY_CLASSES,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Radio };
