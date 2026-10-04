'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';

import { cn } from '../lib/cn';

type RadioGroupProps = RadioGroupPrimitive.Props;

/**
 * Base UI RadioGroup (`role="radiogroup"`): one Tab stop, arrow keys move focus and selection.
 * Name it with `aria-label` or `aria-labelledby`.
 */
const RadioGroup: React.FC<RadioGroupProps> = ({ className, ...props }) => (
  <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />
);
RadioGroup.displayName = 'RadioGroup';

type RadioGroupItemProps = RadioPrimitive.Root.Props;

/**
 * Base UI Radio (`role="radio"`). The gold fill is paired with a `primary-ink` border, and the
 * ::after pseudo-element widens the 16px circle to a 44px hit area without changing the layout.
 */
const RadioGroupItem: React.FC<RadioGroupItemProps> = ({ className, ...props }) => (
  <RadioPrimitive.Root
    data-slot="radio-group-item"
    className={cn(
      'peer border-input focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:border-primary-ink data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary relative flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border transition-colors after:absolute after:-inset-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <RadioPrimitive.Indicator
      data-slot="radio-group-indicator"
      className="flex size-4 items-center justify-center"
    >
      <span className="bg-primary-foreground size-2 rounded-full" />
    </RadioPrimitive.Indicator>
  </RadioPrimitive.Root>
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem, type RadioGroupItemProps, type RadioGroupProps };
