import * as React from 'react';
import { cn } from 'cn';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';

import {
  CONTROL_FOCUS_CLASSES,
  CONTROL_INVALID_CLASSES,
} from '@/components/ui/control.constants';

/**
 * shadcn checkbox (Radix) restyled to semantic tokens. `checked` may be
 * `'indeterminate'` for a partly selected group. Icons are inline so the
 * package needs no icon library.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 cursor-pointer rounded-sm border border-input bg-card text-primary-foreground transition-[color,box-shadow] outline-none',
        CONTROL_FOCUS_CLASSES,
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        CONTROL_INVALID_CLASSES,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group flex items-center justify-center text-current"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3.5"
        >
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            className="group-data-[state=indeterminate]:hidden"
          />
          <path
            d="M4 8h8"
            className="hidden group-data-[state=indeterminate]:block"
          />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
