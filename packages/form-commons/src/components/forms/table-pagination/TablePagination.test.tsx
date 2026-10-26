import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TablePagination } from './TablePagination';

const LABELS = {
  nav: 'Pages',
  previous: 'Previous',
  next: 'Next',
  range: (from: number, to: number, total: number) =>
    `${from}-${to} of ${total}`,
};

describe('TablePagination', () => {
  it('shows the range and goes to the next page', async () => {
    const onPageChange = vi.fn<(page: number) => void>();
    render(
      <TablePagination
        page={1}
        pageSize={20}
        total={45}
        count={20}
        onPageChange={onPageChange}
        labels={LABELS}
      />,
    );
    expect(screen.getByText('1-20 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables next on the last page and handles a short page', async () => {
    const onPageChange = vi.fn<(page: number) => void>();
    render(
      <TablePagination
        page={3}
        pageSize={20}
        total={45}
        count={5}
        onPageChange={onPageChange}
        labels={LABELS}
      />,
    );
    expect(screen.getByText('41-45 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows 0 of 0 when empty', () => {
    render(
      <TablePagination
        page={1}
        pageSize={20}
        total={0}
        count={0}
        onPageChange={() => undefined}
        labels={LABELS}
      />,
    );
    expect(screen.getByText('0-0 of 0')).toBeInTheDocument();
  });
});
