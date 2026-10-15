import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';

import { DatePicker } from '../../components/native/DatePicker';
import { Field } from '../../components/native/Field';
import { Controlled, useArgsValue } from '../Controlled';
import { DatePickerSection } from '../sections/DatePickerSection';

const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  args: {
    value: new Date(2026, 0, 15),
    onChange: fn(),
    onBlur: fn(),
    config: { locale: 'en-US', placeholder: 'Pick a date' },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'date' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Publish date, Disabled date picker, Calendar example and the Popover (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <DatePickerSection />,
};

/** The readout text for a day: `JSON.stringify` of the Date (an ISO string in UTC). */
const readoutOf = (day: Date) => JSON.stringify(day);

/**
 * One DatePicker on the contract (AC-14): `value`, `config` (`locale`, `placeholder`), `disabled`
 * and `readOnly` are Controls, picking a day updates the `value` arg, and the "Value:" readout
 * shows it as JSON. The Controls panel's date control sends a timestamp, so `render` turns it back
 * into a Date (memoised on the time, so an unchanged arg keeps the same Date).
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const raw: unknown = value;
    const time = raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : undefined;
    const day = useMemo(() => (time === undefined ? undefined : new Date(time)), [time]);
    const bind = useArgsValue(day, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Publish date">
            <DatePicker {...args} {...field} />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent(readoutOf(new Date(2026, 0, 15)));

    await userEvent.click(canvas.getByRole('button', { name: 'Publish date' }));
    // The calendar is portalled to the body, outside the canvas.
    const body = within(canvasElement.ownerDocument.body);
    const calendar = await body.findByRole('dialog', { name: 'Choose a date' });
    const day = calendar.querySelector<HTMLElement>('[data-day="2026-01-20"] button');
    await expect(day).not.toBeNull();
    await userEvent.click(day as HTMLElement);

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent(
        readoutOf(new Date(2026, 0, 20)),
      ),
    );
  },
};
