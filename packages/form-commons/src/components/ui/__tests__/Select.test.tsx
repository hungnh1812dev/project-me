import { createRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputOption } from '../../../lib/inputContract';
import { Field } from '../../forms/Field';
import { Select, type SelectProps } from '../select';

const OPTIONS: InputOption[] = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1y', label: '1 year' },
];

/** A parent that owns the value, as every caller of a controlled input must. */
const Stateful = ({
  initial = null,
  ...props
}: Partial<SelectProps> & { initial?: string | null }) => {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Field label="Expires in">
      <Select value={value} onChange={setValue} config={{ options: OPTIONS }} {...props} />
    </Field>
  );
};

describe('Select', () => {
  it('renders the label of value on a combobox named by its Field label', () => {
    render(<Stateful initial="1d" />);

    expect(screen.getByRole('combobox', { name: 'Expires in' })).toHaveTextContent('1 day');
  });

  it('shows config.placeholder while value is null', () => {
    render(<Stateful config={{ options: OPTIONS, placeholder: 'Choose an expiry' }} />);

    expect(screen.getByRole('combobox', { name: 'Expires in' })).toHaveTextContent(
      'Choose an expiry',
    );
  });

  it('lists config.options and calls onChange once with the picked value, never an event', async () => {
    const onChange = vi.fn<(value: string | null) => void>();
    render(
      <Select aria-label="Expires in" value="1h" onChange={onChange} config={{ options: OPTIONS }} />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Expires in' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['1 hour', '1 day', '1 year']);
    await userEvent.click(screen.getByRole('option', { name: '1 year' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('1y');
  });

  it('is controlled: the shown value does not change unless the parent updates value', async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Expires in" value="1h" onChange={onChange} config={{ options: OPTIONS }} />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Expires in' }));
    await userEvent.click(await screen.findByRole('option', { name: '1 year' }));

    expect(onChange).toHaveBeenCalledWith('1y');
    expect(screen.getByRole('combobox', { name: 'Expires in' })).toHaveTextContent('1 hour');
  });

  it('picks an option with the keyboard when the parent updates value', async () => {
    render(<Stateful initial="1h" />);
    const trigger = screen.getByRole('combobox', { name: 'Expires in' });

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '1 day' })).toHaveAttribute('data-highlighted'),
    );
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(trigger).toHaveTextContent('1 day'));
  });

  it('fires onBlur when focus leaves the trigger', async () => {
    const onBlur = vi.fn();
    render(
      <>
        <Select
          aria-label="Expires in"
          value="1h"
          onChange={() => {}}
          onBlur={onBlur}
          config={{ options: OPTIONS }}
        />
        <button type="button">Next</button>
      </>,
    );

    screen.getByRole('combobox', { name: 'Expires in' }).focus();
    await userEvent.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('does not open while disabled', async () => {
    const onChange = vi.fn();
    render(<Stateful initial="1h" disabled onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Expires in' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('submits name with the value through a hidden input', async () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get('expires');
    });
    render(
      <form onSubmit={onSubmit}>
        <Stateful initial="1d" name="expires" />
        <button type="submit">Send</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveReturnedWith('1d');
  });

  it('gets aria-invalid and aria-required from Field on the trigger, keeping its classes', () => {
    render(
      <Field label="Role" error="Choose a role." required>
        <Select value={null} onChange={() => {}} config={{ options: OPTIONS }} className="w-20" />
      </Field>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Role' });

    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-required', 'true');
    expect(trigger).toHaveClass('h-11', 'lg:h-10', 'w-20');
  });

  it('forwards ref to the trigger', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Select
        ref={ref}
        aria-label="Expires in"
        value={null}
        onChange={() => {}}
        config={{ options: OPTIONS }}
      />,
    );

    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Expires in' }));
  });

  it('types its props on the contract: string | null value, options in config, no defaultValue', () => {
    const onChange: SelectProps['onChange'] = (value) => {
      const typed: string | null = value;
      return typed;
    };
    render(
      <>
        <Select aria-label="A" value={null} onChange={onChange} config={{ options: OPTIONS }} />
        {/* @ts-expect-error value is required */}
        <Select aria-label="B" onChange={onChange} config={{ options: OPTIONS }} />
        <Select
          aria-label="C"
          value={null}
          onChange={onChange}
          config={{ options: OPTIONS }}
          // @ts-expect-error defaultValue is not part of the contract
          defaultValue="1h"
        />
        <Select
          aria-label="D"
          value={null}
          onChange={onChange}
          config={{ options: OPTIONS }}
          // @ts-expect-error items are replaced by config.options
          items={OPTIONS}
        />
        {/* @ts-expect-error config needs options */}
        <Select aria-label="E" value={null} onChange={onChange} config={{ placeholder: 'x' }} />
      </>,
    );

    expect(screen.getAllByRole('combobox')).toHaveLength(5);
  });
});
