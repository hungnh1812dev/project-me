import { Button, Checkbox } from '@abyss/form-commons';
import { Fragment, useState } from 'react';

import {
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  type PermissionAction,
} from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import type { ContentType } from './access.api';
import { FieldPicker } from './FieldPicker';
import { cellKey, type CellRef } from './permission-matrix';
import {
  scopeFieldListKind,
  type ScopeState,
  setScopeFieldList,
  toggleScopeCell,
} from './token-scope';

const copy = COPY.access.tokenScope;
const matrixCopy = COPY.access.matrix;

export interface TokenScopeEditorProps {
  state: ScopeState;
  onChange: (update: (state: ScopeState) => ScopeState) => void;
  contentTypes: readonly ContentType[];
  /** `*` first, then types; includes slugs only the token still names. */
  subjects: readonly string[];
  /** The caller holds this action on this subject (a hint; the server checks). */
  canGrant: (subject: string, action: PermissionAction) => boolean;
  /** Cells the server marked (not held, or invalid). */
  marked: ReadonlySet<string>;
}

function labelOf(subject: string, known: ReadonlySet<string>): string {
  if (subject === CONTENT_WILDCARD_SUBJECT) return matrixCopy.wildcard;
  return known.has(subject) ? subject : matrixCopy.unknownType(subject);
}

/**
 * Permission grid of a token: rows are content subjects, columns actions.
 * Rows of a specific type open a "Fields" row with the field pickers.
 */
export function TokenScopeEditor({
  state,
  onChange,
  contentTypes,
  subjects,
  canGrant,
  marked,
}: TokenScopeEditorProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const known = new Set(contentTypes.map((type) => type.slug));
  const anyNotGrantable = subjects.some((subject) =>
    PERMISSION_ACTIONS.some((action) => !canGrant(subject, action)),
  );
  const toggleOpen = (subject: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });

  return (
    <div className="grid gap-2">
      <div className="relative overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {matrixCopy.subjectColumn}
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th
                  key={action}
                  scope="col"
                  className="px-3 py-2 text-center font-medium"
                >
                  {matrixCopy.actions[action]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">{copy.fields}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => {
              const label = labelOf(subject, known);
              const isWildcard = subject === CONTENT_WILDCARD_SUBJECT;
              const contentType = contentTypes.find(
                (type) => type.slug === subject,
              );
              const anyGranted = PERMISSION_ACTIONS.some(
                (action) => state[subject]?.[action] !== undefined,
              );
              const detailsId = `token-fields-${subject}`;
              const isOpen = open.has(subject);
              return (
                <Fragment key={subject}>
                  <tr className="border-t border-border">
                    <th
                      scope="row"
                      className={`px-3 py-2 text-left font-medium ${isWildcard ? '' : 'font-mono'}`}
                    >
                      {label}
                    </th>
                    {PERMISSION_ACTIONS.map((action) => {
                      const ref: CellRef = { subject, action };
                      const granted = state[subject]?.[action] !== undefined;
                      return (
                        <td key={action} className="px-3 py-2 text-center">
                          <Checkbox
                            aria-label={copy.cellLabel(
                              matrixCopy.actions[action],
                              label,
                            )}
                            checked={granted}
                            // A grant the caller does not hold can still be removed.
                            disabled={!granted && !canGrant(subject, action)}
                            aria-invalid={
                              marked.has(cellKey(ref)) ? true : undefined
                            }
                            onCheckedChange={(checked) =>
                              onChange((current) =>
                                toggleScopeCell(current, ref, checked === true),
                              )
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      {isWildcard || contentType === undefined ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-expanded={isOpen}
                          aria-controls={detailsId}
                          aria-label={copy.fieldsLabel(label)}
                          onClick={() => toggleOpen(subject)}
                        >
                          {copy.fields}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isOpen && contentType !== undefined ? (
                    <tr id={detailsId} className="border-t border-border">
                      <td
                        colSpan={PERMISSION_ACTIONS.length + 2}
                        className="bg-background px-4 py-4"
                      >
                        {anyGranted ? (
                          <FieldGroups
                            subject={subject}
                            contentType={contentType}
                            state={state}
                            onChange={onChange}
                          />
                        ) : (
                          <p className="m-0 text-sm text-muted-foreground">
                            {copy.fieldsEmpty}
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyNotGrantable ? (
        <p className="m-0 text-sm text-muted-foreground">{copy.notHeldHint}</p>
      ) : null}
    </div>
  );
}

function FieldGroups({
  subject,
  contentType,
  state,
  onChange,
}: {
  subject: string;
  contentType: ContentType;
  state: ScopeState;
  onChange: TokenScopeEditorProps['onChange'];
}) {
  const fields = contentType.fields.filter((field) => !field.system);
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      {PERMISSION_ACTIONS.map((action) => {
        const cell = state[subject]?.[action];
        const kind = scopeFieldListKind(subject, action);
        if (cell === undefined || kind === null) return null;
        const actionLabel = matrixCopy.actions[action];
        return (
          <FieldPicker
            key={action}
            legend={
              kind === 'readableFields'
                ? COPY.access.fields.readable
                : COPY.access.fields.writable(actionLabel)
            }
            fields={fields}
            value={cell[kind]}
            disabled={false}
            emptyHint={
              kind === 'readableFields'
                ? COPY.access.fields.noneSelected
                : COPY.access.fields.noneSelectedWrite
            }
            onChange={(value) =>
              onChange((current) =>
                setScopeFieldList(current, { subject, action }, kind, value),
              )
            }
          />
        );
      })}
    </div>
  );
}
