import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

const copy = {
  label: 'Pages',
  previous: 'Previous',
  next: 'Next',
  range: (from: number, to: number, total: number) =>
    `${from}-${to} of ${total}`,
};

describe('Pagination', () => {
  it('maps meta to the range and enables both directions mid-list', async () => {
    const onPage = vi.fn<(page: number) => void>();
    render(
      <Pagination
        meta={{ page: 2, pageSize: 10, total: 35 }}
        count={10}
        onPage={onPage}
        copy={copy}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByText('11-20 of 35')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage.mock.calls).toEqual([[3], [1]]);
  });

  it('disables previous on the first page and next on the last', () => {
    render(
      <Pagination
        meta={{ page: 1, pageSize: 10, total: 4 }}
        count={4}
        onPage={vi.fn<(page: number) => void>()}
        copy={copy}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('prints the kit empty-page range', () => {
    render(
      <Pagination
        meta={{ page: 1, pageSize: 10, total: 0 }}
        count={0}
        onPage={vi.fn<(page: number) => void>()}
        copy={copy}
      />,
    );
    expect(screen.getByText('0-0 of 0')).toBeTruthy();
  });
});
