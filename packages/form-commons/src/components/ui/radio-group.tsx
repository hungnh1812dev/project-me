'use client';

import { useId, type ReactNode } from 'react';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';

import { cn } from '../../lib/cn';
import type { InputOption, InputProps, RadioGroupConfig } from '../../lib/inputContract';
import { Label } from './label';

type RadioGroupBaseProps = Omit<InputProps<string | null, RadioGroupConfig>, 'config'>;

/** Items from `config.options`: one radio with a text label per option. */
type RadioGroupOptionsProps = RadioGroupBaseProps & {
  config: RadioGroupConfig & { options: InputOption[] };
  children?: never;
};

/** Items from `RadioGroupItem` children, for rich items such as media cards. */
type RadioGroupItemsProps = RadioGroupBaseProps & {
  config?: Omit<RadioGroupConfig, 'options'> & { options?: never };
  children: ReactNode;
};

/** Items come from exactly one source: `config.options` or `RadioGroupItem` children. */
type RadioGroupProps = RadioGroupOptionsProps | RadioGroupItemsProps;

/**
 * Controlled Base UI RadioGroup (`role="radiogroup"`): one Tab stop, arrow keys move focus and
 * selection. The parent owns `value` (`null` while nothing is chosen) and gets the next value
 * through `onChange`. `onBlur` fires when focus leaves the group, not between its radios. Name it
 * with `aria-label` or `aria-labelledby`.
 */
const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onChange,
  onBlur,
  config,
  className,
  ref,
  children,
  ...field
}) => {
  const baseId = useId();
  const horizontal = config?.orientation === 'horizontal';
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      ref={ref as React.Ref<HTMLDivElement>}
      aria-orientation={config?.orientation}
      value={value}
      onValueChange={(next) => onChange(next)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onBlur?.();
      }}
      className={cn(horizontal ? 'flex flex-wrap gap-x-6 gap-y-3' : 'grid gap-3', className)}
      {...field}
    >
      {config?.options
        ? config.options.map((option, index) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={`${baseId}-${index}`} value={option.value} />
              <Label htmlFor={`${baseId}-${index}`}>{option.label}</Label>
            </div>
          ))
        : children}
    </RadioGroupPrimitive>
  );
};
RadioGroup.displayName = 'RadioGroup';

type RadioGroupItemProps = RadioPrimitive.Root.Props;

/**
 * Base UI Radio (`role="radio"`). The primary fill is paired with a `primary-ink` border, and the
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
