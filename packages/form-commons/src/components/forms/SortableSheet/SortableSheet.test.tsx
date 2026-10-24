import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';

import {
  SortableSheet,
  type SheetColumn,
  type SheetSort,
} from './SortableSheet';

interface Row {
  id: string;
  name: string;
  score: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Ada', score: 3 },
  { id: 'b', name: 'Grace', score: 5 },
];

const COLUMNS: SheetColumn<Row>[] = [
  {
    key: 'name',
    header: 'Name',
    renderCell: (r) => r.name,
    sortable: true,
    rowHeader: true,
  },
  { key: 'score', header: 'Score', renderCell: (r) => r.score, align: 'right' },
];

const LABELS = {
  selectAll: 'Select all rows',
  selectRow: (label: string) => `Select ${label}`,
};

function Harness({
  onSort = () => undefined,
  initialSort = null,
}: {
  onSort?: (sort: SheetSort) => void;
  initialSort?: SheetSort | null;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <SortableSheet
      caption="People"
      columns={COLUMNS}
      rows={ROWS}
      getRowId={(r) => r.id}
      getRowLabel={(r) => r.name}
      sort={initialSort}
      onSortChange={onSort}
      selectedIds={selected}
      onSelectedChange={setSelected}
      labels={LABELS}
    />
  );
}

describe('SortableSheet', () => {
  it('renders rows with a row header and right-aligned numbers', () => {
    render(<Harness />);
    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '5' })).toHaveClass('text-right');
  });

  it('renders a plain list without labels or a checkbox column', () => {
    render(
      <SortableSheet
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Ada' })).toBeInTheDocument();
  });

  it('reports ascending first, then flips the same column', async () => {
    const onSort = vi.fn<(sort: SheetSort) => void>();
    const user = userEvent.setup();
    const { rerender } = render(
      <SortableSheet
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        sort={null}
        onSortChange={onSort}
        labels={LABELS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'name', direction: 'asc' });
    rerender(
      <SortableSheet
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        sort={{ key: 'name', direction: 'asc' }}
        onSortChange={onSort}
        labels={LABELS}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'name', direction: 'desc' });
  });

  it('does not make unsortable headers buttons and omits the checkbox column without a handler', () => {
    render(
      <SortableSheet
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        labels={LABELS}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('selects rows and all rows, with an indeterminate header', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const all = screen.getByRole('checkbox', { name: 'Select all rows' });
    await user.click(screen.getByRole('checkbox', { name: 'Select Ada' }));
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    await user.click(all);
    expect(
      screen.getByRole('checkbox', { name: 'Select Grace' }),
    ).toBeChecked();
    expect(all).toBeChecked();
    await user.click(all);
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      expect(within(row).getByRole('checkbox')).not.toBeChecked();
    }
  });
});
