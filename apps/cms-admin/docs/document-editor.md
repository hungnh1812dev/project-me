# Document editor

The create and detail pages for one collection entry (Phase 5): `/admin/content-types/:slug/new` and
`/admin/content-types/:slug/:documentId`, with save, publish, unpublish, duplicate and delete, the
shared editor header, and the unsaved-changes guard. For editors writing a single entry.

## Feature

### Create (`:slug/new`, D2)

Collection only; a single type redirects to `:slug`. Without `access.create` the page redirects to
`/403` with the reason. An empty form (`emptyValues`); Save (gated by `create`) sends D2, replaces
the URL with the new entry's page and announces "Entry created.". Cancel goes back to the list.

### Detail (`:slug/:documentId`)

- D3 loads the entry; 404 shows "This entry doesn't exist or was deleted.", 403 the no-access state.
- The header has Save (D4, `access.update`), Publish or Unpublish (D6, D7), Duplicate (D8,
  `access.create`, opens the copy, "Copy created.") and Delete (D5, confirmed `Delete "<label>"?`,
  then the list with "Entry deleted.").
- Below `sm` the actions sit in a bottom bar fixed to the viewport with Duplicate, Unpublish and
  Delete in "More actions"; the page reserves room so the bar never covers the last field.
- Breadcrumbs and `document.title` end with the entry label (see [App shell](./app-shell.md)).

### Editor header

`EditorHeader` renders the title, the `StatusBadge` (only with draft and publish), the audit line
(`EditorAudit`: updated by and when) and the actions, collapsing into "More actions" on small
screens. The [Single-type editor](./single-type-editor.md) uses it too.

### Leaving with unsaved changes (D10)

`useUnsavedChangesGuard(dirty)` blocks in-app navigation with `useBlocker` and shows
`UnsavedChangesDialog` ("Discard unsaved changes?": Cancel stays, Discard leaves), and arms
`beforeunload` only while dirty. A just-saved form leaves without asking.

### Gating

| Control                        | Decision                                   |
| ------------------------------ | ------------------------------------------ |
| Save (detail)                  | `access.update`                            |
| Save (create page)             | `access.create`                            |
| Duplicate                      | `access.create`                            |
| Delete                         | `access.delete`                            |
| Publish, Unpublish             | `access.publish`, `access.unpublish`       |
| Media Choose, Upload in picker | `useCan('read', 'media')`, `('upload', …)` |

A denied control sends nothing. A server 403 shows "You don't have access to do this." where the
action started (`actionErrorText`).

### Decisions

- **Create is guarded at the route level** (redirect to `/403`), because a page with nothing to save
  is pointless; the detail page stays readable when `update` is denied (read-only form).
- **The guard arms `beforeunload` only while dirty**, so a clean page never shows the browser prompt.

### Manual smoke against :8080 (D9)

**Pending (2026-10-03, no `super_admin` credentials).** The field value shapes, the `MediaAsset`
value, the richtext HTML, the 400 wording, the status transitions and the date filter format are
checked only against the legacy docs and the e2e mock; Phase 5 stays IN REVIEW. Planned pass through
the dev proxy as `super_admin`: C1–C3; S1–S4 on a single type; D1–D10 on a collection including a
date filter and a bulk delete with a failure; one save per field type checking the returned
`MediaAsset` and richtext HTML. Record results here and fix mismatches with a test.

## Files

| File                                             | Spec                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/pages/content-types/DocumentCreatePage.tsx` | Default export: D2 create page with route-level create check.               |
| `src/pages/content-types/DocumentDetailPage.tsx` | Default export: D3 to D8 for one entry, mobile action bar.                  |
| `src/pages/content-types/editor/EditorHeader.tsx`| Exports `EditorHeader`, `StatusBadge`, `EditorAudit`, `EditorHeaderProps`.   |
| `src/features/content/hooks/useUnsavedChangesGuard.ts` | Exports `useUnsavedChangesGuard`, `UnsavedChangesGuard`. Blocker plus `beforeunload`. |

## Testing

- `DocumentCreatePage.test.tsx`, `DocumentDetailPage.test.tsx`, `gating.test.tsx` (the gating
  matrix, AC-32, including the media picker) in `src/pages/content-types/`;
  `src/features/content/hooks/useUnsavedChangesGuard.test.tsx`.
- `e2e/documents-detail.spec.ts`: create, save, publish, duplicate, delete, 404, unsaved-changes
  dialog, entry breadcrumbs and titles. `a11y.spec.ts` covers focus in every dialog; `csp.spec.ts`
  a detail page with the editor mounted.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/content-types/DocumentCreatePage.test.tsx src/pages/content-types/DocumentDetailPage.test.tsx src/pages/content-types/gating.test.tsx`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/documents-detail.spec.ts`.

## Related

- [Schema form](./schema-form.md)
- [Content data](./content-data.md), [Content-type pages](./content-type-pages.md)
- [Documents list](./documents-list.md), [Single-type editor](./single-type-editor.md)
- [Design system](./design-system.md) (`UnsavedChangesDialog`, `ConfirmDialog`)
