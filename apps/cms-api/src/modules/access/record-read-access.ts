import {
  ACCOUNT_REFERENCE_FIELDS,
  ACCOUNT_REFERENCES_HIDDEN_FROM,
  RECORD_SYSTEM_COLUMNS,
  RECORD_SYSTEM_FIELDS,
  type RecordSystemField,
} from './access.constants';
import type { ActorContext, ActorKind } from './actor-context';
import type { FieldSelection } from './policy-evaluator';

/**
 * What of a record an actor may read: its readable content fields (from
 * `fieldsFor().readable`) and the root system fields it may see. Serializer,
 * query guard and root select list all take this, so they agree.
 */
export interface RecordReadAccess {
  fields: FieldSelection;
  systemFields: ReadonlySet<RecordSystemField>;
}

const HIDDEN_FROM: ReadonlySet<ActorKind> = new Set(
  ACCOUNT_REFERENCES_HIDDEN_FROM,
);
const ACCOUNT_REFERENCES: ReadonlySet<RecordSystemField> = new Set(
  ACCOUNT_REFERENCE_FIELDS,
);
const ALL_SYSTEM_FIELDS: ReadonlySet<RecordSystemField> = new Set(
  RECORD_SYSTEM_FIELDS,
);
const PUBLIC_SYSTEM_FIELDS: ReadonlySet<RecordSystemField> = new Set(
  RECORD_SYSTEM_FIELDS.filter((field) => !ACCOUNT_REFERENCES.has(field)),
);

/** Anonymous visitors and reviewers never see `createdBy` / `updatedBy`. */
export function recordReadAccess(
  actor: ActorContext,
  fields: FieldSelection,
): RecordReadAccess {
  return {
    fields,
    systemFields: HIDDEN_FROM.has(actor.kind)
      ? PUBLIC_SYSTEM_FIELDS
      : ALL_SYSTEM_FIELDS,
  };
}

/** Root system columns of the system fields the access does not include. */
export function hiddenSystemColumns(access: RecordReadAccess): Set<string> {
  return new Set(
    RECORD_SYSTEM_FIELDS.filter((field) => !access.systemFields.has(field)).map(
      (field) => RECORD_SYSTEM_COLUMNS[field],
    ),
  );
}
