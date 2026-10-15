import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn, type DataTableProps } from './DataTable';

interface Row {
  id: string;
  name: string;
  size: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', size: 3 },
  { id: 'b', name: 'Beta', size: 1 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (row) => row.name },
  {
    key: 'size',
    header: 'Size',
    sortable: true,
    cellClassName: 'text-right',
    cell: (row) => <strong>{row.size}</strong>,
  },
  { key: 'kind', header: 'Kind', cell: () => 'File' },
];

function renderTable(overrides: Partial<DataTableProps<Row>> = {}) {
  const props: DataTableProps<Row> = {
    caption: 'Files',
    columns: COLUMNS,
    rows: ROWS,
    rowKey: (row) => row.id,
    rowLabel: (row) => row.name,
    ...overrides,
  };
  render(<DataTable {...props} />);
  return userEvent.setup();
}

const headers = () =>
  screen.getAllByRole('columnheader').map((th) => th.textContent?.replace(/\s+/g, ' ').trim());

const sorting = (orderBy = 'name', sortDir: 'asc' | 'desc' = 'desc') => ({
  orderBy,
  sortDir,
  onSortChange: vi.fn(),
});

const selecting = (selected: string[] = []) => ({
  selected: new Set(selected),
  onSelectedChange: vi.fn(),
});

describe('DataTable', () => {
  it('is a captioned table inside a labelled, focusable scroll region', () => {
    const regionRef = createRef<HTMLDivElement>();
    renderTable({ regionRef });

    const table = screen.getByRole('table', { name: 'Files' });
    const region = screen.getByRole('region', { name: 'Files' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(table);
    expect(regionRef.current).toBe(region);
  });

  it('shows only the columns without selection, sort or actions', () => {
    renderTable();

    expect(headers()).toEqual(['Name', 'Size', 'Kind']);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort');
  });

  it('renders each cell from its column, with the column class', () => {
    renderTable();

    const cells = within(screen.getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual(['Alpha', '3', 'File']);
    expect(cells[1]).toHaveClass('text-right');
    expect(cells[1]!.querySelector('strong')).not.toBeNull();
  });

  it('adds an Actions column with the row and its label', () => {
    renderTable({ renderActions: (row, label) => <span>menu {`${row.id} ${label}`}</span> });

    expect(headers().at(-1)).toBe('Actions');
    expect(screen.getByText('menu a Alpha')).toBeInTheDocument();
  });

  it('marks the table busy', () => {
    renderTable({ busy: true });

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DataTable sorting', () => {
  it('gives sortable headers a button and aria-sort, and others neither', () => {
    renderTable({ sort: sorting('size', 'asc') });

    expect(screen.getByRole('columnheader', { name: 'Size' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none');
    expect(screen.queryByRole('button', { name: 'Kind' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Kind' })).not.toHaveAttribute('aria-sort');
  });

  it('sorts a newly chosen column descending first', async () => {
    const sort = sorting('name', 'asc');
    const user = renderTable({ sort });

    await user.click(screen.getByRole('button', { name: 'Size' }));

    expect(sort.onSortChange).toHaveBeenCalledWith('size', 'desc');
  });

  it.each([
    ['desc', 'asc'],
    ['asc', 'desc'],
  ] as const)('flips the active column from %s to %s', async (from, to) => {
    const sort = sorting('size', from);
    const user = renderTable({ sort });

    await user.click(screen.getByRole('button', { name: 'Size' }));

    expect(sort.onSortChange).toHaveBeenCalledWith('size', to);
  });
});

describe('DataTable selection', () => {
  it('names the boxes by the row label and the default header label', () => {
    renderTable({ selection: selecting() });

    expect(headers()[0]).toBe('Select all rows on this page');
    expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toBeInTheDocument();
  });

  it('uses a custom header label', () => {
    renderTable({ selection: { ...selecting(), allLabel: 'Select all files' } });

    expect(screen.getByRole('checkbox', { name: 'Select all files' })).toBeInTheDocument();
  });

  it('selects and unselects one row', async () => {
    const selection = selecting(['a']);
    const user = renderTable({ selection });

    expect(screen.getByRole('checkbox', { name: 'Select Alpha' }).closest('tr')).toHaveAttribute(
      'data-state',
      'selected',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
    expect(selection.onSelectedChange).toHaveBeenLastCalledWith(new Set(['a', 'b']));

    await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    expect(selection.onSelectedChange).toHaveBeenLastCalledWith(new Set());
  });

  it.each([
    [[], 'false', new Set(['a', 'b'])],
    [['b'], 'mixed', new Set(['a', 'b'])],
    [['a', 'b'], 'true', new Set()],
  ])('header box with %j selected is %s and toggles the page', async (selected, state, next) => {
    const selection = selecting(selected);
    const user = renderTable({ selection });

    const all = screen.getByRole('checkbox', { name: 'Select all rows on this page' });
    expect(all).toHaveAttribute('aria-checked', state);
    await user.click(all);

    expect(selection.onSelectedChange).toHaveBeenCalledWith(next);
  });

  it('disables the header box on an empty page', () => {
    renderTable({ rows: [], selection: selecting() });

    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
