import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Input } from '@repo/ui/components/input';

describe('Input', () => {
  it('forwards ref and passes native props through', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Email" type="email" placeholder="you@example.com" />);

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
  });

  it('renders the leading and trailing slots around the input', () => {
    render(
      <Input
        aria-label="Search"
        type="search"
        leading={<span data-testid="lead" />}
        trailing={<button type="button">Clear</button>}
      />,
    );

    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveClass('pl-10', 'pr-12');
  });

  it('ignores typing while disabled', async () => {
    render(<Input aria-label="Name" disabled />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'abc');

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('uses the destructive styles when aria-invalid is set', () => {
    render(<Input aria-label="Name" aria-invalid="true" />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass(
      'aria-invalid:border-destructive',
    );
  });
});
