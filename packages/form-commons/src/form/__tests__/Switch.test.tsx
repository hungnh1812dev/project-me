import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '../../components/switch';
import { Field } from '../Field';

describe('Switch', () => {
  it('renders role="switch" with aria-checked and toggles uncontrolled with Space', async () => {
    render(
      <Field label="Published">
        <Switch />
      </Field>,
    );
    const toggle = screen.getByRole('switch', { name: 'Published' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    toggle.focus();
    await userEvent.keyboard(' ');

    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('starts from defaultChecked', () => {
    render(<Switch aria-label="Published" defaultChecked />);

    expect(screen.getByRole('switch', { name: 'Published' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('is controlled through checked and onCheckedChange', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [checked, setChecked] = useState(true);
      return (
        <Switch
          aria-label="Published"
          checked={checked}
          onCheckedChange={(next) => {
            onChange(next);
            setChecked(next);
          }}
        />
      );
    };
    render(<Controlled />);

    await userEvent.click(screen.getByRole('switch', { name: 'Published' }));

    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('switch', { name: 'Published' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('toggles when its Field label is clicked', async () => {
    render(
      <Field label="Notifications">
        <Switch />
      </Field>,
    );

    await userEvent.click(screen.getByText('Notifications'));

    expect(screen.getByRole('switch', { name: 'Notifications' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('submits name and value through a hidden input', async () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return new FormData(event.currentTarget).get('notify');
    });
    render(
      <form onSubmit={onSubmit}>
        <Switch aria-label="Notify" name="notify" value="yes" />
        <button type="submit">Send</button>
      </form>,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Notify' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveReturnedWith('yes');
  });

  it('ignores clicks and keys while disabled', async () => {
    render(<Switch aria-label="Published" disabled />);
    const toggle = screen.getByRole('switch', { name: 'Published' });

    await userEvent.click(toggle);
    await userEvent.keyboard(' ');

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
  });

  it('shows the invalid state through aria-invalid from Field', () => {
    render(
      <Field label="Accept terms" error="You must accept the terms.">
        <Switch />
      </Field>,
    );

    expect(screen.getByRole('switch', { name: 'Accept terms' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('forwards ref to the switch element', () => {
    const ref = createRef<HTMLElement>();
    render(<Switch ref={ref} aria-label="Published" />);

    expect(ref.current).toBe(screen.getByRole('switch', { name: 'Published' }));
  });
});
