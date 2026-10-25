import type { CONTENT_STATUSES } from '../../content-engine';
import { normalizeListQuery } from '../../documents';
import type { ListDocumentsQuery } from '../../documents';
import { filterToClauses, sortToKeys } from './schema/FilterInputs.rules';

/** The arguments of a `<x>List` root field, as graphql-js coerced them. */
type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface ListArguments {
  status: ContentStatus;
  page: number;
  pageSize: number;
  sort?: readonly { field: string; direction?: 'asc' | 'desc' | null }[] | null;
  filter?: Readonly<Record<string, unknown>> | null;
}

/**
 * The REST `ListDocumentsQuery` of a list field: arguments mapped to the REST
 * shapes (values stringified), then checked by `normalizeListQuery`, the same
 * check `parseListQuery` runs. `QueryGuard` and the filter compiler run in the
 * service.
 * @throws BadRequestException (ACCESS_INVALID_REQUEST) out of range.
 */
export function toListQuery(args: ListArguments): ListDocumentsQuery {
  return normalizeListQuery({
    status: args.status,
    page: args.page,
    pageSize: args.pageSize,
    sort: sortToKeys(args.sort),
    filters: filterToClauses(args.filter),
  });
}
