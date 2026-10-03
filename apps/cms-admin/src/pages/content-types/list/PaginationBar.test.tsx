import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/renderWithProviders';

import { PaginationBar, type PaginationBarProps } from './PaginationBar';

function renderBar(overrides: Partial<PaginationBarProps> = {}) {
  const props: PaginationBarProps = {
    page: 2,
    size: 20,
    total: 95,
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<PaginationBar {...props} />) };
}

describe('PaginationBar (AC-23)', () => {
  it('shows the range, the page indicator and the size', () => {
    renderBar();

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByText('Showing 21–40 of 95')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('20');
  });

  it('ends the range at the total on the last page', () => {
    renderBar({ page: 5 });

    expect(screen.getByText('Showing 81–95 of 95')).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    renderBar({ page: 1 });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('disables Next on the last page', () => {
    renderBar({ page: 5 });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('moves one page back or forward', async () => {
    const { props, user } = renderBar();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(props.onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(props.onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('offers the page sizes and reports a new one', async () => {
    const { props, user } = renderBar();

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['10', '20', '50', '100']);
    await user.click(screen.getByRole('option', { name: '50' }));

    expect(props.onSizeChange).toHaveBeenCalledWith(50);
  });

  it('shows 0 of 0 for an empty list with both buttons disabled', () => {
    renderBar({ page: 1, total: 0 });

    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});
