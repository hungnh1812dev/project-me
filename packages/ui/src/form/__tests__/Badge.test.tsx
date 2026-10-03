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

  it('keeps the default variant on primary with a primary-ink border (AC-28)', () => {
    render(<Badge>Draft</Badge>);

    const badge = screen.getByText('Draft');
    expect(badge).toHaveClass('bg-primary', 'text-primary-foreground', 'border-primary-ink');
    expect(badge).not.toHaveClass('bg-highlight');
    expect(badge).not.toHaveClass('border-transparent');
  });

  it('pairs the destructive variant text with its destructive tint (AC-9)', () => {
    render(<Badge variant="destructive">Failed</Badge>);

    expect(screen.getByText('Failed')).toHaveClass(
      'bg-destructive/10',
      'text-destructive',
      'dark:bg-destructive/20',
    );
  });

  it('colours the link variant with primary-ink, not the gold primary', () => {
    render(<Badge variant="link">More</Badge>);

    expect(screen.getByText('More')).toHaveClass('text-primary-ink');
    expect(screen.getByText('More')).not.toHaveClass('text-primary');
  });
});
