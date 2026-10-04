# Documents list

The collection list at `/admin/content-types/:slug` for a collection type (Phase 5, paginated in
Phase 6): a sortable, searchable, filterable table whose whole state lives in the URL, a column
chooser, row actions, and bulk publish, unpublish and delete. For editors managing many entries.

## Feature

### URL format

The URL is the list's state; `listState.ts` parses and writes it.

| Param                           | Values                                       | Default |
| ------------------------------- | -------------------------------------------- | ------- |
| `page`                          | 1-based integer                              | `1`     |
| `size`                          | `10`, `20`, `50`, `100`                      | `10`    |
| `orderBy`                       | a sortable column (camelCase)                | `id`    |
| `sortDir`                       | `asc`, `desc`                                | `desc`  |
| `q`                             | search text, trimmed, at most 256 characters | —       |
| `filters[<column>][<op>]=value` | one operator per column                      | —       |

`parseListState(search, catalog)` returns the state and the raw keys it dropped;
`serializeListState` writes the canonical form (defaults dropped, keys sorted), and the page
`replace`s the URL whenever it differs. A dropped `orderBy`, `q` or filter is announced once ("Some
filters in the link were ignored.", D8); a bad `page`, `size` or `sortDir` is fixed silently, and a
page past the end goes to the last page. `toListParams` gives `start = (page - 1) * size`.

`DEFAULT_LIST_SIZE` became 10 in Phase 6 (was 20). `LIST_DEFAULTS.size` in `listQuery.ts` stays 20
because it mirrors the backend default and decides which `size` is left off the request, so the
default list sends `size=10` (AC-20, approved decision).

### Known-column check

`buildColumnCatalog(type)` is the one catalog; it feeds the URL parser, the filter panel, the column
chooser and the hook check.

- **Sortable:** `id`, `createdAt`, `updatedAt`, `publishedAt` and top-level `text`, `number`,
  `boolean` fields.
- **Filterable:** text `$eq $ne $contains`; number and the three dates `$eq $ne $gt $gte $lt $lte`;
  boolean, `id` and `documentId` `$eq $ne`. `status` is not filterable (D7).
- **Listable:** the system columns `id`, `documentId`, `status`, `createdAt`, `updatedAt`,
  `publishedAt`, `updatedBy`, and the `text`, `number`, `boolean` fields.

`validateListParamsForType(params, catalog)` runs after the generic rules in
[Content data](./content-data.md) and requires a sortable `orderBy`, filterable filter columns and
allowed operators. `useDocumentList(ref, params, catalog)` runs it before any request:
`ERR_CLIENT_VALIDATION`, nothing sent.

### Table, search, filters, columns, pagination

- **Table.** Caption "<Type> entries" in a labelled, focusable scroll region (scrolls sideways at
  375px; the page doesn't). Columns: selection checkbox, the `listFields`, Status, Actions.
  `formatCell` formats each kind; the first text column (else `documentId`) links to the entry
  (`labelColumn`, `entryLabeler`). Sortable headers are buttons with `aria-sort`; a new column sorts
  descending first.
- **Search.** "Search entries", debounced 300 ms, writes `q`, resets to page 1.
- **Filters.** "Filters" (with a count badge) opens a panel of rows: column, an allowed operator,
  then a value input for the kind (text, number, Yes/No select or `DatePicker`). Apply and Clear all
  write the URL and return focus to Filters. Active filters show as chips ("Featured is Yes,
  remove") labelled by `filterChipLabel`/`operatorLabel`. Dates go out as ISO strings.
- **Pagination.** The shared `Pagination` from `@repo/ui` (replaced `PaginationBar` in Phase 6). Old
  rows stay visible with `aria-busy` while the next page loads.
- **Columns (D6).** A `GatedButton` on `configureColumns` opens "Choose columns": listable columns as
  `@repo/ui` `Checkbox` boxes with Move up and Move down, at least one kept ("Choose at least one
  column."). Each box is named by its column label through `aria-labelledby`, and the label is a
  `<label htmlFor>`, so clicking the visible text toggles the box. Save sends C3; a 400 or 403 stays
  in the dialog. The choice applies to everyone.
- **Hit areas.** Below `lg` each box has a 44px hit area in a 44px cell. In the dense `lg` table and
  dialog the boxes add `lg:after:-inset-2` (cell `lg:min-h-8 lg:min-w-8`), so the hit area shrinks
  to 32px and never reaches the next row's box.
- **States.** Skeleton rows; error with Retry; "You don't have access to <type> entries."; "No
  entries yet." with Create entry; "No entries match your search or filters." with "Clear search and
  filters".

### Row and bulk actions

- **Row actions.** "Actions for <label>": Edit, Duplicate, Publish or Unpublish by status, Delete
  (confirmed). Outcomes are announced; a failure shows above the table.
- **Selection.** Row boxes ("Select <label>") and a tri-state "Select all entries on this page", all
  `@repo/ui` `Checkbox` named through `aria-labelledby` by sr-only text (`SelectBox`). Select all is
  `indeterminate` (`aria-checked="mixed"`, a dash) when some rows are selected. No native checkbox
  is left. Any change of
  page, size, sort, search or filters clears it. The bar shows "n selected", Clear selection,
  Publish selected and Unpublish selected (hidden without draft and publish) and Delete selected.
- **Delete selected (D10)** confirms "Delete n entries?", sends one D10, shows "2 of 3 entries
  deleted." with one line per failure (`bulkDeleteSummary`); failed rows stay selected.
- **Publish/Unpublish selected (D5)** run `useBulkStatus(ref).run(target, items)`: `planBulkStatus`
  skips rows already in the target status, one D6 or D7 at a time, going on past failures,
  "Publishing 2 of 5…" (`bulkProgressText`), then `bulkStatusSummary`; `lists(slug)` invalidated
  once at the end. A denied decision rejects before any request.
- **Focus after a delete.** A confirmation returns focus to its opener; when the delete removed it
  (a row's Actions button, or the whole bulk bar), focus goes to the entries region, or the list
  heading when the list is now empty.

| Control                       | Decision                             |
| ----------------------------- | ------------------------------------ |
| Create entry, Duplicate       | `access.create`                      |
| Delete, Delete selected       | `access.delete`, `access.bulkDelete` |
| Publish, Unpublish (and bulk) | `access.publish`, `access.unpublish` |
| Columns                       | `access.configureColumns`            |

A denied control is a `GatedButton` or `aria-disabled` `GatedMenuItem` described by the reason and
sends nothing. Feedback goes through `useAnnouncer` and `LiveRegion`; dialog errors use
`role="alert"`.

### Decisions

- **The URL is the state**, so links, Back and reload restore the exact list, and the known-column
  check makes a crafted link fail closed.
- **Bulk publish is client-sequenced** (no backend bulk publish), so partial success is reported row
  by row.
- **Global columns (D6):** C3 changes `listFields` for everyone; there is no per-viewer choice.
- **No Status filter (D7)** until the backend is confirmed to accept one; bulk create (D9) has no UI.

## Files

| File                                               | Spec                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/pages/content-types/CollectionListPage.tsx`   | Default export: the list page, URL sync, selection, bulk bar, dialogs.                |
| `src/pages/content-types/list/DocumentsTable.tsx`  | Exports `DocumentsTable`: captioned, sortable, selectable table.                      |
| `src/pages/content-types/list/FilterPanel.tsx`     | Exports `FilterPanel`: column, operator and value rows.                               |
| `src/pages/content-types/list/FilterChips.tsx`     | Exports `FilterChips`: removable active-filter chips.                                 |
| `src/pages/content-types/list/ColumnChooserDialog.tsx` | Exports `ColumnChooserDialog`: listable columns, order, C3 save.                  |
| `src/pages/content-types/list/RowActions.tsx`      | Exports `RowActions`: per-row gated menu.                                             |
| `src/pages/content-types/list/DeleteDocumentDialog.tsx` | Exports `DeleteDocumentDialog`: confirmed single delete.                         |
| `src/pages/content-types/list/BulkActionBar.tsx`   | Exports `BulkActionBar`, `BulkSelectedEntry`: selection count and bulk actions.       |
| `src/pages/content-types/list/BulkDeleteDialog.tsx`| Exports `BulkDeleteDialog`: confirmed D10 with per-failure lines.                     |
| `src/features/content/listState.ts`                | Exports `parseListState`, `serializeListState`, `toListParams`, `DEFAULT_LIST_SIZE`, `DEFAULT_LIST_STATE`, `PAGE_SIZES` and the state types. URL ↔ state. |
| `src/features/content/columns.ts`                  | Exports `buildColumnCatalog`, `validateListParamsForType`, `cellValue`, `formatCell`, `labelColumn`, `entryLabeler`, `STATUS_LABELS` and the column types. |
| `src/features/content/filterLabels.ts`             | Exports `operatorLabel`, `filterChipLabel`.                                           |
| `src/features/content/bulk.ts`                     | Exports `bulkDeleteSummary`, `planBulkStatus`, `bulkProgressText`, `bulkStatusSummary` and their types. |
| `src/features/content/hooks/useBulkStatus.ts`      | Exports `useBulkStatus`, `BulkStatusProgress`, `BulkStatusResult`. Sequential bulk publish/unpublish. |

## Testing

- `CollectionListPage.test.tsx`; `list/DocumentsTable.test.tsx`, `FilterPanel.test.tsx`,
  `ColumnChooserDialog.test.tsx`, `RowActions.test.tsx`, `BulkActionBar.test.tsx`.
- `listState.test.ts`, `columns.test.ts`, `filterLabels.test.ts`, `bulk.test.ts`,
  `hooks/useBulkStatus.test.ts`. Branch coverage at the end of 5.9: `listState.ts` and `bulk.ts`
  100%, `columns.ts` 97.6% (bar 90%, read from the report).
- Unit and e2e tests find the boxes with `getByRole('checkbox', { name })`, never by tag or type
  (guarded by `packages/ui/src/rawControls.test.ts`).
- E2E: `e2e/documents-list.spec.ts` (sort from the URL, scoped 403, 401 refresh during a load,
  paging), `e2e/documents-filters.spec.ts` (filters, chips, date picker, dropped params),
  `e2e/documents-bulk.spec.ts` (selection, bulk publish and delete with failures, focus after
  delete); `a11y.spec.ts` covers the list's Tab walk, the date picker and no sideways scroll at
  375px; `csp.spec.ts` the list and the open date picker.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/content-types/list src/features/content/listState.test.ts src/features/content/columns.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/documents-list.spec.ts e2e/documents-filters.spec.ts e2e/documents-bulk.spec.ts`.

## Related

- [Content data](./content-data.md) (hooks, list query, `contentKeys`)
- [Content-type pages](./content-type-pages.md), [Document editor](./document-editor.md)
- [Schema form](./schema-form.md) (`schema.ts` field kinds and labels)
- [Design system](./design-system.md) (`Pagination`, `DatePicker`, `GatedButton`, `Checkbox`)
- [Settings foundation](./settings-foundation.md) (`useAnnouncer`, `LiveRegion`)
