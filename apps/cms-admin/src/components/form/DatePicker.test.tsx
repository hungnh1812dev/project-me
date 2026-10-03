import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DatePicker, type DatePickerProps } from './DatePicker';
import { Field } from './Field';

/** A Field wired to DatePicker the way the filter panel uses it. */
const Harness: React.FC<
  Partial<DatePickerProps> & { initial?: Date; spy?: (d?: Date) => void }
> = ({ initial, spy, ...props }) => {
  const [value, setValue] = useState<Date | undefined>(initial);
  return (
    <Field label="Created" description="Pick a day">
      <DatePicker
        value={value}
        onChange={(next) => {
          spy?.(next);
          setValue(next);
        }}
        locale="en-US"
        {...props}
      />
    </Field>
  );
};

const dayCell = (iso: string) => document.querySelector(`[data-day="${iso}"]`) as HTMLElement;

describe('DatePicker', () => {
  it('is a labelled trigger button that shows a placeholder when empty', () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    expect(trigger).toHaveTextContent('Pick a date');
    expect(trigger).toHaveAccessibleDescription('Pick a day');
    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
  });

  it('shows the value with Intl.DateTimeFormat', () => {
    render(<Harness initial={new Date(2026, 0, 15)} />);

    expect(screen.getByRole('button', { name: 'Created' })).toHaveTextContent('Jan 15, 2026');
  });

  it('opens the calendar with focus on the selected day', async () => {
    const user = userEvent.setup();
    render(<Harness initial={new Date(2026, 0, 15)} />);

    await user.click(screen.getByRole('button', { name: 'Created' }));

    expect(await screen.findByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await waitFor(() =>
      expect(dayCell('2026-01-15')).toContainElement(document.activeElement as HTMLElement),
    );
  });

  it('picks a day with the keyboard, closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={new Date(2026, 0, 15)} spy={spy} />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(dayCell('2026-01-15')).toContainElement(document.activeElement as HTMLElement),
    );
    await user.keyboard('{ArrowRight}{ArrowDown}');
    await waitFor(() =>
      expect(dayCell('2026-01-23')).toContainElement(document.activeElement as HTMLElement),
    );
    await user.keyboard('{Enter}');

    expect(spy).toHaveBeenCalledWith(new Date(2026, 0, 23));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveTextContent('Jan 23, 2026');
  });

  it('closes on Escape without changing the value and returns focus', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={new Date(2026, 0, 15)} spy={spy} />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(spy).not.toHaveBeenCalled();
  });

  it('has a Close button inside the calendar that closes it without a change', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={new Date(2026, 0, 15)} spy={spy} />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    await user.click(trigger);
    const calendar = await screen.findByRole('dialog', { name: 'Choose a date' });
    await user.click(within(calendar).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(spy).not.toHaveBeenCalled();
  });

  it('opens on today when there is no value', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Created' }));
    await screen.findByRole('dialog');

    const today = document.querySelector('[data-today]') as HTMLElement;
    await waitFor(() => expect(today).toContainElement(document.activeElement as HTMLElement));
  });

  it('clears the value with the Clear button and focuses the trigger', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={new Date(2026, 0, 15)} spy={spy} />);

    await user.click(screen.getByRole('button', { name: 'Clear date' }));

    expect(spy).toHaveBeenCalledWith(undefined);
    const trigger = screen.getByRole('button', { name: 'Created' });
    expect(trigger).toHaveTextContent('Pick a date');
    expect(trigger).toHaveFocus();
  });

  it('cannot be opened or cleared when disabled', () => {
    render(<Harness initial={new Date(2026, 0, 15)} disabled />);

    expect(screen.getByRole('button', { name: 'Created' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
  });
});
