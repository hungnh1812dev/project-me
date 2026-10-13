'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';

import { cn } from '../lib/cn';

type CheckboxProps = CheckboxPrimitive.Root.Props;

/**
 * Base UI Checkbox (`role="checkbox"`). `indeterminate` shows a dash and sets `aria-checked="mixed"`.
 * The primary fill is always paired with a `primary-ink` border (checked or mixed), and the ::after
 * pseudo-element widens the 16px box to a 44px hit area without changing the layout.
 */
const Checkbox: React.FC<CheckboxProps> = ({ className, ...props }) => (
  <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn(
      'peer border-input group-has-[:focus-visible]/field-label:not-data-checked:border-input focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary-ink data-checked:border-primary-ink data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary-ink data-indeterminate:bg-primary data-indeterminate:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary-ink dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary dark:data-indeterminate:bg-primary relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className="text-primary-foreground grid place-content-center transition-none [&>svg]:size-3.5"
      render={(indicatorProps, state) => (
        <span {...indicatorProps}>{state.indeterminate ? <MinusIcon /> : <CheckIcon />}</span>
      )}
    />
  </CheckboxPrimitive.Root>
);
Checkbox.displayName = 'Checkbox';

export { Checkbox, type CheckboxProps };
