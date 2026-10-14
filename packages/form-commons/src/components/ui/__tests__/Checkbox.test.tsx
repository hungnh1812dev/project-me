import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputValueProps } from '../../../lib/inputContract';
import { Field } from '../../forms/Field';
import { Checkbox, type CheckboxProps } from '../checkbox';

const noop = () => {};

/** A parent that owns the value, as every caller of a controlled input must. */
const Stateful = ({
  initial = false,
  ...props
}: Partial<CheckboxProps> & { initial?: boolean }) => {
  const [value, setValue] = useState(initial);
  return <Checkbox value={value} onChange={setValue} {...props} />;
};

describe('Checkbox', () => {
  it('renders role="checkbox" named by its Field label and toggles with Space', async () => {
    render(
      <Field label="Remember me">
        <Stateful />
      </Field>,
    );
    const box = screen.getByRole('checkbox', { name: 'Remember me' });
    expect(box).toHaveAttribute('aria-checked', 'false');

    box.focus();
    await userEvent.keyboard(' ');

    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange once with the new boolean, never an event', async () => {
    const onChange = vi.fn<(value: boolean) => void>();
    render(<Checkbox aria-label="Select row" value={false} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is controlled: the shown value does not change unless the parent updates value', async () => {
    render(<Checkbox aria-label="Select row" value={false} onChange={noop} />);
    const box = screen.getByRole('checkbox', { name: 'Select row' });

    await userEvent.click(box);

    expect(box).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onBlur when focus leaves', async () => {
    const onBlur = vi.fn();
    render(
      <>
        <Checkbox aria-label="Done" value={false} onChange={noop} onBlur={onBlur} />
        <button type="button">Next</button>
      </>,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Done' }));
    await userEvent.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('exposes config.indeterminate as aria-checked="mixed" with a dash icon', () => {
    render(
      <Checkbox
        aria-label="Select all"
        value={false}
        onChange={noop}
        config={{ indeterminate: true }}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Select all' });

    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(box).toHaveAttribute('data-indeterminate');
    const indicator = box.querySelector('[data-slot="checkbox-indicator"]');
    expect(indicator?.querySelector('svg')).toHaveClass('lucide-minus');
  });

  it('shows the check icon when value is true', () => {
    render(<Checkbox aria-label="Done" value onChange={noop} />);

    const box = screen.getByRole('checkbox', { name: 'Done' });
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box.querySelector('[data-slot="checkbox-indicator"] svg')).toHaveClass('lucide-check');
  });

  it('pairs the primary fill with a primary-ink border when checked or mixed', () => {
    render(<Checkbox aria-label="Done" value={false} onChange={noop} />);

    expect(screen.getByRole('checkbox', { name: 'Done' })).toHaveClass(
      'data-checked:bg-primary',
      'data-checked:border-primary-ink',
      'data-indeterminate:bg-primary',
      'data-indeterminate:border-primary-ink',
    );
  });

  it('widens the hit area to 44px below lg without changing the layout', () => {
    render(<Checkbox aria-label="Done" value={false} onChange={noop} />);

    // size-4 (16px) plus a 14px ::after inset on each side is 44px.
    expect(screen.getByRole('checkbox', { name: 'Done' })).toHaveClass(
      'relative',
      'size-4',
      'after:absolute',
      'after:-inset-3.5',
    );
  });

  it('ignores clicks while disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Done" value={false} onChange={onChange} disabled />);
    const box = screen.getByRole('checkbox', { name: 'Done' });

    await userEvent.click(box);

    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });

  it('ignores clicks while readOnly', async () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Done" value={false} onChange={onChange} readOnly />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Done' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the invalid state through aria-invalid from Field', () => {
    render(
      <Field label="Accept terms" error="You must accept the terms.">
        <Checkbox value={false} onChange={noop} />
      </Field>,
    );

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('forwards ref to the checkbox element', () => {
    const ref = createRef<HTMLElement>();
    render(<Checkbox ref={ref} aria-label="Done" value={false} onChange={noop} />);

    expect(ref.current).toBe(screen.getByRole('checkbox', { name: 'Done' }));
  });

  it('types its props on the contract: boolean value, no defaultValue or checked', () => {
    const props: InputValueProps<boolean> = { value: true, onChange: noop };
    const onChange: CheckboxProps['onChange'] = (value) => {
      const typed: boolean = value;
      return typed;
    };
    render(
      <>
        <Checkbox aria-label="A" {...props} onChange={onChange} />
        {/* @ts-expect-error value is required */}
        <Checkbox aria-label="B" onChange={noop} />
        {/* @ts-expect-error defaultValue is not part of the contract */}
        <Checkbox aria-label="C" value onChange={noop} defaultValue />
        {/* @ts-expect-error checked is replaced by value */}
        <Checkbox aria-label="D" value onChange={noop} checked />
        {/* @ts-expect-error indeterminate moved into config */}
        <Checkbox aria-label="E" value onChange={noop} indeterminate />
      </>,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });
});
