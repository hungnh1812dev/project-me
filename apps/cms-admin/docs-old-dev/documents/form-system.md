# Form System

`src/components/form/*` — a thin `react-hook-form` wrapper that turns a save/publish workflow (fetch → edit → mutate → toast → refetch) into a declarative `FormProvider`/`FormField` pair, plus the field-type input components schema-driven forms compose from. Consumed by [content-type.md](./content-type.md)'s `ContentTypeBuilder`/`renderSchemaField`, which is the only place these are wired together end-to-end.

## `FormProvider` (`components/form/FormProvider.tsx`)

Not `react-hook-form`'s own `FormProvider` — this one owns the whole fetch/edit/save lifecycle:

- `query` (optional `UseQueryOptions`) seeds initial form values via `useQuery`; if omitted, a no-op disabled query runs instead (`enabled: false`) so the hook count stays stable across renders.
- `values` (optional, external) overrides the query-derived values entirely — used for the "create new" flow where there's no document to fetch yet (see [content-type.md](./content-type.md)'s `ContentTypePanel`).
- `mutationFn` is called with the submitted form values on submit (`methods.handleSubmit(onSubmit)` on a real `<form>`). On success: toasts "Saved", resets the form to the just-saved values (clears dirty state without refetching), invalidates `query.queryKey` if present, and calls `onSuccess`. On error: toasts the API's `error` message or a generic fallback.
- `onDirtyChange` is called on every `isDirty` transition — plumbing for a parent panel to observe form dirtiness without owning the `react-hook-form` instance itself. Currently unused in practice: `ContentTypePanel`'s only consumer of this (the locale-switch-with-unsaved-changes confirmation) was removed along with locale support (see [locales-and-invites.md](./locales-and-invites.md)), so no caller passes it today — the prop stays on `FormProvider`/`ContentTypeBuilder` as ready-to-use plumbing for the next feature that needs it.
- Publishes `{ loading, submitting, isDirty }` via `FormStateContext` so descendants (e.g. the Save button) can react without prop-drilling.

## `FormField` (`components/form/FormField.tsx`)

Wraps a single input, registers it with `react-hook-form` (`register(name)` + `control`), and renders its validation error (looked up via a dot-path walk through `formState.errors`, so nested field names like `seo.title` resolve correctly). Used directly only for the "primitive" input types (text/number/boolean) in `renderSchemaField`; media/richtext/json inputs manage their own `Controller` internally instead (see below) since they need full value objects, not raw DOM event values.

## Inputs (`components/form/inputs/`)

| Component | Backing control | Notes |
|---|---|---|
| `TextInput` | plain `<Input>`/`<Textarea>` (`multiline` prop) | registered via `FormField`, not self-controlled |
| `NumberInput` | plain `<Input type="number">` | registered via `FormField` |
| `BooleanInput` | `Controller` + shadcn `Switch` | self-controlled — a checked/unchecked switch has no natural DOM change event `register()` can bind to |
| `CheckboxInput` | shadcn `Checkbox` passthrough | used by collection list bulk-select, not by schema forms |
| `MediaInput` | `Controller`, opens `MediaLibrary` (see [media.md](./media.md)) in a modal on click | stores the full selected `MediaAsset` object as the field value (not just a URL/id) |
| `RichTextInput` | `Controller` + CKEditor 5 (`ClassicEditor`, GPL license key, curated plugin/toolbar list) | stores HTML string; lazy-loaded (see below) |
| `JsonInput` | `Controller` + CodeMirror (`@uiw/react-codemirror`, JSON language mode) | stores parsed JSON; keeps a local raw-text buffer separate from the committed field value so an invalid-JSON keystroke doesn't get silently discarded — see below |
| `RepeatableComponentField` | `useFieldArray` | renders N collapsible entries of a nested field set (component-type array fields); each entry shows a "hint" preview built from the group's `header`-flagged (or first) text field |

`RichTextInput` and `JsonInput` are `React.lazy`-loaded from `renderSchemaField` (see [content-type.md](./content-type.md)) — CKEditor and CodeMirror are the two heaviest dependencies in this app, so they're kept out of the main bundle until a schema actually uses a `richtext`/`json` field.

**`JsonInput`'s edit-buffer**: on every keystroke it tries `JSON.parse`; on success it commits the parsed value via `field.onChange` and clears the syntax-error message, on failure it sets an error message and calls `field.onChange(undefined)` (which `FormProvider`'s validation rule — `value !== undefined` — turns into a form error) while leaving the visibly-typed invalid text in the editor untouched. An `editCount`/`syncedAt` pair guards against the external `field.value` (e.g. the query refetching after a save) clobbering an in-progress edit that hasn't round-tripped yet.

## `useCmsFormState` (`FormStateContext.tsx`)

Context consumer for `{ loading, submitting, isDirty }`; default value (`{ false, false, false }`) lets it be used safely outside a `FormProvider` (e.g. in tests) without throwing.
