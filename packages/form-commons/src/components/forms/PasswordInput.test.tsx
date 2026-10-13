import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Field } from './Field';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('hides the password and toggles it with an accessible button', async () => {
    render(
      <Field label="Password">
        <PasswordInput defaultValue="s3cret" />
      </Field>,
    );
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(hide);

    expect(input).toHaveAttribute('type', 'password');
  });

  it('forwards ref and Field wiring to the input, not the toggle', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Field label="Password" error="Too short." required>
        <PasswordInput ref={ref} autoComplete="current-password" />
      </Field>,
    );

    const input = screen.getByLabelText('Password');
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('autocomplete', 'current-password');
  });

  it('disables the toggle with the input', () => {
    render(
      <Field label="Password">
        <PasswordInput disabled />
      </Field>,
    );

    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });
});
