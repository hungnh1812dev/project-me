import { cn } from 'cn';

import { Checkbox } from '@/components/ui/Checkbox';

import type { SheetColumn } from './SortableSheet';

interface SheetRowProps<TRow> {
  row: TRow;
  columns: readonly SheetColumn<TRow>[];
  isSelected: boolean;
  /** Present only when the sheet is selectable. */
  selection?:
    { checkboxLabel: string | undefined; onToggle: () => void } | undefined;
}

function SheetRow<TRow>({
  row,
  columns,
  isSelected,
  selection,
}: SheetRowProps<TRow>) {
  return (
    <tr
      data-state={isSelected ? 'selected' : undefined}
      className="border-t border-border data-[state=selected]:bg-accent"
    >
      {selection !== undefined ? (
        <td className="w-10 px-3 py-2">
          <Checkbox
            aria-label={selection.checkboxLabel}
            checked={isSelected}
            onCheckedChange={selection.onToggle}
          />
        </td>
      ) : null}
      {columns.map((column) => {
        const Cell = column.rowHeader === true ? 'th' : 'td';
        return (
          <Cell
            key={column.key}
            scope={column.rowHeader === true ? 'row' : undefined}
            className={cn(
              'px-3 py-2',
              column.rowHeader === true
                ? 'text-left font-medium'
                : 'text-muted-foreground',
              column.align === 'right' && 'text-right tabular-nums',
            )}
          >
            {column.renderCell(row)}
          </Cell>
        );
      })}
    </tr>
  );
}

export { SheetRow };
