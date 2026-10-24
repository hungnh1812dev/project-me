import { Checkbox } from '@abyss/form-commons';
import { useId } from 'react';

import { FIELD_PICKER_INDENT_REM } from './access.constants';
import { COPY } from '../../config/copy.constants';
import type { ContentTypeField } from '../content-types';
import type { FieldList } from './access.api';
import { isCoveredBy, toggleField } from './permission-matrix';

const copy = COPY.access.fields;

/**
 * Readable or writable field list of one permission row: every field
 * (`null`) or a chosen set. Nested fields are indented under their group; a
 * checked group covers everything inside it.
 */
export function FieldPicker({
  legend,
  fields,
  value,
  onChange,
  disabled,
  emptyHint,
}: {
  legend: string;
  /** Content fields only (no system fields), in definition order. */
  fields: readonly ContentTypeField[];
  value: FieldList;
  onChange: (value: FieldList) => void;
  disabled: boolean;
  emptyHint: string;
}) {
  const name = useId();
  const selected = value ?? [];
  const order = new Map(fields.map((field, index) => [field.path, index]));
  const ordered = (list: string[]) =>
    list.toSorted((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return (
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name={name}
            className="size-4 accent-primary"
            checked={value === null}
            onChange={() => onChange(null)}
          />
          {copy.all}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name={name}
            className="size-4 accent-primary"
            checked={value !== null}
            onChange={() => onChange([])}
          />
          {copy.some}
        </label>
      </div>
      {value === null ? null : (
        <>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {fields.map((field) => {
              const covered = selected.some((entry) =>
                isCoveredBy(entry, field.path),
              );
              const depth = field.path.split('.').length - 1;
              const id = `${name}-${field.path}`;
              return (
                <li
                  key={field.path}
                  className="flex items-center gap-2 text-sm"
                  style={{
                    paddingLeft: `${depth * FIELD_PICKER_INDENT_REM}rem`,
                  }}
                >
                  <Checkbox
                    id={id}
                    checked={covered || selected.includes(field.path)}
                    disabled={disabled || covered}
                    onCheckedChange={(checked) =>
                      onChange(
                        ordered(
                          toggleField(selected, field.path, checked === true),
                        ),
                      )
                    }
                  />
                  <label htmlFor={id} className="font-mono text-sm">
                    {field.path}
                  </label>
                  {field.component ? (
                    <span className="text-xs text-muted-foreground">
                      {copy.component}
                    </span>
                  ) : null}
                  {field.sensitive ? (
                    <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-strong">
                      {copy.sensitive}
                    </span>
                  ) : null}
                  {covered ? (
                    <span className="sr-only">{copy.covered}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {selected.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{emptyHint}</p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
