# Documents UI

Phase 5 builds the editing UI for content types and their documents on top of the Phase 2 data
layer (see [Content data](./content-data.md)). Every request goes through the Phase 2 hooks and
`cmsApi`. Each write control is gated with the same decision its hook guards. No document data is
rendered with `dangerouslySetInnerHTML`.

Source:

```text
src/pages/content-types/            the pages
  ContentTypesPage.tsx              overview, grouped into Single types and Collection types
  ContentTypePage.tsx               :slug → SingleTypeEditorPage or CollectionListPage
  SingleTypeEditorPage.tsx          single-type editor (S1 to S4)
  CollectionListPage.tsx            collection list (D1, URL state, bulk bar)
  DocumentCreatePage.tsx            :slug/new (D2)
  DocumentDetailPage.tsx            :slug/:documentId (D3 to D8)
  editor/EditorHeader.tsx           title, status badge, audit line, actions, "More actions"
  list/                             DocumentsTable, FilterPanel, FilterChips, PaginationBar,
                                    ColumnChooserDialog, RowActions, DeleteDocumentDialog,
                                    BulkActionBar, BulkDeleteDialog
src/components/form/
  SchemaForm.tsx, SchemaField.tsx   the schema-driven form (react-hook-form)
  fields/                           one control per field type
  DatePicker.tsx                    Calendar in a Popover, for the date filters
  UnsavedChangesDialog.tsx          "Discard unsaved changes?"
src/features/content/               pure modules (below) and the hooks
```

## Pages and routes

| Path                                     | Page                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `/admin/content-types`                   | `ContentTypesPage`: links grouped by kind, with "Draft & publish" when it is on |
| `/admin/content-types/:slug`             | a single type opens `SingleTypeEditorPage`, a collection `CollectionListPage`   |
| `/admin/content-types/:slug/new`         | `DocumentCreatePage` (collection only; a single type redirects to `:slug`)      |
| `/admin/content-types/:slug/:documentId` | `DocumentDetailPage` (collection only)                                          |

All four sit behind `RequireAccess can read content_type`. The create page sends a user without
`access.create` to `/403`; the detail page checks the document read itself. An unknown slug shows
"Content type not found." with a link to the overview. Breadcrumbs and `document.title` follow
`Home › Content types › <type> › New entry` and `… › <type> › <entry label>` (see
[App shell](./app-shell.md)).

**Single-type editor.** S1 loads the document; `null` shows "Not saved yet" with an empty form.
Save sends S2 (gated by `update`). Publish shows unless the status is `published` (S3), Unpublish
unless it is `draft` (S4). Both are disabled while the form is dirty ("Save your changes first.").
Without draft and publish there is no badge and no publish control.

**Create.** An empty form (`emptyValues`). Save (gated by `create`) sends D2, replaces the URL with
the new entry's page and announces "Entry created.". Cancel goes back to the list.

**Detail.** D3 loads the entry; 404 shows "This entry doesn't exist or was deleted." and 403 the
no-access state. The header has Save (D4), Publish or Unpublish (D6, D7), Duplicate (D8, opens the
copy, "Copy created.") and Delete (D5, confirmed `Delete "<label>"?`, then the list with "Entry
deleted."). Below `sm` the actions sit in a bottom bar fixed to the viewport, with Duplicate,
Unpublish and Delete in a "More actions" menu; the page reserves room for the bar, so it never
covers the last field.

## Form model (D3)

`SchemaForm` owns a react-hook-form `useForm({ defaultValues: toFormValues(fields, doc), mode:
'onTouched' })` under a `FormProvider`. `schemaForm.ts` maps between the two shapes:

- `toFormValues` / `emptyValues` / `emptyEntry`: numbers and json become text, media becomes
  `MediaAsset | string | null`, booleans default to `false`.
- `toDocumentData(fields, values)` converts back and keeps only schema fields, so a save never sends
  a key the schema does not have. An unknown field type's value is sent back unchanged.
- `rulesFor(field)`: "Enter a number." for text that is not a finite number.

Dirty state is `formState.isDirty`; after a save the form calls `reset(toFormValues(saved))`. A 400
shows every `messages` entry in a focused alert at the top, and the typed values stay. When the
save action is denied the whole form is read-only, with a notice giving the reason.

Fields render in `type.fields` order in a 6-column grid from `md` (`width` `"100%"`, `"50%"`,
`"1/3"`; anything else is full width). Labels come from `fieldLabel` ("coverImage" → "Cover image").

| Type                 | Control                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `text`, `number`     | `TextField`, `NumberField` (`Input`, `register`)                                            |
| `boolean`            | `BooleanField` (`Switch` through `Controller`)                                              |
| `json`               | `JsonField` (`JsonInput expect="any"`); invalid text stays visible and blocks the save      |
| `richtext`           | `RichTextField`, which lazy-loads `RichTextEditor` (Tiptap) behind a skeleton (D1)          |
| `media`              | `MediaField` plus `MediaPickerDialog` (D4)                                                  |
| `component`          | `ComponentField`: a `fieldset`; below the top level a `details` with an `entryHint` preview |
| repeatable component | `RepeatableField` (`useFieldArray`, keyed by `field.id`; nested ones on their full path)    |
| unknown type         | `UnsupportedField`: a read-only JSON preview, "Unsupported field type "<type>""             |

- **Repeatables.** Entries are "<Field> item n" with Move up, Move down and Remove; "Add <field>
  item" appends. Focus goes to the new entry after Add, and to the next entry, the previous one or
  Add after Remove. Every change is announced. No drag and drop.
- **Richtext (D1, D2).** Paragraphs, h2 to h4, bold, italic, strike, inline code, code blocks,
  lists, blockquotes and links (`http`, `https`, `mailto` only; `isAllowedHref`). No images, no raw
  HTML, `injectCSS: false`. The value is HTML. When the loaded HTML does not survive a round trip
  (`changesOnRoundTrip`), the field warns that saving removes the unsupported formatting. Only
  `RichTextEditor.tsx` imports `@tiptap/*`, so the editor is its own chunk.
- **Media (D4).** The field shows the asset (thumbnail, name, size) with Choose and Remove. The
  picker is a searchable radio grid of the M1 assets (arrow keys move, Enter selects) with a
  `FileDropzone` gated by `upload media`; a new upload is selected. A save writes the full
  `MediaAsset`. A `documentId` string is resolved through the cached M1 list (`resolveMedia`), and
  an unresolved value shows "File not found".
- **Leaving (D10).** `useUnsavedChangesGuard(dirty)` blocks in-app navigation with a `useBlocker`
  and `UnsavedChangesDialog` ("Discard unsaved changes?": Cancel stays, Discard leaves), and arms
  `beforeunload` only while the form is dirty. A just-saved form leaves without asking.

## Collection list

### URL format

The URL is the list's state; `listState.ts` parses and writes it.

| Param                           | Values                                       | Default |
| ------------------------------- | -------------------------------------------- | ------- |
| `page`                          | 1-based integer                              | `1`     |
| `size`                          | `10`, `20`, `50`, `100`                      | `20`    |
| `orderBy`                       | a sortable column (camelCase)                | `id`    |
| `sortDir`                       | `asc`, `desc`                                | `desc`  |
| `q`                             | search text, trimmed, at most 256 characters | —       |
| `filters[<column>][<op>]=value` | one operator per column                      | —       |

`parseListState(search, catalog)` returns the state and the raw keys it dropped.
`serializeListState` writes the canonical form (defaults dropped, keys sorted), and the page puts
it back with `replace` whenever it differs from the URL. A dropped `orderBy`, `q` or filter param is
announced once: "Some filters in the link were ignored." (D8). A bad `page`, `size` or `sortDir` is
fixed silently, and a page past the end goes to the last page. `toListParams` gives
`start = (page - 1) * size`; system columns go out with their snake_case wire names
(`listQuery.ts`).

### Known-column check

`buildColumnCatalog(type)` in `columns.ts` is the one column catalog. It feeds the URL parser, the
filter panel, the column chooser and the hook check.

- **Sortable:** `id`, `createdAt`, `updatedAt`, `publishedAt` and the top-level `text`, `number` and
  `boolean` fields.
- **Filterable:** text `$eq $ne $contains`; number and the three dates
  `$eq $ne $gt $gte $lt $lte`; boolean, `id` and `documentId` `$eq $ne`. `status` is not
  filterable (D7).
- **Listable:** the system columns `id`, `documentId`, `status`, `createdAt`, `updatedAt`,
  `publishedAt`, `updatedBy`, and the `text`, `number` and `boolean` fields.

`validateListParamsForType(params, catalog)` runs the Phase 2 identifier and length rules first,
then requires a sortable `orderBy`, a filterable column for each filter and an allowed operator.
`useDocumentList(ref, params, catalog)` runs it before any request: a failure is
`ERR_CLIENT_VALIDATION` and nothing is sent.

### Table, search, filters, columns

- **Table.** Caption "<Type> entries", inside a labelled, focusable scroll region (it scrolls
  sideways at 375px; the page does not). Columns: a selection checkbox, the `listFields`, Status,
  Actions. `formatCell` formats each kind; the first text column (else `documentId`) links to the
  entry (`labelColumn`, `entryLabeler`). Sortable headers are buttons with `aria-sort`: a new
  column sorts descending first, the active one flips.
- **Search.** "Search entries", debounced 300 ms, writes `q` and resets to page 1.
- **Filters.** "Filters" (with a count badge) opens a panel of rows: column, then an operator
  allowed for its kind, then a value input for the kind (text, number, a Yes/No select or a
  `DatePicker`). Apply and Clear all write the URL and return focus to Filters. Active filters
  show as chips ("Featured is Yes, remove"), labelled by `filterLabels.ts`.
- **DatePicker.** A trigger button showing the day (`Intl.DateTimeFormat`) opens the vendored
  `Calendar` (react-day-picker) in a vendored `Popover`, with focus on the selected day or today.
  Arrow keys move, Enter picks and closes, Escape or Close closes without a change, and focus
  returns to the trigger. While open, Tab stays inside the calendar (`modal="trap-focus"`). Dates
  go out as ISO strings.
- **Pagination.** "Showing 21–40 of 95", Previous, Next, the page and the page-size select. Old
  rows stay visible with `aria-busy` while the next page loads.
- **Columns (D6).** A `GatedButton` on `configureColumns` opens "Choose columns": the listable
  columns as checkboxes with Move up and Move down. At least one must stay ("Choose at least one
  column."). Save sends C3; a 400 or 403 stays in the dialog. The choice applies to everyone.
- **States.** Skeleton rows; the error with Retry; "You don't have access to <type> entries.";
  "No entries yet." with Create entry; "No entries match your search or filters." with "Clear search
  and filters".

## Actions and gating

- **Row actions.** "Actions for <label>": Edit, Duplicate, Publish or Unpublish by status, and
  Delete (confirmed). Outcomes are announced; a failure shows above the table.
- **Selection and bulk bar.** Row checkboxes and a tri-state "Select all entries on this page". Any
  change of page, size, sort, search or filters clears the selection. With rows selected the bar
  shows "n selected", Clear selection, Publish selected and Unpublish selected (hidden without
  draft and publish) and Delete selected.
  - **Delete selected (D10)** confirms "Delete n entries?", sends one D10, and shows "2 of 3 entries
    deleted." with one line per failure. Failed rows stay selected.
  - **Publish and Unpublish selected (D5)** run `useBulkStatus`: one D6 or D7 at a time, skipping
    rows already in the target status, going on past failures, with "Publishing 2 of 5…" and then a
    summary (`bulk.ts`).
- **Focus after a delete.** A confirmation returns focus to the control that opened it, including
  a menu's trigger. When a delete removes that control (a row's Actions button, or the whole bulk
  bar), focus moves to the entries region, or to the list heading when the list is now empty.

| Control                        | Decision                                   |
| ------------------------------ | ------------------------------------------ |
| Create entry, Duplicate        | `access.create`                            |
| Save (detail, single type)     | `access.update`                            |
| Save (create page)             | `access.create`                            |
| Delete, Delete selected        | `access.delete`, `access.bulkDelete`       |
| Publish, Unpublish (and bulk)  | `access.publish`, `access.unpublish`       |
| Columns                        | `access.configureColumns`                  |
| Media Choose, Upload in picker | `useCan('read', 'media')`, `('upload', …)` |

A denied control is a `GatedButton` or an `aria-disabled` `GatedMenuItem` described by the reason,
and activating it sends nothing. A server 403 shows "You don't have access to do this." where the
action started, and the session goes on. Feedback goes through `useAnnouncer` and `LiveRegion`;
errors inside dialogs use `role="alert"`.

## Pure modules and coverage

| Module          | What it owns                                                             |
| --------------- | ------------------------------------------------------------------------ |
| `schema.ts`     | field kinds, labels, widths, sortable and filterable rules, entry labels |
| `columns.ts`    | the column catalog, the known-column check, cell values and formatting   |
| `listState.ts`  | URL ↔ `ListState`, canonical form, `lastPage`, `toListParams`            |
| `schemaForm.ts` | document ↔ form values, empty values, field rules                        |
| `richtext.ts`   | link protocols, normalisation and the round-trip check (D2)              |
| `mediaValue.ts` | reading and resolving a media value (D4)                                 |
| `bulk.ts`       | bulk summaries, the publish plan and progress text                       |

At the end of 5.9 their branch coverage is: `schema.ts`, `listState.ts`, `mediaValue.ts` and
`bulk.ts` 100%, `columns.ts` 97.6%, `richtext.ts` 96.6%, `schemaForm.ts` 93.2% (the bar is 90%,
read from the `test:cov` report). The global gates (`src/features/**/*.ts` ≥ 85%,
`src/**/*.tsx` ≥ 70%) pass.

## Test doubles

- **Unit (MSW).** `src/test/msw/contentHandlers.ts` has one opt-in recorder per contract row
  (`getContentTypesHandler`, `patchListFieldsHandler`, `getSingleTypeHandler`, …,
  `bulkDeleteDocumentsHandler`) plus `errorReply(status, message)`. Each records the method, path,
  query and body. Fixtures are in `src/test/contentFixtures.ts` (`makeContentType`,
  `makeListedItem`, `makeListResponse`). Components are tested inside a real `useForm` provider.
- **E2E.** `e2e/fixtures/mockContent.ts` is an in-memory content backend for C1 to C3, S1 to S4
  and D1 to D10, reached through the `mockContent` fixture. It checks the bearer (401) and the
  global or slug-scoped permission (403), answers 404 for unknown slugs and documents and 400 for
  data the schema does not allow and for publish on a Mode B type, and moves statuses draft →
  published → modified → draft. D9 is all-or-nothing; D10 reports per-id failures
  (`failDelete(id, error)`). It records every save in `saves`. `e2e/fixtures/contentFixtures.ts`
  holds `FIELD_SHOWCASE` (every field kind), `BLOG`, `HOMEPAGE`, the Mode B `CHANGELOG`,
  `blogPost(n)`, `seedContent` and the `CONTENT_MANAGER` role.
- **Specs.** `documents-list`, `documents-filters`, `documents-detail`, `documents-bulk`,
  `single-type`, `schema-form`, `content-permissions` and `content-mock`, plus the Phase 5 parts of
  `a11y` (axe on every surface in both themes at 1280px and 375px, the list's Tab walk, focus in
  every dialog and the date picker, focus after deletes, no sideways scroll at 375px) and `csp` (the
  list, the open date picker, a detail page with the editor mounted, and the open media picker). Run them with
  `PLAYWRIGHT_BROWSERS_PATH=0`.

## Manual smoke against :8080 (D9)

The planned pass, through `pnpm --filter cms-admin dev` (proxied to :8080) signed in as a
`super_admin`:

- C1, C2 and C3 (the overview, a type page, a column change)
- S1 to S4 on a single type (never saved, save, publish, edit, unpublish)
- D1 to D10 on a collection type, including a date filter and a bulk delete with a failure
- one save for each field type, checking the `MediaAsset` shape and the richtext HTML that comes
  back

Record the requests and results here, and fix any contract mismatch with a test.
