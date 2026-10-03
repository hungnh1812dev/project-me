import { useId, useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

import { DatePicker } from '@/components/form/DatePicker';
import { Field } from '@/components/form/Field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Column, ColumnCatalog } from '@/features/content/columns';
import { operatorLabel } from '@/features/content/filterLabels';
import { MAX_LIST_TEXT_LENGTH } from '@/features/content/listQuery';
import type { ListFilter } from '@/features/content/listState';
import type { FilterOperator } from '@/features/content/types';

export interface FilterPanelProps {
  catalog: ColumnCatalog;
  /** The active filters; the panel starts with one row each (or one empty row). */
  filters: Record<string, ListFilter>;
  /** Called with the new filters on Apply, and with `{}` on "Clear all". */
  onApply: (filters: Record<string, ListFilter>) => void;
  locale?: string;
}

interface Row {
  key: number;
  /** The column key, or '' before one is chosen. */
  field: string;
  op: FilterOperator;
  /** The URL value: text, a number, `true`/`false` or an ISO date. */
  value: string;
}

// Row keys only need to be unique within one panel.
let lastKey = 0;
const newRow = (field = '', op: FilterOperator = '$eq', value = ''): Row => ({
  key: ++lastKey,
  field,
  op,
  value,
});

const BOOLEAN_ITEMS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** Why a row's value can't be applied, or `null` when it can. */
function valueProblem(column: Column, value: string): string | null {
  const trimmed = value.trim();
  switch (column.kind) {
    case 'boolean':
      return trimmed === 'true' || trimmed === 'false' ? null : 'Choose Yes or No.';
    case 'date':
      return trimmed !== '' && !Number.isNaN(Date.parse(trimmed)) ? null : 'Pick a date.';
    case 'number':
      return trimmed !== '' && Number.isFinite(Number(trimmed)) ? null : 'Enter a number.';
    default:
      return trimmed === '' ? 'Enter a value.' : null;
  }
}

/** The value control for a column's kind: text, number, a Yes/No select or a DatePicker. */
const ValueInput: React.FC<{
  column: Column | undefined;
  value: string;
  error: string | null;
  locale?: string;
  onChange: (value: string) => void;
}> = ({ column, value, error, locale, onChange }) => {
  if (column?.kind === 'boolean') {
    return (
      <Select
        items={BOOLEAN_ITEMS}
        value={value === '' ? null : value}
        onValueChange={(next) => onChange(next ?? '')}
      >
        <Field label="Value" error={error}>
          <SelectTrigger>
            <SelectValue placeholder="Choose Yes or No" />
          </SelectTrigger>
        </Field>
        <SelectContent>
          {BOOLEAN_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (column?.kind === 'date') {
    return (
      <Field label="Value" error={error}>
        <DatePicker
          value={value === '' ? undefined : new Date(value)}
          onChange={(day) => onChange(day ? day.toISOString() : '')}
          locale={locale}
        />
      </Field>
    );
  }
  return (
    <Field label="Value" error={error}>
      <Input
        type={column?.kind === 'number' ? 'number' : 'text'}
        value={value}
        disabled={!column}
        maxLength={MAX_LIST_TEXT_LENGTH}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
};
ValueInput.displayName = 'ValueInput';

/**
 * The filter panel (SPEC "Filters"): one row per field, each picking a field, then an operator
 * allowed for its kind, then a value input for that kind. A field can be in one row only, and
 * there is no Status field (D7). Apply checks every row with a field and reports the filters;
 * "Clear all" reports none.
 */
export const FilterPanel: React.FC<FilterPanelProps> = ({ catalog, filters, onApply, locale }) => {
  const headingId = useId();
  const [rows, setRows] = useState<Row[]>(() => {
    const initial = Object.entries(filters).map(([field, f]) => newRow(field, f.op, f.value));
    return initial.length > 0 ? initial : [newRow()];
  });
  const [errors, setErrors] = useState<Record<number, string>>({});

  const filterable = catalog.columns.filter((column) => column.operators.length > 0);
  const used = new Set(rows.map((r) => r.field));

  const patch = (key: number, change: Partial<Row>) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const apply = () => {
    const next: Record<string, ListFilter> = {};
    const problems: Record<number, string> = {};
    for (const r of rows) {
      const column = catalog.byKey.get(r.field);
      if (!column) continue;
      const problem = valueProblem(column, r.value);
      if (problem) problems[r.key] = problem;
      else next[r.field] = { op: r.op, value: r.value.trim() };
    }
    setErrors(problems);
    if (Object.keys(problems).length === 0) onApply(next);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <h2 id={headingId} className="text-base font-semibold">
        Filters
      </h2>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        {rows.map((r, index) => {
          const n = index + 1;
          const column = catalog.byKey.get(r.field);
          const fieldItems = filterable
            .filter((c) => c.key === r.field || !used.has(c.key))
            .map((c) => ({ value: c.key, label: c.label }));
          const opItems = (column?.operators ?? []).map((op) => ({
            value: op,
            label: operatorLabel(column!.kind, op),
          }));
          return (
            <div
              key={r.key}
              role="group"
              aria-label={`Filter ${n}`}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-start"
            >
              <Select
                items={fieldItems}
                value={r.field === '' ? null : r.field}
                onValueChange={(field) => {
                  if (field !== null) patch(r.key, { field, op: '$eq', value: '' });
                }}
              >
                <Field label="Field">
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a field" />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  {fieldItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                items={opItems}
                value={column ? r.op : null}
                disabled={!column}
                onValueChange={(op) => {
                  if (op !== null) patch(r.key, { op });
                }}
              >
                <Field label="Operator">
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a field first" />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  {opItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ValueInput
                key={r.field}
                column={column}
                value={r.value}
                error={errors[r.key] ?? null}
                locale={locale}
                onChange={(value) => patch(r.key, { value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove filter ${n}`}
                className="sm:mt-6"
                onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="outline"
            disabled={used.size - (used.has('') ? 1 : 0) >= filterable.length}
            onClick={() => setRows((current) => [...current, newRow()])}
          >
            <PlusIcon aria-hidden="true" />
            Add filter
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onApply({})}>
              Clear all
            </Button>
            <Button type="submit">Apply</Button>
          </div>
        </div>
      </form>
    </section>
  );
};
FilterPanel.displayName = 'FilterPanel';
