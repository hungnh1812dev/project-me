/** Offset paging of the list endpoints. `total` counts every row. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}
