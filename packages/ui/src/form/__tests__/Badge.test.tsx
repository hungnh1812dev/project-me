import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '../../components/badge';

describe('Badge', () => {
  it('colours the highlight variant with the highlight tokens (AC-14)', () => {
    render(<Badge variant="highlight">New</Badge>);

    const badge = screen.getByText('New');
    expect(badge).toHaveClass('bg-highlight', 'text-highlight-foreground');
    expect(badge).toHaveAttribute('data-variant', 'highlight');
  });

  it('keeps the default variant on primary', () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText('Draft')).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(screen.getByText('Draft')).not.toHaveClass('bg-highlight');
  });
});
