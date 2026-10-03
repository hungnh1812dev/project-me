import { describe, expect, it } from 'vitest';

import { buttonVariants } from '../../components/variants';
import { cn } from '../../lib/cn';

// Call sites merge through `cn()`, so assert on the merged list.
const classesOf = (variant: Parameters<typeof buttonVariants>[0]): string[] =>
  cn(buttonVariants(variant)).split(/\s+/);

describe('buttonVariants roles', () => {
  it('renders the action (default) button as a gold fill with a primary-ink border (AC-6)', () => {
    const classes = classesOf({ variant: 'default' });

    expect(classes).toEqual(
      expect.arrayContaining([
        'bg-primary',
        'border-primary-ink',
        'text-primary-foreground',
        'hover:bg-primary/90',
      ]),
    );
    expect(classes).not.toContain('border-transparent');
  });

  it('renders the normal (outline) button on the background with an input border (AC-6)', () => {
    const classes = classesOf({ variant: 'outline' });

    expect(classes).toEqual(
      expect.arrayContaining(['bg-background', 'border-input', 'hover:bg-accent']),
    );
    expect(classes).not.toContain('bg-primary');
  });

  it('renders the danger (destructive) button on the destructive fill (AC-6)', () => {
    expect(classesOf({ variant: 'destructive' })).toEqual(
      expect.arrayContaining(['bg-destructive', 'text-destructive-foreground']),
    );
  });

  it('colours the link variant with primary-ink, not the gold primary (AC-7)', () => {
    const classes = classesOf({ variant: 'link' });

    expect(classes).toContain('text-primary-ink');
    expect(classes).not.toContain('text-primary');
  });
});
