import { useId, useRef, useState } from 'react';
import { CalendarIcon, XIcon } from 'lucide-react';

import type { FieldControlProps } from '@/components/form/Field';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { controlClasses } from '@/components/ui/variants';
import { cn } from '@/utils/cn';

export interface DatePickerProps extends FieldControlProps {
  /** A day (local midnight), or `undefined` for no date. */
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  /** The BCP 47 locale for the shown date. Defaults to the browser's. */
  locale?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const FOCUS_ORDER = [
  '[data-selected] button',
  '[data-today]:not([data-outside]) button',
  '[data-day]:not([data-outside]) button',
];

/** The day button to focus when the calendar opens: the selected day, else today, else the first day. */
const dayToFocus = (popup: HTMLElement | null): HTMLElement | null => {
  for (const selector of FOCUS_ORDER) {
    const button = popup?.querySelector<HTMLElement>(selector);
    if (button) return button;
  }
  return null;
};

/**
 * A date input for a `Field`: a trigger button showing the day (`Intl.DateTimeFormat`) that opens
 * the Calendar in a Popover, with focus on the selected day (or today). Picking a day closes it;
 * Escape closes it without a change. Focus returns to the trigger. Clear sets `undefined`.
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  locale,
  placeholder = 'Pick a date',
  disabled = false,
  className,
  id,
  required,
  ...aria
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const text = value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
    : placeholder;

  return (
    <div data-slot="date-picker" className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={triggerRef}
          id={id}
          disabled={disabled}
          aria-required={aria['aria-required'] ?? (required || undefined)}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={aria['aria-describedby']}
          className={cn(
            controlClasses,
            'flex h-11 items-center gap-2 px-3 text-left lg:h-10',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{text}</span>
        </PopoverTrigger>
        <PopoverContent
          ref={popupRef}
          aria-labelledby={titleId}
          className="w-auto p-3"
          initialFocus={() => dayToFocus(popupRef.current) ?? true}
        >
          <PopoverTitle id={titleId} className="sr-only">
            Choose a date
          </PopoverTitle>
          <Calendar
            mode="single"
            required
            selected={value}
            defaultMonth={value}
            onSelect={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => {
            onChange(undefined);
            triggerRef.current?.focus();
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
};
DatePicker.displayName = 'DatePicker';
