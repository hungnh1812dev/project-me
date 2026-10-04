import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '../../components/checkbox';
import { Field } from '../Field';

describe('Checkbox', () => {
  it('renders role="checkbox" named by its Field label and toggles with Space', async () => {
    render(
      <Field label="Remember me">
        <Checkbox />
      </Field>,
    );
    const box = screen.getByRole('checkbox', { name: 'Remember me' });
    expect(box).toHaveAttribute('aria-checked', 'false');

    box.focus();
    await userEvent.keyboard(' ');

    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('is controlled through checked and onCheckedChange', async () => {
    const onChange = vi.fn();
    const Controlled = () => {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          aria-label="Select row"
          checked={checked}
          onCheckedChange={(next) => {
            onChange(next);
            setChecked(next);
          }}
        />
      );
    };
    render(<Controlled />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Select row' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('exposes the indeterminate state as aria-checked="mixed" with a dash icon', () => {
    render(<Checkbox aria-label="Select all" indeterminate />);
    const box = screen.getByRole('checkbox', { name: 'Select all' });

    expect(box).toHaveAttribute('aria-checked', 'mixed');
    expect(box).toHaveAttribute('data-indeterminate');
    const indicator = box.querySelector('[data-slot="checkbox-indicator"]');
    expect(indicator?.querySelector('svg')).toHaveClass('lucide-minus');
  });

  it('shows the check icon when checked', () => {
    render(<Checkbox aria-label="Done" defaultChecked />);

    const box = screen.getByRole('checkbox', { name: 'Done' });
    expect(box.querySelector('[data-slot="checkbox-indicator"] svg')).toHaveClass('lucide-check');
  });

  it('pairs the gold fill with a primary-ink border when checked or mixed', () => {
    render(<Checkbox aria-label="Done" />);

    expect(screen.getByRole('checkbox', { name: 'Done' })).toHaveClass(
      'data-checked:bg-primary',
      'data-checked:border-primary-ink',
      'data-indeterminate:bg-primary',
      'data-indeterminate:border-primary-ink',
    );
  });

  it('widens the hit area to 44px below lg without changing the layout', () => {
    render(<Checkbox aria-label="Done" />);

    // size-4 (16px) plus a 14px ::after inset on each side is 44px.
    expect(screen.getByRole('checkbox', { name: 'Done' })).toHaveClass(
      'relative',
      'size-4',
      'after:absolute',
      'after:-inset-3.5',
    );
  });

  it('ignores clicks while disabled', async () => {
    render(<Checkbox aria-label="Done" disabled />);
    const box = screen.getByRole('checkbox', { name: 'Done' });

    await userEvent.click(box);

    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the invalid state through aria-invalid from Field', () => {
    render(
      <Field label="Accept terms" error="You must accept the terms.">
        <Checkbox />
      </Field>,
    );

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('forwards ref to the checkbox element', () => {
    const ref = createRef<HTMLElement>();
    render(<Checkbox ref={ref} aria-label="Done" />);

    expect(ref.current).toBe(screen.getByRole('checkbox', { name: 'Done' }));
  });
});
