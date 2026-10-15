import { createRef, useState } from 'react';
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
        config={{ locale: 'en-US' }}
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

  it('is controlled: picking a day calls onChange once with a Date, the shown day waits for the parent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Created"
        value={new Date(2026, 0, 15)}
        onChange={onChange}
        config={{ locale: 'en-US' }}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Created' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.click(within(dayCell('2026-01-20')).getByRole('button'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [picked] = onChange.mock.calls[0] as [unknown];
    expect(picked).toBeInstanceOf(Date);
    expect(picked).toEqual(new Date(2026, 0, 20));
    expect(trigger).toHaveTextContent('Jan 15, 2026');
  });

  it('takes locale and placeholder from config', () => {
    render(
      <>
        <DatePicker
          aria-label="Empty"
          value={undefined}
          onChange={() => {}}
          config={{ placeholder: 'Any day' }}
        />
        <DatePicker
          aria-label="German"
          value={new Date(2026, 0, 15)}
          onChange={() => {}}
          config={{ locale: 'de-DE' }}
        />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Empty' })).toHaveTextContent('Any day');
    expect(screen.getByRole('button', { name: 'German' })).toHaveTextContent(
      new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(2026, 0, 15)),
    );
  });

  it('fires onBlur once when focus leaves the picker, not while the calendar is open', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <>
        <Harness initial={new Date(2026, 0, 15)} onBlur={onBlur} />
        <button type="button">After</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Created' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onBlur).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('submits name with the day (YYYY-MM-DD) through a hidden input', () => {
    const { container, rerender } = render(
      <DatePicker name="created" value={new Date(2026, 0, 5)} onChange={() => {}} />,
    );

    const hidden = container.querySelector('input[type="hidden"][name="created"]');
    expect(hidden).toHaveValue('2026-01-05');

    rerender(<DatePicker name="created" value={undefined} onChange={() => {}} />);
    expect(container.querySelector('input[name="created"]')).toHaveValue('');
  });

  it('cannot be opened or cleared when read-only', async () => {
    const user = userEvent.setup();
    render(<Harness initial={new Date(2026, 0, 15)} readOnly />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    await user.click(trigger);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Jan 15, 2026');
  });

  it('forwards ref to the trigger and keeps the trigger classes', () => {
    const ref = createRef<HTMLElement>();
    render(<DatePicker ref={ref} aria-label="Created" value={undefined} onChange={() => {}} />);

    const trigger = screen.getByRole('button', { name: 'Created' });
    expect(ref.current).toBe(trigger);
    expect(trigger).toHaveClass('flex', 'h-11', 'items-center', 'gap-2', 'px-3', 'lg:h-10');
  });

  it('types its props on the contract: Date | undefined value, locale in config, no defaultValue', () => {
    const onChange: DatePickerProps['onChange'] = (value) => {
      const typed: Date | undefined = value;
      return typed;
    };
    render(
      <>
        <DatePicker aria-label="A" value={undefined} onChange={onChange} />
        {/* @ts-expect-error value is required */}
        <DatePicker aria-label="B" onChange={onChange} />
        <DatePicker
          aria-label="C"
          value={undefined}
          onChange={onChange}
          // @ts-expect-error defaultValue is not part of the contract
          defaultValue={new Date()}
        />
        <DatePicker
          aria-label="D"
          value={undefined}
          onChange={onChange}
          // @ts-expect-error locale moved into config
          locale="en-US"
        />
        {/* @ts-expect-error null is not a day; no date is undefined */}
        <DatePicker aria-label="E" value={null} onChange={onChange} />
      </>,
    );

    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
