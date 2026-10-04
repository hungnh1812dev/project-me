# Single-type editor

The editor for a single type (one document per type, such as a homepage) at
`/admin/content-types/:slug` (Phase 5). It loads, saves, publishes and unpublishes that one document
with the [Schema form](./schema-form.md).

## Feature

- **Load (S1).** `null` (never saved) shows "Not saved yet" and an empty form.
- **Save (S2)**, gated by `access.update`, creates or updates.
- **Publish (S3)** shows unless the status is `published`; **Unpublish (S4)** unless it is `draft`.
  Both are disabled while the form is dirty ("Save your changes first.").
- Without draft and publish there is no status badge and no publish control.
- The header (title, status badge, audit line, actions) is the shared `EditorHeader`, and leaving a
  dirty form asks first, as in the [Document editor](./document-editor.md).
- A save denied by policy makes the whole form read-only with the reason.

### Decisions

- **Publish needs a clean form**, so what is published is always what is saved.

## Files

| File                                               | Spec                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `src/pages/content-types/SingleTypeEditorPage.tsx` | Default export: S1 to S4 around `SchemaForm` and `EditorHeader`.      |

## Testing

- `src/pages/content-types/SingleTypeEditorPage.test.tsx`.
- `e2e/single-type.spec.ts`: never saved → save → publish → edit (modified) → unpublish, and the
  no-draft-and-publish variant.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/content-types/SingleTypeEditorPage.test.tsx`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/single-type.spec.ts`.

## Related

- [Content data](./content-data.md) (`useSingleType*` hooks)
- [Schema form](./schema-form.md), [Document editor](./document-editor.md) (`EditorHeader`, unsaved guard)
- [Content-type pages](./content-type-pages.md)
