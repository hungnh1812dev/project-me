import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { PageMeta } from '../lib/api-types';
import { useClampedPage } from './use-clamped-page';

function setup(initialPage: number, meta: PageMeta | undefined) {
  return renderHook(
    ({ meta: current }) => {
      const [page, setPage] = useState(initialPage);
      const lastPage = useClampedPage(page, setPage, current);
      return { page, lastPage };
    },
    { initialProps: { meta } },
  );
}

describe('useClampedPage', () => {
  it('treats a missing meta as a single page', () => {
    const { result } = setup(3, undefined);
    expect(result.current).toEqual({ page: 1, lastPage: 1 });
  });

  it('steps back to the last page when the list shrinks', () => {
    const { result, rerender } = setup(3, { page: 3, pageSize: 10, total: 25 });
    expect(result.current.page).toBe(3);
    act(() => rerender({ meta: { page: 3, pageSize: 10, total: 11 } }));
    expect(result.current).toEqual({ page: 2, lastPage: 2 });
  });

  it('never goes below page 1 for an empty list', () => {
    const { result } = setup(2, { page: 2, pageSize: 10, total: 0 });
    expect(result.current).toEqual({ page: 1, lastPage: 1 });
  });
});
