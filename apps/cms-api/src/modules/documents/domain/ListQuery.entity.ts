import type { ContentStatus } from '../../content-engine';
import type { FilterOperator } from './Documents.constants';

export type SortDirection = 'asc' | 'desc';

export interface SortKey {
  path: string;
  direction: SortDirection;
}

/** One `filter[...]` parameter; values are still the raw strings of the URL. */
export interface FilterClause {
  path: string;
  op: FilterOperator;
  values: string[];
}

export interface ListDocumentsQuery {
  status: ContentStatus;
  page: number;
  pageSize: number;
  sort: SortKey[];
  filters: FilterClause[];
}
