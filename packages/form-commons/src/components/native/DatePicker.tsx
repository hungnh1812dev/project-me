'use client';

import { useCallback, useId, useRef, useState, type Ref } from 'react';
import { CalendarIcon, XIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import type { DatePickerConfig, InputProps } from '../../lib/inputContract';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger } from '../ui/popover';
import { controlClasses } from '../ui/variants';

/**
 * `value` is a day (local midnight) or `undefined` for no date. `config.locale` is the BCP 47
 * locale for the shown date (defaults to the browser's); `config.placeholder` shows while empty.
 */
export type DatePickerProps = InputProps<Date | undefined, DatePickerConfig>;

const FOCUS_ORDER = [
  '[data-selected] button',
  '[data-today]:not([data-outside]) button',
  '[data-day]:not([data-outside]) button',
];

/** The day as `YYYY-MM-DD` in local time, for the hidden form input. */
const toDayString = (day: Date): string =>
  [
    String(day.getFullYear()).padStart(4, '0'),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-');

const assignRef = <T,>(ref: Ref<T> | undefined, node: T | null) => {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
};

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
 * Escape or Close closes it without a change. While open, Tab stays inside the calendar. Focus
 * returns to the trigger. Clear sets `undefined`. Controlled: the parent owns `value` and gets the
 * picked day through `onChange`. `onBlur` fires when focus leaves the trigger, the Clear button and
 * the calendar. `readOnly` shows the day but neither opens nor clears. `name` submits the day as
 * `YYYY-MM-DD` through a hidden input.
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  onBlur,
  name,
  config,
  disabled = false,
  readOnly = false,
  className,
  ref,
  required,
  'aria-required': ariaRequired,
  ...field
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const text = value
    ? new Intl.DateTimeFormat(config?.locale, { dateStyle: 'medium' }).format(value)
    : (config?.placeholder ?? 'Pick a date');

  const setTrigger = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  /** Blur only when focus goes outside the trigger, the Clear button and the calendar popup. */
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && (rootRef.current?.contains(next) || popupRef.current?.contains(next))) return;
    if (open) return;
    onBlur?.();
  };

  return (
    <div
      ref={rootRef}
      data-slot="date-picker"
      className={cn('flex min-w-0 items-center gap-1', className)}
      onBlur={handleBlur}
    >
      {/* `trap-focus` keeps Tab inside the calendar; Base UI needs a Close inside to allow it. */}
      <Popover open={open} onOpenChange={(next) => setOpen(next && !readOnly)} modal="trap-focus">
        <PopoverTrigger
          ref={setTrigger}
          disabled={disabled}
          aria-required={ariaRequired ?? (required || undefined)}
          data-readonly={readOnly || undefined}
          {...field}
          className={cn(
            controlClasses,
            'flex h-11 items-center gap-2 px-3 text-left lg:h-10',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
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
          <div className="flex justify-end">
            <PopoverClose render={<Button variant="ghost" size="sm" />}>Close</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
      {name !== undefined && (
        <input type="hidden" name={name} value={value ? toDayString(value) : ''} />
      )}
      {value && !disabled && !readOnly && (
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
