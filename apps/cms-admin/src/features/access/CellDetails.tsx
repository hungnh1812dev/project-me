import { useId } from 'react';

import { COPY } from '../../config/copy.constants';
import type { ContentType } from '../content-types';
import { FieldPicker } from './FieldPicker';
import type { PermissionMatrixProps } from './PermissionMatrix';
import {
  actionsFor,
  cellKey,
  fieldListKindOf,
  setConditionsText,
  setFieldList,
} from './permission-matrix';

const copy = COPY.access;

/**
 * Field access and conditions of one content subject's granted actions.
 * Conditions stay collapsed ("Advanced") unless set or rejected.
 */
export function CellDetails({
  state,
  onChange,
  editable,
  errors,
  invalidConditions,
  subject,
  subjectLabel,
  contentType,
}: PermissionMatrixProps & {
  subject: string;
  subjectLabel: string;
  contentType: ContentType | undefined;
}) {
  const granted = actionsFor(subject).filter(
    (action) => state[subject]?.[action] !== undefined,
  );
  const contentFields = (contentType?.fields ?? []).filter(
    (field) => !field.system,
  );

  if (granted.length === 0) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {copy.matrix.detailsEmpty}
      </p>
    );
  }

  return (
    <fieldset
      aria-label={copy.matrix.detailsLabel(subjectLabel)}
      className="m-0 grid min-w-0 gap-6 border-0 p-0 md:grid-cols-2"
    >
      {granted.map((action) => {
        const ref = { subject, action };
        const cell = state[subject]?.[action];
        const first = cell?.rows[0];
        if (cell === undefined || first === undefined) return null;
        const actionLabel = copy.matrix.actions[action];
        const kind = fieldListKindOf(subject, action);
        const key = cellKey(ref);
        const messages = errors.get(key) ?? [];
        const badJson = invalidConditions.has(key);
        return (
          <div key={action} className="grid content-start gap-3">
            <h3 className="m-0 text-sm font-semibold">{actionLabel}</h3>
            {kind !== null && contentType !== undefined ? (
              <FieldPicker
                legend={
                  kind === 'readableFields'
                    ? copy.fields.readable
                    : copy.fields.writable(actionLabel)
                }
                fields={contentFields}
                value={first[kind]}
                disabled={!editable}
                emptyHint={
                  kind === 'readableFields'
                    ? copy.fields.noneSelected
                    : copy.fields.noneSelectedWrite
                }
                onChange={(list) =>
                  onChange((current) => setFieldList(current, ref, kind, list))
                }
              />
            ) : null}
            <ConditionsEditor
              actionLabel={actionLabel}
              text={cell.conditionsText}
              disabled={!editable}
              invalidJson={badJson}
              forceOpen={badJson || messages.length > 0}
              onChange={(text) =>
                onChange((current) => setConditionsText(current, ref, text))
              }
            />
            {cell.rows.length > 1 ? (
              <p className="m-0 text-sm text-muted-foreground">
                {copy.matrix.extraRows(cell.rows.length - 1)}
              </p>
            ) : null}
            {messages.length > 0 ? (
              <ul className="m-0 grid list-none gap-1 p-0 text-sm text-destructive-strong">
                {[...new Set(messages)].map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

function ConditionsEditor({
  actionLabel,
  text,
  disabled,
  invalidJson,
  forceOpen,
  onChange,
}: {
  actionLabel: string;
  text: string;
  disabled: boolean;
  invalidJson: boolean;
  forceOpen: boolean;
  onChange: (text: string) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <details
      className="group rounded-md border border-border bg-card"
      open={forceOpen || text.trim() !== '' ? true : undefined}
    >
      <summary className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {copy.conditions.summary(actionLabel)}
      </summary>
      <div className="grid gap-1.5 px-3 pb-3">
        <label htmlFor={id} className="text-sm font-medium">
          {copy.conditions.label(actionLabel)}
        </label>
        <textarea
          id={id}
          value={text}
          disabled={disabled}
          spellCheck={false}
          rows={4}
          aria-invalid={invalidJson || undefined}
          aria-describedby={invalidJson ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        />
        <p id={hintId} className="m-0 text-sm text-muted-foreground">
          {copy.conditions.hint}
        </p>
        {invalidJson ? (
          <p id={errorId} className="m-0 text-sm text-destructive-strong">
            {copy.conditions.invalidJson}
          </p>
        ) : null}
      </div>
    </details>
  );
}
