import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputValueProps } from '../../../lib/inputContract';
import { Field } from '../../forms/Field';
import { Switch, type SwitchProps } from '../switch';

/** A parent that owns the value, as every caller of a controlled input must. */
const Stateful = ({ initial = false, ...props }: Partial<SwitchProps> & { initial?: boolean }) => {
  const [value, setValue] = useState(initial);
  return <Switch value={value} onChange={setValue} {...props} />;
};

describe('Switch', () => {
  it('renders role="switch" with aria-checked and toggles with Space when the parent updates value', async () => {
    render(
      <Field label="Published">
        <Stateful />
      </Field>,
    );
    const toggle = screen.getByRole('switch', { name: 'Published' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    toggle.focus();
    await userEvent.keyboard(' ');

    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders value', () => {
    render(<Switch aria-label="Published" value onChange={() => {}} />);

    expect(screen.getByRole('switch', { name: 'Published' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('calls onChange once with the new boolean, never an event', async () => {
    const onChange = vi.fn<(value: boolean) => void>();
    render(<Switch aria-label="Published" value onChange={onChange} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Published' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('is controlled: the shown value does not change unless the parent updates value', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Published" value={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Published' });

    await userEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onBlur when focus leaves', async () => {
    const onBlur = vi.fn();
    render(
      <>
        <Switch aria-label="Published" value={false} onChange={() => {}} onBlur={onBlur} />
        <button type="button">Next</button>
      </>,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Published' }));
    await userEvent.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('toggles when its Field label is clicked', async () => {
    render(
      <Field label="Notifications">
        <Stateful />
      </Field>,
    );

    await userEvent.click(screen.getByText('Notifications'));

    expect(screen.getByRole('switch', { name: 'Notifications' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('submits name through a hidden input when on', async () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get('notify');
    });
    render(
      <form onSubmit={onSubmit}>
        <Stateful aria-label="Notify" name="notify" />
        <button type="submit">Send</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Notify' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveReturnedWith('on');
  });

  it('ignores clicks and keys while disabled', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Published" value={false} onChange={onChange} disabled />);
    const toggle = screen.getByRole('switch', { name: 'Published' });

    await userEvent.click(toggle);
    await userEvent.keyboard(' ');

    expect(onChange).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
  });

  it('ignores clicks while readOnly', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Published" value={false} onChange={onChange} readOnly />);

    await userEvent.click(screen.getByRole('switch', { name: 'Published' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the invalid state through aria-invalid from Field', () => {
    render(
      <Field label="Accept terms" error="You must accept the terms.">
        <Switch value={false} onChange={() => {}} />
      </Field>,
    );

    expect(screen.getByRole('switch', { name: 'Accept terms' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('forwards ref to the switch element', () => {
    const ref = createRef<HTMLElement>();
    render(<Switch ref={ref} aria-label="Published" value={false} onChange={() => {}} />);

    expect(ref.current).toBe(screen.getByRole('switch', { name: 'Published' }));
  });

  it('types its props on the contract: boolean value, no defaultValue or checked', () => {
    const props: InputValueProps<boolean> = { value: true, onChange: () => {} };
    const onChange: SwitchProps['onChange'] = (value) => {
      const typed: boolean = value;
      return typed;
    };
    render(
      <>
        <Switch aria-label="A" {...props} onChange={onChange} />
        {/* @ts-expect-error value is required */}
        <Switch aria-label="B" onChange={() => {}} />
        {/* @ts-expect-error defaultValue is not part of the contract */}
        <Switch aria-label="C" value onChange={() => {}} defaultValue />
        {/* @ts-expect-error checked is replaced by value */}
        <Switch aria-label="D" value onChange={() => {}} checked />
        {/* @ts-expect-error onCheckedChange is replaced by onChange */}
        <Switch aria-label="E" value onChange={() => {}} onCheckedChange={() => {}} />
      </>,
    );

    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });
});
