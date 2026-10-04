# UI form components

Generic, data-layer-free form building blocks. Components that need Redux, router or react-hook-form stay in cms-admin.

## Feature

`Field` (label, description, error wiring), `PasswordInput`, `GatedButton` / `GatedMenuItem` (fed a `Decision`), `ConfirmDialog`, `UnsavedChangesDialog`, `SecretReveal`, `FileDropzone`, `DatePicker`, `Pagination`. Behaviour is listed in [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md#shared-package-repoui-phase-6-d1-to-d3). `FileDropzone` keeps its hidden `type="file"` input (shadcn has no file primitive); its uploaded icon uses `text-primary-ink`, since gold is never text.

## Files

| File | Spec |
| ---- | ---- |
| `src/form/Field.tsx` | `Field`: wires label, description, error to one control. |
| `src/form/PasswordInput.tsx` | `PasswordInput` with show/hide toggle. |
| `src/form/GatedButton.tsx` | `GatedButton`: denied is `aria-disabled` with a reason. |
| `src/form/GatedMenuItem.tsx` | `GatedMenuItem`: same for menu items. |
| `src/form/ConfirmDialog.tsx` | `ConfirmDialog` alertdialog. |
| `src/form/UnsavedChangesDialog.tsx` | `UnsavedChangesDialog`. |
| `src/form/SecretReveal.tsx` | `SecretReveal`: one-time secret. |
| `src/form/FileDropzone.tsx` | Exports `FileDropzone`, `FileDropzoneProps`, `FileStatusItem`. |
| `src/form/DatePicker.tsx` | `DatePicker` (Calendar in a Popover). |
| `src/form/Pagination.tsx` | `Pagination`, current page marked in `highlight`. |
| `src/lib/pagination.ts` | Exports `lastPage`, `clampPage`, `pageSlice`. |
| `src/lib/decision.ts` | Exports the `Decision` type. |

## Testing

`src/form/{Field,PasswordInput,ConfirmDialog,UnsavedChangesDialog,SecretReveal,FileDropzone,DatePicker,GatedButton,Pagination}.test.tsx`, `src/lib/pagination.test.ts`. Run: `pnpm --filter @repo/ui test`.

## Related

- [UI primitives](./ui-primitives.md), [UI JSON editor](./ui-json-editor.md)
