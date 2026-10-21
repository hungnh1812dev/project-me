import { Button, Checkbox } from '@abyss/form-commons';
import { Fragment, useState } from 'react';

import {
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  type PermissionAction,
} from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import type { ContentType } from './access.api';
import { CellDetails } from './CellDetails';
import {
  actionsFor,
  cellKey,
  type CellRef,
  isSystemSubject,
  type MatrixState,
  toggleCell,
} from './permission-matrix';

const copy = COPY.access.matrix;

export interface PermissionMatrixProps {
  state: MatrixState;
  onChange: (update: (state: MatrixState) => MatrixState) => void;
  contentTypes: readonly ContentType[];
  /** Content and system subjects in display order. */
  order: { content: readonly string[]; system: readonly string[] };
  /** False: everything is shown read-only. */
  editable: boolean;
  /**
   * Whether the caller may grant a system subject action (it must hold it
   * itself, T17 PERMISSION_NOT_HELD). Content actions are always grantable.
   */
  canGrant: (subject: string, action: PermissionAction) => boolean;
  /** Server messages per cell key (400 issues). */
  errors: ReadonlyMap<string, readonly string[]>;
  /** Cells the server refused as not held (403 indexes). */
  notHeld: ReadonlySet<string>;
  /** Cells whose conditions text is not valid JSON. */
  invalidConditions: ReadonlySet<string>;
}

export function subjectLabel(subject: string, known: boolean): string {
  if (subject === CONTENT_WILDCARD_SUBJECT) return copy.wildcard;
  if (isSystemSubject(subject)) {
    return copy.subjects[subject as keyof typeof copy.subjects];
  }
  return known ? subject : copy.unknownType(subject);
}

/**
 * Role permission matrix (T18): rows are subjects, columns actions. Content
 * rows open a details row with field pickers and the row conditions.
 */
export function PermissionMatrix(props: PermissionMatrixProps) {
  const { order, contentTypes } = props;
  const known = new Set(contentTypes.map((type) => type.slug));
  const anyNotGrantable = order.system.some((subject) =>
    actionsFor(subject).some((action) => !props.canGrant(subject, action)),
  );

  return (
    <div className="grid gap-8">
      <MatrixSection
        {...props}
        title={copy.contentTitle}
        description={copy.contentDescription}
        subjects={order.content}
        known={known}
        withDetails
      />
      <MatrixSection
        {...props}
        title={copy.systemTitle}
        description={copy.systemDescription}
        subjects={order.system}
        known={known}
        withDetails={false}
        footnote={
          props.editable && anyNotGrantable ? copy.notHeldHint : undefined
        }
      />
    </div>
  );
}

function MatrixSection({
  title,
  description,
  subjects,
  known,
  withDetails,
  footnote,
  ...props
}: PermissionMatrixProps & {
  title: string;
  description: string;
  subjects: readonly string[];
  known: ReadonlySet<string>;
  withDetails: boolean;
  footnote?: string | undefined;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const headingId = `matrix-${title}`;
  const toggleOpen = (subject: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div className="grid gap-1">
        <h2 id={headingId} className="m-0 text-base font-semibold">
          {title}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {copy.subjectColumn}
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th
                  key={action}
                  scope="col"
                  className="px-3 py-2 text-center font-medium"
                >
                  {copy.actions[action]}
                </th>
              ))}
              {withDetails ? (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{copy.details}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => {
              const label = subjectLabel(
                subject,
                isSystemSubject(subject) ||
                  subject === CONTENT_WILDCARD_SUBJECT ||
                  known.has(subject),
              );
              const valid = actionsFor(subject);
              const detailsId = `details-${subject}`;
              const isOpen = open.has(subject);
              const rowErrors = valid.some(
                (action) =>
                  props.errors.has(cellKey({ subject, action })) ||
                  props.invalidConditions.has(cellKey({ subject, action })),
              );
              return (
                <Fragment key={subject}>
                  <tr className="border-t border-border">
                    <th
                      scope="row"
                      className={`px-3 py-2 text-left font-medium ${
                        subject === CONTENT_WILDCARD_SUBJECT ||
                        isSystemSubject(subject)
                          ? ''
                          : 'font-mono'
                      }`}
                    >
                      {label}
                    </th>
                    {PERMISSION_ACTIONS.map((action) => (
                      <td key={action} className="px-3 py-2 text-center">
                        {valid.includes(action) ? (
                          <MatrixCheckbox
                            {...props}
                            cell={{ subject, action }}
                            label={copy.cellLabel(copy.actions[action], label)}
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            <span aria-hidden="true">–</span>
                            <span className="sr-only">{copy.notAvailable}</span>
                          </span>
                        )}
                      </td>
                    ))}
                    {withDetails ? (
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-expanded={isOpen}
                          aria-controls={detailsId}
                          aria-label={copy.detailsLabel(label)}
                          onClick={() => toggleOpen(subject)}
                          className={rowErrors ? 'text-destructive-strong' : ''}
                        >
                          {subject === CONTENT_WILDCARD_SUBJECT
                            ? copy.conditionsOnly
                            : copy.details}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                  {withDetails && (isOpen || rowErrors) ? (
                    <tr id={detailsId} className="border-t border-border">
                      <td
                        colSpan={PERMISSION_ACTIONS.length + 2}
                        className="bg-background px-4 py-4"
                      >
                        <CellDetails
                          {...props}
                          subject={subject}
                          subjectLabel={label}
                          contentType={props.contentTypes.find(
                            (type) => type.slug === subject,
                          )}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {withDetails ? null : (
        <SystemErrors errors={props.errors} subjects={subjects} known={known} />
      )}
      {footnote === undefined ? null : (
        <p className="m-0 text-sm text-muted-foreground">{footnote}</p>
      )}
    </section>
  );
}

function MatrixCheckbox({
  state,
  onChange,
  editable,
  canGrant,
  errors,
  notHeld,
  cell,
  label,
}: PermissionMatrixProps & { cell: CellRef; label: string }) {
  const granted = state[cell.subject]?.[cell.action] !== undefined;
  const grantable =
    !isSystemSubject(cell.subject) || canGrant(cell.subject, cell.action);
  const key = cellKey(cell);
  const invalid = errors.has(key) || notHeld.has(key);
  return (
    <Checkbox
      aria-label={label}
      checked={granted}
      // A held-elsewhere grant can still be removed.
      disabled={!editable || (!grantable && !granted)}
      aria-invalid={invalid || undefined}
      onCheckedChange={(checked) =>
        onChange((current) => toggleCell(current, cell, checked === true))
      }
    />
  );
}

/** System rows have no details row, so their server messages go here. */
function SystemErrors({
  errors,
  subjects,
  known,
}: {
  errors: ReadonlyMap<string, readonly string[]>;
  subjects: readonly string[];
  known: ReadonlySet<string>;
}) {
  const lines = subjects.flatMap((subject) =>
    actionsFor(subject).flatMap((action) =>
      (errors.get(cellKey({ subject, action })) ?? []).map(
        (message) =>
          `${copy.cellLabel(copy.actions[action], subjectLabel(subject, known.has(subject) || isSystemSubject(subject)))}: ${message}`,
      ),
    ),
  );
  if (lines.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-1 p-0 text-sm text-destructive-strong">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
