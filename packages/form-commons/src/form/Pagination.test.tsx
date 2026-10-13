import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, type PaginationProps } from './Pagination';

function renderPagination(overrides: Partial<PaginationProps> = {}) {
  const props: PaginationProps = {
    page: 2,
    size: 20,
    total: 95,
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    ...overrides,
  };
  return { props, user: userEvent.setup(), ...render(<Pagination {...props} />) };
}

/** A parent that owns the page and size, like a real list. */
const Controlled: React.FC<{ initialPage: number; total: number }> = ({ initialPage, total }) => {
  const [page, setPage] = useState(initialPage);
  const [size, setSize] = useState(10);
  return (
    <Pagination
      page={page}
      size={size}
      total={total}
      onPageChange={setPage}
      onSizeChange={(next) => {
        setSize(next);
        setPage(1);
      }}
    />
  );
};

describe('Pagination (AC-18)', () => {
  it('is a navigation named Pagination with the range, the page indicator and the size', () => {
    renderPagination();

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByText('Showing 21–40 of 95')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page')).toHaveTextContent('Page 2 of 5');
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('20');
  });

  it('ends the range at the total on the last page', () => {
    renderPagination({ page: 5 });

    expect(screen.getByText('Showing 81–95 of 95')).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    renderPagination({ page: 1 });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('disables Next on the last page', () => {
    renderPagination({ page: 5 });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('moves one page back or forward', async () => {
    const { props, user } = renderPagination();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(props.onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(props.onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('offers 10, 20, 50 and 100 rows by default and reports a new size', async () => {
    const { props, user } = renderPagination();

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['10', '20', '50', '100']);
    await user.click(screen.getByRole('option', { name: '50' }));

    expect(props.onSizeChange).toHaveBeenCalledWith(50);
  });

  it('offers the sizes it is given', async () => {
    const { user } = renderPagination({ size: 5, sizes: [5, 25] });

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    const options = await screen.findAllByRole('option');

    expect(options.map((option) => option.textContent)).toEqual(['5', '25']);
  });

  it('shows 0 of 0 for an empty list with both buttons disabled', () => {
    renderPagination({ page: 1, total: 0 });

    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-page')).toHaveTextContent('Page 1 of 1');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

describe('Pagination current-page marker (AC-14)', () => {
  it('marks the current page number with the highlight token', () => {
    renderPagination({ page: 3 });

    const marker = screen.getByTestId('pagination-current');
    expect(marker).toHaveTextContent('3');
    expect(marker).toHaveClass('bg-highlight', 'text-highlight-foreground');
  });
});

describe('Pagination focus (AC-27)', () => {
  it('keeps focus on Next while it stays enabled', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={1} total={35} />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByTestId('pagination-page')).toHaveTextContent('Page 2 of 4');
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveFocus();
  });

  it('moves focus to Previous when Next reaches the last page', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={3} total={35} />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveFocus();
  });

  it('keeps focus on Previous while it stays enabled', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={3} total={35} />);

    await user.click(screen.getByRole('button', { name: 'Previous page' }));

    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveFocus();
  });

  it('moves focus to Next when Previous reaches the first page', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={2} total={35} />);

    await user.click(screen.getByRole('button', { name: 'Previous page' }));

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveFocus();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={3} total={35} />);

    screen.getByRole('button', { name: 'Next page' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveFocus();
  });

  it('keeps focus on the size select after a new size', async () => {
    const user = userEvent.setup();
    render(<Controlled initialPage={2} total={35} />);

    const trigger = screen.getByRole('combobox', { name: 'Rows per page' });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: '20' }));

    expect(trigger).toHaveTextContent('20');
    expect(trigger).toHaveFocus();
  });
});
