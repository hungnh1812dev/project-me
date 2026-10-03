# Schema form

The schema-driven document form (Phase 5, media preview reworked in Phase 6): `SchemaForm` renders a
content type's fields with react-hook-form, one control per field type, including lazy-loaded rich
text, media with a picker, nested and repeatable components. It also owns the pure field-schema
rules (kinds, labels, widths, entry labels) used by the list and the breadcrumbs.

## Feature

### Form model

`SchemaForm` owns `useForm({ defaultValues: toFormValues(fields, doc), mode: 'onTouched' })` under a
`FormProvider`.

- `toFormValues` / `emptyValues` / `emptyEntry`: numbers and json become text, media becomes
  `MediaAsset | string | null`, booleans default to `false`.
- `toDocumentData(fields, values)` converts back and keeps only schema fields, so a save never sends
  a key the schema lacks; an unknown type's value goes back unchanged.
- `rulesFor(field)`: "Enter a number." (`NUMBER_ERROR`) for non-finite number text.
- Dirty state is `formState.isDirty`, reported through `onDirtyChange`; after a save the form calls
  `reset(toFormValues(saved))`. A 400 shows every `messages` entry in a focused alert at the top and
  keeps the typed values. Read-only mode (`readOnly`, `readOnlyReason`) disables everything with a
  notice.
- `schemaFormContext` passes read-only state, the announcer and field errors to nested controls.

Fields render in `type.fields` order in a 6-column grid from `md` (`widthClass`: `"100%"`, `"50%"`,
`"1/3"`, else full). Labels come from `fieldLabel` ("coverImage" → "Cover image").

| Type                 | Control                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `text`, `number`     | `TextField`, `NumberField` (`Input`, `register`)                                            |
| `boolean`            | `BooleanField` (`Switch` through `Controller`)                                              |
| `json`               | `JsonField` (`JsonInput expect="any"`); invalid text stays visible and blocks the save      |
| `richtext`           | `RichTextField`, lazy-loading `RichTextEditor` (Tiptap) behind a skeleton (D1)              |
| `media`              | `MediaField` plus `MediaPickerDialog` (D4)                                                  |
| `component`          | `ComponentField`: a `fieldset`; below the top level a `details` with an `entryHint` preview |
| repeatable component | `RepeatableField` + `RepeatableEntry` (`useFieldArray`, keyed by `field.id`)               |
| unknown type         | `UnsupportedField`: read-only JSON preview, "Unsupported field type "<type>""               |

- **Repeatables.** Entries are "<Field> item n" with Move up, Move down and Remove; "Add <field>
  item" appends. Focus goes to the new entry after Add, and to the next entry, previous one or Add
  after Remove. Every change is announced. No drag and drop.
- **Richtext (D1, D2).** Paragraphs, h2–h4, bold, italic, strike, inline code, code blocks, lists,
  blockquotes and links (`http`, `https`, `mailto` only, `isAllowedHref`). No images, no raw HTML,
  `injectCSS: false` (CSP). The value is HTML. When the loaded HTML doesn't survive a round trip
  (`changesOnRoundTrip`), the field warns (`ROUND_TRIP_WARNING`) that saving removes it. Only
  `RichTextEditor.tsx` imports `@tiptap/*`, so the editor is its own chunk.
- **Media (D4).** The picker is a searchable radio grid of the M1 assets (arrow keys move, Enter
  selects) with a `FileDropzone` gated by `upload media`; a new upload is selected. A save writes the
  full `MediaAsset`. A `documentId` string is resolved through the cached M1 list (`resolveMedia`);
  unresolved shows "File not found". The picker is not paginated (D8).

### Media field preview (Phase 6, D10)

- A full-width box, 320px tall (`h-80`, `data-slot="media-preview"`), `muted` background, fixed size
  so nothing shifts while loading.
- The asset's full `url` (not `thumbnailUrl`), `object-fit: contain`, `loading="lazy"`, through
  `MediaThumbnail` with `fit="contain"` and `source="url"`, so it keeps the `safeImageSrc` allowlist
  and `referrerPolicy="no-referrer"`. A non-allowlisted URL shows the named placeholder.
- Loading ("Loading file…"), empty ("No file selected.") and missing ("File not found" plus the id)
  use the same box.
- Under it: the file name (truncated, full in `title`), "W × H · size", and the actions: Choose
  (`ImagePlus`, a `GatedButton` with `tooltip`) and Remove (`Trash2`), `size="icon"`, 44px below
  `lg`, accessible names "Choose <label>" / "Remove <label>". After Remove focus moves to Choose and
  "<label> removed." is announced. Read-only shows no actions; no asset shows no details row.

### Field schema rules (`schema.ts`)

`fieldKind`, `isSortableField`, `isListableField`, `filterOperatorsFor` (`RANGE_OPERATORS`,
`EQUALITY_OPERATORS`), `widthClass`, `fieldLabel`, `entryHint`, and `entryLabel` (the first `header`
text field, else the first text field, else `UNTITLED_ENTRY` "Untitled entry"). The list catalog and
the breadcrumbs reuse them.

### Decisions

- **Form state lives in react-hook-form**, never component state; repeatables key by RHF's
  `field.id`, never the index.
- **Tiptap only in one file** so it loads lazily, with styles in `globals.css` on semantic tokens.
- **Saves send the full `MediaAsset`**; a bare `documentId` value is still accepted and resolved
  through the cached M1 list.
- **Known gap P5-SEC-1:** server field names are plain object keys, so a field named `__proto__`
  would be dropped from the save (see [Roadmap](./roadmap.md)).

## Files

| File                                               | Spec                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/components/form/SchemaForm.tsx`               | Exports `SchemaForm`, `SchemaFormProps`. RHF form, grid, 400 alert, read-only mode.   |
| `src/components/form/SchemaField.tsx`              | Exports `SchemaField`, `SchemaFieldProps`. Picks the control for a field type.        |
| `src/components/form/schemaFormContext.ts`         | Exports `SchemaFormContext`, `useSchemaFormReadOnly`, `useSchemaFormAnnounce`, `useFieldError`. |
| `src/components/form/fields/TextField.tsx`         | Exports `TextField`.                                                                  |
| `src/components/form/fields/NumberField.tsx`       | Exports `NumberField`.                                                                |
| `src/components/form/fields/BooleanField.tsx`      | Exports `BooleanField`.                                                               |
| `src/components/form/fields/JsonField.tsx`         | Exports `JsonField`.                                                                  |
| `src/components/form/fields/RichTextField.tsx`     | Exports `RichTextField`: lazy wrapper, round-trip warning.                            |
| `src/components/form/fields/RichTextEditor.tsx`    | The Tiptap editor and toolbar (`RichTextEditorHandle`, `RichTextEditorProps`); the only `@tiptap/*` importer. |
| `src/components/form/fields/MediaField.tsx`        | Exports `MediaField`: preview box, details row, Choose and Remove.                    |
| `src/components/form/fields/MediaPickerDialog.tsx` | Exports `MediaPickerDialog`: searchable radio grid plus upload.                       |
| `src/components/form/fields/ComponentField.tsx`    | Exports `ComponentField`, `ComponentChildren`.                                        |
| `src/components/form/fields/RepeatableField.tsx`   | Exports `RepeatableField`: field array, focus moves, announcements.                   |
| `src/components/form/fields/RepeatableEntry.tsx`   | Exports `RepeatableEntry`, `EntryAction`: one entry with its move and remove actions. |
| `src/components/form/fields/UnsupportedField.tsx`  | Exports `UnsupportedField`.                                                           |
| `src/features/content/schema.ts`                   | Pure field rules: kinds, sort/list/filter rules, widths, labels, entry labels.        |
| `src/features/content/schemaForm.ts`               | Exports `toFormValues`, `emptyValues`, `emptyEntry`, `toDocumentData`, `rulesFor`, `NUMBER_ERROR`, `FormValues`, `FieldRules`. |
| `src/features/content/richtext.ts`                 | Exports `isAllowedHref`, `normalizeRichText`, `changesOnRoundTrip`, `ALLOWED_LINK_PROTOCOLS`, `LINK_ERROR`, `ROUND_TRIP_WARNING`. |
| `src/features/content/mediaValue.ts`               | Exports `isMediaAsset`, `readMediaValue`, `resolveMedia`, `MediaFormValue`, `ResolvedMedia`. |

## Testing

- `SchemaForm.test.tsx`; `fields/fields.test.tsx`, `ComponentField.test.tsx`,
  `RepeatableField.test.tsx`, `RichTextField.test.tsx`, `MediaField.test.tsx`. Controls are tested
  inside a real `useForm` provider.
- `schema.test.ts`, `schemaForm.test.ts`, `richtext.test.ts`, `mediaValue.test.ts`. Branch coverage
  at the end of 5.9: `schema.ts` and `mediaValue.ts` 100%, `richtext.ts` 96.6%, `schemaForm.ts`
  93.2% (bar 90%).
- `e2e/schema-form.spec.ts`: every field kind via `FIELD_SHOWCASE`, repeatables, richtext, media
  picker. `csp.spec.ts` checks the editor and the open picker under the CSP.
- Run: `pnpm --filter cms-admin exec vitest run src/components/form src/features/content/schema` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/schema-form.spec.ts`.

## Related

- [Document editor](./document-editor.md), [Single-type editor](./single-type-editor.md)
- [Documents list](./documents-list.md) (uses `schema.ts`)
- [Settings media](./settings-media.md) (`MediaThumbnail`, `useMediaList`, `useUploadMedia`)
- [Design system](./design-system.md), [CSP and headers](./csp-and-headers.md)
