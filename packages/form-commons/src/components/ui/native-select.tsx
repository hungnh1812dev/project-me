import * as React from 'react';
import { cn } from 'cn';

/**
 * Native `<select>` styled like `Input`. Native keeps keyboard, mobile
 * pickers and form autofill working with no extra code.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-card px-3 py-1 text-base text-foreground transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
