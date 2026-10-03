import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('lets the later Tailwind class win when two classes conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values and joins conditional classes', () => {
    expect(cn('text-sm', false, null, undefined, { 'font-bold': true, italic: false })).toBe(
      'text-sm font-bold',
    );
  });

  it('keeps non-conflicting classes in order', () => {
    expect(cn('bg-background', ['text-foreground', 'border-input'])).toBe(
      'bg-background text-foreground border-input',
    );
  });
});
