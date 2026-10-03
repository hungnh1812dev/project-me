'use client';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import {
  DayButton as DayButtonPrimitive,
  DayPicker,
  type ChevronProps,
  type DayButtonProps,
} from 'react-day-picker';

import { cn } from '../lib/cn';
import { buttonVariants } from './variants';

// Vendored from shadcn/ui (Calendar on react-day-picker) and adapted: arrow components, semantic
// tokens, `cn`, and 44px day and navigation targets below `lg`. No `style` props: react-day-picker
// only sets one when given `styles`/`modifiersStyles` (not used here) or for the dropdown caption
// layout (not offered), so it renders under the CSP's `style-src 'self'`.

// react-day-picker types custom components as returning `JSX.Element`, so these are annotated
// that way instead of as `React.FC`.
const CalendarChevron = ({ className, orientation }: ChevronProps): React.JSX.Element => {
  const Icon =
    orientation === 'left'
      ? ChevronLeftIcon
      : orientation === 'right'
        ? ChevronRightIcon
        : ChevronDownIcon;
  return <Icon aria-hidden="true" className={cn('size-4', className)} />;
};
CalendarChevron.displayName = 'CalendarChevron';

const CalendarDayButton = ({
  className,
  modifiers,
  ...props
}: DayButtonProps): React.JSX.Element => (
  <DayButtonPrimitive
    data-slot="calendar-day-button"
    modifiers={modifiers}
    className={cn(
      buttonVariants({ variant: 'ghost', size: 'icon' }),
      'font-normal tabular-nums',
      modifiers.today && !modifiers.selected && 'bg-accent text-accent-foreground',
      modifiers.outside && !modifiers.selected && 'text-muted-foreground',
      modifiers.selected &&
        'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      className,
    )}
    {...props}
  />
);
CalendarDayButton.displayName = 'CalendarDayButton';

type CalendarProps = React.ComponentProps<typeof DayPicker>;

const Calendar: React.FC<CalendarProps> = ({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}) => (
  <DayPicker
    data-slot="calendar"
    showOutsideDays={showOutsideDays}
    className={cn('text-foreground w-fit text-sm', className)}
    classNames={{
      months: 'relative flex flex-col gap-4',
      month: 'flex w-full flex-col gap-2',
      nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
      button_previous: cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'aria-disabled:opacity-50',
      ),
      button_next: cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'aria-disabled:opacity-50',
      ),
      month_caption: 'flex h-11 items-center justify-center px-12 lg:h-9',
      caption_label: 'font-medium',
      month_grid: 'border-collapse',
      weekdays: 'flex',
      weekday: 'w-11 text-xs font-normal text-muted-foreground lg:w-9',
      week: 'mt-1 flex',
      day: 'p-0 text-center',
      hidden: 'invisible',
      ...classNames,
    }}
    components={{
      Chevron: CalendarChevron,
      DayButton: CalendarDayButton,
      ...components,
    }}
    {...props}
  />
);
Calendar.displayName = 'Calendar';

export { Calendar, CalendarDayButton };
