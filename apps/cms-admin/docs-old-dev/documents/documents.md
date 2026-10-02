# Documents (Collection & Single-Type Data)

`src/hooks/useCollectionDocuments.ts`, `src/hooks/useSingleTypeDocuments.ts`, `src/pages/admin/panels/collection-type/*`, `src/components/collection/*`, `src/hooks/useDebouncedValue.ts` — the document CRUD/list/publish data layer and the collection list-view UI. Consumed by [content-type.md](./content-type.md)'s `ContentTypePanel`/`ContentTypePage`. **No locale support** — every locale param/query-key segment that existed here previously has been removed; this backend has no locale/i18n module (see [locales-and-invites.md](./locales-and-invites.md)).

## Data hooks

Both hook files follow the same shape: React Query wrappers around `/documents/{single-type,collection-type}/...` (relative to the `/api/v1` baseURL, see [app-shell.md](./app-shell.md)), each mutation invalidating the relevant list/detail query keys on success and toasting via the shared `apiErrorMessage` helper on failure.

- **`useSingleTypeDocuments.ts`** — `useSingleTypeDocument(slug)` treats a `404` as "not yet created" (`return undefined`, and its `retry` function stops retrying on `404` specifically — any other error still gets React Query's default retry). `useSaveSingleType` is a `PUT`. No delete — single types can't be deleted, only unpublished.
- **`useCollectionDocuments.ts`** — full CRUD plus `useBulkDeleteCollectionDocuments` (`DELETE .../bulk` with a `documentIds` body, returning `{ deleted: string[], failed: { documentId, error? }[] }`; the caller reconciles partial success itself — a bulk delete is not all-or-nothing) and `useDuplicateCollectionDocument` (`POST .../:id/duplicate`). `useCollectionDocuments(slug, start, size, orderBy, sortDir, search)` is the list query — server-side pagination/sort/search, no client-side filtering, and no `locale` param.

Publish/unpublish invalidate both the detail query (keyed by `slug, id` — no more `locale` in the key) and the list query, since a status change is visible in both places.

**Wire-level `orderBy` quirk** (documented in code, not in the written API reference): system-column sort values are **snake_case at the wire level** (`id`, `created_at`, `updated_at`, `document_id`) even though the same columns come back **camelCase** in response bodies (`documentId`, `createdAt`). Content-type schema field names (e.g. `title`) pass through unaffected. `CollectionListPage`'s `getSortableFieldNames`/`SortableHeader` wiring accounts for this — the sortable-field set and the `orderBy` values sent to the API use `created_at`/`updated_at`, while the rendered column labels and `doc.createdAt`/`doc.updatedAt` reads stay camelCase.

## `CollectionListPage` (`panels/collection-type/layout/CollectionListPage.tsx`)

The list view for a collection type, rendered by `ContentTypePage` (see [content-type.md](./content-type.md)) when `kind === "collection"`. Notable design points:

- **URL as source of truth for list state** — `orderBy`/`sortDir`/`page`/`pageSize`/`search` all live in `useSearchParams` (no `locale` param anymore), parsed defensively (`parseListState`: invalid `orderBy` values not in the content type's sortable-field set fall back to `id`, invalid page sizes fall back to `PAGE_SIZE_OPTIONS[0]`) and re-serialized to a **canonical** query string (`toCanonicalParams` — omits params equal to their default) on every state change, replacing history rather than pushing. A `useEffect` reconciles the URL to canonical form on mount/dependency changes for any URL a user might land on manually.
- **Search is the one documented exception** to that URL-is-truth rule: keystrokes update local `searchDraft` state immediately (so the input doesn't lag), and only the **debounced** value (400ms, via `useDebouncedValue`) gets written back to the URL/query. `searchDraft` is resynced from the committed URL value directly during render rather than in an effect — this also clears row selection whenever the effective search actually changes.
- **Column derivation** (`deriveColumns`) — registry override (see [content-type.md](./content-type.md)) wins outright; otherwise uses the content type's admin-configured `listFields` (minus always-separately-rendered system fields `id`/`createdAt`/`updatedAt`/`updatedBy`), falling back to the first 3 non-component schema fields if `listFields` is empty. Rows are typed `ListedDocumentItem` (see [app-shell.md](./app-shell.md)) — a shape distinct from the single-document `Document` fetched by `ContentTypePanel`: system columns (`id`/`documentId`/`status`/`createdAt`/`updatedAt`/`updatedBy`) sit as siblings of `data` on a list row, not nested inside it. `id` is the DB-generated autoincrement key — internal ordering only, not a stable public identifier (`documentId` is that).
- **Bulk actions** — row checkboxes (`Set<string>` of `documentId`s) drive a bulk-delete confirmation bar; selection is cleared on search-change, sort-change, and pagination (no more locale-change, since locale is gone).
- **Sortable columns** — only fields whose type is `text`/`number`/`boolean` (plus the always-sortable `id`/`created_at`/`updated_at` — see the snake_case note above) get a clickable `SortableHeader`; clicking a currently-inactive column defaults to descending, clicking the active column flips direction.
- **Permission gating** — "Add new item" and each row's "Duplicate" (duplicating creates a new record) are wrapped in `<PermissionTooltip required="create" contentTypeSlug={contentType.slug}>`; row "Delete" and the "Delete selected" bulk button use `required="delete"` (see [access-control.md](./access-control.md) for the shared `hasDocumentPermission`/`PermissionTooltip` primitives). "Edit" (pencil, navigation-only) stays ungated. The row action buttons live in `RowActions.tsx` and the delete-confirmation dialog in `DeleteConfirmDialog.tsx`, both extracted as siblings of `CollectionListPage.tsx` to keep it under the project's 500-line module cap once the gating code landed.

## `ColumnChooserDialog` (`components/collection/ColumnChooserDialog.tsx`)

The "configure columns" modal (hidden entirely when a registry override exists, see [content-type.md](./content-type.md)). Default selection (when the content type has no saved `listFields` yet) is the first 3 non-component content fields plus all 4 system fields (`id`/`createdAt`/`updatedAt`/`updatedBy`). Saves via `useUpdateListFields` (see [content-type.md](./content-type.md)), which persists to the content type itself (server-side), not per-user — one admin's column choice is everyone's column choice.

## `PageSizeSelector` (`components/collection/PageSizeSelector.tsx`)

Thin `Select` wrapper over `PAGE_SIZE_OPTIONS` (see [app-shell.md](./app-shell.md)).

## `useDebouncedValue` (`hooks/useDebouncedValue.ts`)

Generic `setTimeout`-based value debouncer; only current consumer is `CollectionListPage`'s search box.
