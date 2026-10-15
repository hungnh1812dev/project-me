import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './Field';
import { PasswordInput, type PasswordInputProps } from './PasswordInput';

const noop = () => {};

/** A parent that owns the value. */
const Stateful = ({
  initial = '',
  ...props
}: Partial<PasswordInputProps> & { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <PasswordInput value={value} onChange={setValue} {...props} />;
};

describe('PasswordInput', () => {
  it('hides the password and toggles it with an accessible button', async () => {
    render(
      <Field label="Password">
        <PasswordInput value="s3cret" onChange={noop} />
      </Field>,
    );
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('s3cret');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(hide);

    expect(input).toHaveAttribute('type', 'password');
  });

  it('forwards ref, config and Field wiring to the input, not the toggle', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Field label="Password" error="Too short." required>
        <PasswordInput
          ref={ref}
          value=""
          onChange={noop}
          config={{ autoComplete: 'current-password', placeholder: 'Your password' }}
        />
      </Field>,
    );

    const input = screen.getByLabelText('Password');
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveAttribute('placeholder', 'Your password');
  });

  it('calls onChange once with the new string and stays controlled', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(
      <Field label="Password">
        <PasswordInput value="ab" onChange={onChange} />
      </Field>,
    );
    const input = screen.getByLabelText('Password');

    await userEvent.type(input, 'c');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('abc');
    expect(input).toHaveValue('ab');
  });

  it('shows typed text when the parent updates value and fires onBlur', async () => {
    const onBlur = vi.fn();
    render(
      <Field label="Password">
        <Stateful onBlur={onBlur} />
      </Field>,
    );
    const input = screen.getByLabelText('Password');

    await userEvent.type(input, 's3cret');
    await userEvent.tab();

    expect(input).toHaveValue('s3cret');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('disables the toggle with the input', () => {
    render(
      <Field label="Password">
        <PasswordInput value="" onChange={noop} disabled />
      </Field>,
    );

    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });

  it('types its props on the contract: no defaultValue, type or trailing', () => {
    render(
      <>
        {/* @ts-expect-error value is required */}
        <PasswordInput aria-label="A" onChange={noop} />
        {/* @ts-expect-error defaultValue is not part of the contract */}
        <PasswordInput aria-label="B" value="" onChange={noop} defaultValue="x" />
        {/* @ts-expect-error the type is owned by the toggle */}
        <PasswordInput aria-label="C" value="" onChange={noop} config={{ type: 'text' }} />
        {/* @ts-expect-error the trailing slot is the toggle */}
        <PasswordInput aria-label="D" value="" onChange={noop} trailing={<span />} />
      </>,
    );

    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(4);
  });
});
