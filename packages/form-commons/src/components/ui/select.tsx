'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import type { InputProps, SelectConfig } from '../../lib/inputContract';
import { controlClasses } from './variants';

// Vendored from shadcn/ui (base-nova) and adapted: arrow components, semantic tokens and 44px
// touch targets below `lg`. The parts below are internal: callers render `Select` on the input
// contract and pass the choices as `config.options`.

const SelectValue: React.FC<SelectPrimitive.Value.Props> = ({ className, ...props }) => (
  <SelectPrimitive.Value
    data-slot="select-value"
    className={cn('data-placeholder:text-muted-foreground truncate', className)}
    {...props}
  />
);
SelectValue.displayName = 'SelectValue';

const SelectTrigger: React.FC<SelectPrimitive.Trigger.Props> = ({
  className,
  children,
  ...props
}) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    className={cn(
      controlClasses,
      'data-disabled:bg-muted flex h-11 items-center justify-between gap-2 px-3 py-2 text-left whitespace-nowrap data-disabled:cursor-not-allowed data-disabled:opacity-60 lg:h-10 [&_svg]:pointer-events-none [&_svg]:shrink-0',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon render={<ChevronDownIcon className="text-muted-foreground size-4" />} />
  </SelectPrimitive.Trigger>
);
SelectTrigger.displayName = 'SelectTrigger';

type SelectContentProps = SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >;

const SelectContent: React.FC<SelectContentProps> = ({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner
      className="isolate z-50"
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        className={cn(
          'bg-popover text-popover-foreground ring-foreground/10 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1 duration-100 outline-none',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.List>{children}</SelectPrimitive.List>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
);
SelectContent.displayName = 'SelectContent';

const SelectItem: React.FC<SelectPrimitive.Item.Props> = ({ className, children, ...props }) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      'data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 lg:min-h-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText className="flex-1 truncate">{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center justify-center">
      <CheckIcon aria-hidden="true" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);
SelectItem.displayName = 'SelectItem';

type SelectProps = InputProps<string | null, SelectConfig>;

/**
 * Controlled Base UI Select (`role="combobox"` trigger and a listbox popup). The parent owns
 * `value` (`null` while nothing is chosen) and gets the next value through `onChange`. The choices
 * come from `config.options`, and `config.placeholder` shows while `value` is `null`. Put it in a
 * `Field`: the id and `aria-*` land on the trigger, so the label names it.
 */
const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  onBlur,
  name,
  config,
  disabled,
  readOnly,
  required,
  className,
  ref,
  ...field
}) => {
  const options = config?.options ?? [];
  return (
    <SelectPrimitive.Root
      items={options}
      value={value}
      onValueChange={(next) => onChange(next as string | null)}
      name={name}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
    >
      <SelectTrigger
        ref={ref as React.Ref<HTMLButtonElement>}
        onBlur={onBlur}
        className={className}
        {...field}
      >
        <SelectValue placeholder={config?.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  );
};
Select.displayName = 'Select';

export { Select, type SelectProps };
