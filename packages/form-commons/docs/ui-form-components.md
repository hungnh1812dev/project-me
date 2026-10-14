# UI form components

Generic, data-layer-free form building blocks. Components that need Redux or router stay in cms-admin. The react-hook-form binding is [UI RHF field](./ui-rhf-field.md) (`components/rhf/RHFField`).

## Feature

`Field` (label, description, error wiring), `PasswordInput`, `GatedButton` / `GatedMenuItem` (fed a `Decision`), `ConfirmDialog`, `UnsavedChangesDialog`, `SecretReveal`, `FileDropzone`, `DatePicker`, `Pagination`. `PasswordInput` and `DatePicker` are on the [input contract](./ui-input-contract.md) (controlled `value`/`onChange`, one JSON `config`, no `defaultValue`). Behaviour is listed in [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md#shared-package-repoform-commons-phase-6-d1-to-d3). `FileDropzone` keeps its hidden `type="file"` input (shadcn has no file primitive); its uploaded icon uses `text-primary-ink`, since primary is never text.

## Files

| File                                            | Spec                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/forms/Field.tsx`                | `Field`: wires label, description, error to one control.                                                                                                                        |
| `src/components/forms/PasswordInput.tsx`        | `PasswordInput` with show/hide toggle, on the input contract (`config`: `placeholder`, `autoComplete`; the toggle owns `type` and the trailing slot).                           |
| `src/components/forms/GatedButton.tsx`          | `GatedButton`: denied is `aria-disabled` with a reason.                                                                                                                         |
| `src/components/forms/GatedMenuItem.tsx`        | `GatedMenuItem`: same for menu items.                                                                                                                                           |
| `src/components/forms/ConfirmDialog.tsx`        | `ConfirmDialog` alertdialog.                                                                                                                                                    |
| `src/components/forms/UnsavedChangesDialog.tsx` | `UnsavedChangesDialog`.                                                                                                                                                         |
| `src/components/forms/SecretReveal.tsx`         | `SecretReveal`: one-time secret; a callback ref turns spellcheck off and selects the token on focus (Input takes no native event props).                                        |
| `src/components/forms/FileDropzone.tsx`         | Exports `FileDropzone`, `FileDropzoneProps`, `FileStatusItem`.                                                                                                                  |
| `src/components/forms/DatePicker.tsx`           | `DatePicker` (Calendar in a Popover) on the input contract: `value: Date \| undefined`, `config.locale` / `config.placeholder`, `readOnly`, hidden `name` input (`YYYY-MM-DD`). |
| `src/components/forms/Pagination.tsx`           | `Pagination`, current page marked in `highlight`.                                                                                                                               |
| `src/lib/pagination.ts`                         | Exports `lastPage`, `clampPage`, `pageSlice`.                                                                                                                                   |
| `src/lib/decision.ts`                           | Exports the `Decision` type.                                                                                                                                                    |

## Testing

`src/components/forms/{Field,PasswordInput,ConfirmDialog,UnsavedChangesDialog,SecretReveal,FileDropzone,DatePicker,GatedButton,Pagination}.test.tsx`, `src/lib/pagination.test.ts`. Run: `pnpm --filter @repo/form-commons test`.

## Related

- [UI primitives](./ui-primitives.md), [UI JSON editor](./ui-json-editor.md), [UI input contract](./ui-input-contract.md), [UI RHF field](./ui-rhf-field.md)
