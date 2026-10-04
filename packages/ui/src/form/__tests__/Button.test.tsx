import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../components/button';
import { buttonVariants } from '../../components/variants';

describe('Button', () => {
  it('defaults type to "button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('forwards ref and passes native props through', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} data-testid="native" title="Hint">
        Save
      </Button>,
    );

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Save' }));
    expect(ref.current).toHaveAttribute('title', 'Hint');
    expect(ref.current).toHaveAttribute('data-testid', 'native');
  });

  it.each(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);

      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
        ...buttonVariants({ variant }).split(' ').slice(-1),
      );
    },
  );

  it('ignores clicks while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner, sets aria-busy and ignores clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the label in the layout while loading, so the width does not change', () => {
    render(<Button loading>Save</Button>);

    expect(screen.getByText('Save')).toHaveClass('opacity-0');
  });

  it('renders as a link with the button styles through the render prop', () => {
    render(<Button render={<a href="/admin/profile" />}>Your profile</Button>);

    const link = screen.getByRole('link', { name: 'Your profile' });
    expect(link).toHaveAttribute('href', '/admin/profile');
    expect(link).toHaveClass(...buttonVariants().split(' ').slice(0, 3));
    expect(link).not.toHaveAttribute('type');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('warns in development when an icon button has no accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Button size="icon">x</Button>);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('aria-label'));
  });

  it('does not warn when an icon button has an aria-label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Button size="icon" aria-label="Close" />);

    expect(warn).not.toHaveBeenCalled();
  });
});
