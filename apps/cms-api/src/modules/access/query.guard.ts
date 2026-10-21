import type { RegisteredContentType } from '../content-engine/registry.service';
import {
  RECORD_SYSTEM_FIELDS,
  type RecordSystemField,
} from './access.constants';
import { fieldErrors } from './field-errors';
import { fieldPathsOf } from './field-paths';
import type { RecordReadAccess } from './record-read-access';

/** Field paths a list query uses, by purpose (T20 parses them from the URL). */
export interface QueryFieldUse {
  filter?: readonly string[] | undefined;
  sort?: readonly string[] | undefined;
  search?: readonly string[] | undefined;
}

const SYSTEM_FIELDS: ReadonlySet<string> = new Set(RECORD_SYSTEM_FIELDS);

function isRecordSystemField(path: string): path is RecordSystemField {
  return SYSTEM_FIELDS.has(path);
}

/**
 * SPEC D3: a query may only filter, sort or search on fields the actor can
 * read, so a masked value cannot be probed through result counts or order.
 * Not a Nest guard: the documents query service (T20) calls `assert` before
 * building SQL.
 *
 * - Root system fields the access includes are allowed (`documentId`,
 *   `createdAt`, …). `createdBy` / `updatedBy` for an anonymous or reviewer
 *   actor → 400 `FIELD_NOT_READABLE`.
 * - A path the content type does not have → 400 `FIELD_UNKNOWN`.
 * - A path the actor cannot read → 400 `FIELD_NOT_READABLE`.
 */
export class QueryGuard {
  private readonly paths: ReadonlySet<string>;

  constructor(type: RegisteredContentType) {
    this.paths = fieldPathsOf(type.definition);
  }

  assert(use: QueryFieldUse, access: RecordReadAccess): void {
    for (const path of [
      ...(use.filter ?? []),
      ...(use.sort ?? []),
      ...(use.search ?? []),
    ]) {
      if (isRecordSystemField(path)) {
        if (!access.systemFields.has(path)) throw fieldErrors.notReadable(path);
        continue;
      }
      if (!this.paths.has(path)) throw fieldErrors.unknown();
      if (!access.fields.allows(path)) throw fieldErrors.notReadable(path);
    }
  }
}
