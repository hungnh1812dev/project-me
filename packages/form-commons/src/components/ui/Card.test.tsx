import { render, screen } from '@testing-library/react';

import { Card } from './Card';

describe('Card', () => {
  it('renders a div on the card surface with default padding', () => {
    render(<Card data-testid="card">Body</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('bg-card', 'rounded-surface', 'shadow-card', 'p-6');
  });

  it.each([
    ['compact', 'p-4'],
    ['default', 'p-6'],
  ] as const)('applies the %s padding', (padding, expected) => {
    render(
      <Card padding={padding} data-testid="card">
        Body
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveClass(expected);
  });

  it('adds no padding when flush', () => {
    render(
      <Card padding="flush" data-testid="card">
        Body
      </Card>,
    );
    expect(screen.getByTestId('card').className).not.toMatch(/(^|\s)p-\d/);
  });

  it('renders the child element with asChild and keeps className', () => {
    render(
      <Card asChild className="col-span-2">
        <section aria-label="Summary">Body</section>
      </Card>,
    );
    const section = screen.getByRole('region', { name: 'Summary' });
    expect(section).toHaveClass('bg-card', 'col-span-2');
  });

  it('adds hover shadow and focus classes only when interactive', () => {
    render(
      <>
        <Card isInteractive data-testid="on">
          A
        </Card>
        <Card data-testid="off">B</Card>
      </>,
    );
    expect(screen.getByTestId('on')).toHaveClass(
      'hover:shadow-card-hover',
      'focus-visible:ring-[3px]',
    );
    expect(screen.getByTestId('off')).not.toHaveClass('hover:shadow-card-hover');
  });
});
