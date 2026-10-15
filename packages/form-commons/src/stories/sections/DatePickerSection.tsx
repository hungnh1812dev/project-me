import { useState } from 'react';

import { DatePicker } from '../../components/native/DatePicker';
import { Field } from '../../components/native/Field';
import { Button } from '../../components/ui/button';
import { Calendar } from '../../components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Section } from './Section';

/** A controlled DatePicker in a Field, as the filter panel wires it. */
const DatePickerDemo: React.FC = () => {
  const [value, setValue] = useState<Date | undefined>();
  return (
    <Field label="Publish date" description="Opens a calendar; Escape closes it.">
      <DatePicker value={value} onChange={setValue} />
    </Field>
  );
};
DatePickerDemo.displayName = 'DatePickerDemo';

/** The bare Calendar primitive. */
const CalendarDemo: React.FC = () => {
  const [value, setValue] = useState<Date | undefined>();
  return (
    <Calendar
      mode="single"
      selected={value}
      onSelect={setValue}
      aria-label="Calendar example"
      className="rounded-lg border p-3"
    />
  );
};
CalendarDemo.displayName = 'CalendarDemo';

/** The UI kit's Date picker section: Publish date, disabled, Calendar example, Popover (AC-9). */
export const DatePickerSection: React.FC = () => (
  <Section title="Date picker">
    <DatePickerDemo />
    <Field label="Disabled date picker">
      <DatePicker value={new Date(2026, 0, 15)} onChange={() => undefined} disabled />
    </Field>
    <CalendarDemo />
    <div className="flex items-start">
      <Popover>
        <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Popover</PopoverTitle>
            <PopoverDescription>Escape or an outside click closes it.</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </div>
  </Section>
);
DatePickerSection.displayName = 'DatePickerSection';
