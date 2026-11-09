import * as React from 'react';
import { cn } from 'cn';

import { CONTROL_FOCUS_CLASSES, CONTROL_INVALID_CLASSES } from '@/components/ui/Control.constants';

/**
 * Native `<select>` styled like `Input`. Native keeps keyboard, mobile
 * pickers and form autofill working with no extra code.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input bg-card text-foreground rounded-control duration-fast h-9 w-full min-w-0 cursor-pointer border px-3 py-1 text-base transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        CONTROL_FOCUS_CLASSES,
        CONTROL_INVALID_CLASSES,
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
