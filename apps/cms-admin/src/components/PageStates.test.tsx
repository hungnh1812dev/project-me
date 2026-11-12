import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './PageStates';

describe('EmptyState', () => {
  it('shows the title and hint inside a card', () => {
    const { container } = render(
      <EmptyState title="No documents yet" hint="Create the first one." />,
    );

    expect(screen.getByText('No documents yet')).toBeTruthy();
    expect(screen.getByText('Create the first one.')).toBeTruthy();
    expect(container.querySelector('[data-slot=card]')).not.toBeNull();
  });

  it('leaves out the hint when none is given', () => {
    render(<EmptyState title="No roles" />);

    expect(screen.getAllByText(/./)).toHaveLength(1);
  });
});
