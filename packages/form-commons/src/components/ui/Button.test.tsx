import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('defaults to the secondary variant so primary is always a deliberate choice', () => {
    render(<Button>Cancel</Button>);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it.each(['primary', 'secondary', 'success', 'warning', 'destructive', 'ghost', 'link'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant);
    },
  );

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Save invoice</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save invoice' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('while loading: disabled, aria-busy, label kept for width and name', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Send invoice
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Send invoice' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[data-slot="button-spinner"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders its child element with asChild', () => {
    render(
      <Button asChild variant="link">
        <a href="/invoices">Invoices</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Invoices' });
    expect(link).toHaveAttribute('data-slot', 'button');
  });
});

describe('Button styling hooks', () => {
  it('uses the shared focus edge classes and the control radius', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('rounded-control', 'focus-visible:ring-ring/50');
    expect(button).toHaveClass('focus-visible:outline-focus-edge');
  });

  it('primary carries the primary shadow tokens; destructive none, with a rose focus', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'shadow-primary',
      'hover:shadow-primary-hover',
    );
    const destructive = screen.getByRole('button', { name: 'Delete' });
    expect(destructive.className).not.toMatch(/(^|\s)(hover:)?shadow-primary/);
    expect(destructive).toHaveClass('focus-visible:outline-destructive');
  });

  it('pressed scale is off under reduced motion; disabled drops the shadow', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toHaveClass(
      'active:scale-[0.98]',
      'motion-reduce:active:scale-100',
      'disabled:shadow-none',
    );
  });
});
