import { act } from '@testing-library/react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderHookWithProviders } from '@/test/renderWithProviders';

import { useListPaging } from './useListPaging';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

interface Props {
  items: readonly number[] | undefined;
  search: string;
}

/** Renders the hook with its router location, so each test can read the URL and history type. */
function setup(route: string, initial: Props) {
  let props = initial;
  const rendered = renderHookWithProviders(
    () => ({
      paging: useListPaging(props.items, props.search),
      location: useLocation(),
      navigationType: useNavigationType(),
      navigate: useNavigate(),
    }),
    { route },
  );
  const rerender = (next: Partial<Props>) => {
    props = { ...props, ...next };
    rendered.rerender();
  };
  return { ...rendered, rerender };
}

describe('useListPaging (AC-21, AC-24)', () => {
  it('shows the first 10 rows at the defaults and leaves the URL alone', () => {
    const { result } = setup('/users', { items: range(25), search: '' });

    expect(result.current.paging).toMatchObject({ page: 1, size: 10, total: 25 });
    expect(result.current.paging.rows).toEqual(range(10));
    expect(result.current.location.search).toBe('');
    expect(result.current.navigationType).toBe('POP');
  });

  it('reads page and size from the URL (a deep link)', () => {
    const { result } = setup('/users?page=2&size=20', { items: range(45), search: '' });

    expect(result.current.paging).toMatchObject({ page: 2, size: 20 });
    expect(result.current.paging.rows).toEqual(range(40).slice(20));
  });

  it('fixes invalid values in place with replace', () => {
    const { result } = setup('/users?tab=x&page=abc&size=7', { items: range(25), search: '' });

    expect(result.current.paging).toMatchObject({ page: 1, size: 10 });
    expect(result.current.location.search).toBe('?tab=x');
    expect(result.current.navigationType).toBe('REPLACE');
  });

  it('clamps a page past the end to the last page with replace', () => {
    const { result } = setup('/users?page=9', { items: range(25), search: '' });

    expect(result.current.paging.page).toBe(3);
    expect(result.current.paging.rows).toEqual([21, 22, 23, 24, 25]);
    expect(result.current.location.search).toBe('?page=3');
    expect(result.current.navigationType).toBe('REPLACE');
  });

  it('does not clamp while the list is loading', () => {
    const { result, rerender } = setup('/users?page=2', { items: undefined, search: '' });

    expect(result.current.paging).toMatchObject({ page: 2, total: 0, rows: [] });
    expect(result.current.location.search).toBe('?page=2');

    rerender({ items: range(15) });
    expect(result.current.paging.rows).toEqual(range(15).slice(10));
    expect(result.current.location.search).toBe('?page=2');
  });

  it('pushes a page change, so Back restores the previous page', () => {
    const { result } = setup('/users', { items: range(25), search: '' });

    act(() => result.current.paging.onPageChange(2));
    expect(result.current.location.search).toBe('?page=2');
    expect(result.current.navigationType).toBe('PUSH');
    expect(result.current.paging.rows).toEqual(range(20).slice(10));

    act(() => {
      void result.current.navigate(-1);
    });
    expect(result.current.paging.page).toBe(1);

    act(() => {
      void result.current.navigate(1);
    });
    expect(result.current.paging.page).toBe(2);
  });

  it('pushes a size change and goes back to page 1', () => {
    const { result } = setup('/users?tab=x&page=3', { items: range(60), search: '' });

    act(() => result.current.paging.onSizeChange(50));
    expect(result.current.location.search).toBe('?tab=x&size=50');
    expect(result.current.navigationType).toBe('PUSH');
    expect(result.current.paging.rows).toEqual(range(50));
  });
});

describe('useListPaging search reset (AC-25)', () => {
  it('goes back to page 1 with replace when the search changes', () => {
    const { result, rerender } = setup('/users?page=3', { items: range(30), search: '' });
    expect(result.current.paging.page).toBe(3);

    rerender({ items: range(30), search: '1' });
    expect(result.current.paging.page).toBe(1);
    expect(result.current.location.search).toBe('');
    expect(result.current.navigationType).toBe('REPLACE');
  });

  it('keeps a deep-linked page on the first render', () => {
    const { result } = setup('/users?page=2', { items: range(30), search: 'x' });

    expect(result.current.paging.page).toBe(2);
    expect(result.current.location.search).toBe('?page=2');
  });
});

describe('useListPaging clamp after a delete (AC-26)', () => {
  it('moves to the new last page when the current page empties', () => {
    const { result, rerender } = setup('/users?page=3', { items: range(21), search: '' });
    expect(result.current.paging.rows).toEqual([21]);

    rerender({ items: range(20) });
    expect(result.current.paging.page).toBe(2);
    expect(result.current.paging.rows).toEqual(range(20).slice(10));
    expect(result.current.location.search).toBe('?page=2');
    expect(result.current.navigationType).toBe('REPLACE');
  });

  it('goes to page 1 when the list becomes empty', () => {
    const { result, rerender } = setup('/users?page=2', { items: range(11), search: '' });

    rerender({ items: [] });
    expect(result.current.paging).toMatchObject({ page: 1, total: 0, rows: [] });
    expect(result.current.location.search).toBe('');
  });
});
