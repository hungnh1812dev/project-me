import { describe, expect, it, vi } from 'vitest';

describe('jsdom stubs', () => {
  it('provides matchMedia that reports no match and accepts listeners', () => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = vi.fn();

    expect(query.matches).toBe(false);
    expect(query.media).toBe('(prefers-color-scheme: dark)');
    expect(() => query.addEventListener('change', listener)).not.toThrow();
    expect(() => query.removeEventListener('change', listener)).not.toThrow();
  });

  it('provides a ResizeObserver that can observe and disconnect', () => {
    const observer = new ResizeObserver(() => {});

    expect(() => observer.observe(document.body)).not.toThrow();
    expect(() => observer.disconnect()).not.toThrow();
  });
});
