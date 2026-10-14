# UI JSON editor

`JsonInput`, the JSON field control, now a CodeMirror 6 editor loaded lazily. For admin forms that edit JSON.

## Feature

- On the [input contract](./ui-input-contract.md): controlled `value: string` and `onChange(value)` (no `defaultValue`), `disabled`, `readOnly`, `required`, `name`, `id`, `aria-*`, `onBlur`, and one JSON `config` with `expect`, `rows`, `label` (the in-shadow accessible name) and `description`. Extra callbacks: `onValidate(error)` and `onValueChange(parsed)`. The ref exposes `focus()`. In react-hook-form it binds through [`RHFField`](./ui-rhf-field.md), with `rules.validate` built on `parseJson`.
- `React.lazy` loads `JsonCodeEditor`, so `@codemirror/*` is its own chunk; a same-height read-only skeleton shows meanwhile.
- The view mounts in the open shadow root of `<repo-json-editor>` (form-associated, `delegatesFocus`). Styles go into a constructed stylesheet, so the CSP stays `style-src 'self'`. Decision: rejected a per-request nonce because it changes the policy; details in [cms-admin CSP and headers](../../../apps/cms-admin/docs/csp-and-headers.md#json-editor-under-the-csp). Needs constructable stylesheets (Chrome/Edge 73+, Firefox 101+, Safari 16.4+).
- Themed only through `EditorView.theme` and `HighlightStyle` with `var(--token)` colours; the host carries border, focus, invalid and disabled styling via Tailwind.
- Extensions: JSON language, line numbers, bracket matching, auto-closing brackets, history, wrapping. No lint, folding, autocomplete UI or `indentWithTab` (no keyboard trap). `@codemirror/autocomplete` is a dependency only for the bracket closing.
- Accessibility: in-shadow `role="textbox"` with `aria-label`, `aria-invalid`, `aria-required`, `aria-readonly`; `aria-describedby` points at an in-shadow node mirroring description and error; label clicks focus the editor through `ElementInternals.labels`.
- Validation after first blur then on change, same `parseJson` messages, "Format JSON" button.

## Files

| File                                      | Spec                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/forms/JsonInput.tsx`      | Exports `JsonInput`, `JsonInputProps`. Validation, format button, lazy loading and skeleton.                                                                                                 |
| `src/components/forms/JsonCodeEditor.tsx` | Default export `JsonCodeEditor`; exports `JsonCodeEditorHandle`, `JsonCodeEditorProps`. Defines the host element, builds the `EditorView`, applies accessibility attributes.                 |
| `src/lib/jsonEditor.ts`                   | Pure helpers: `shouldValidate`, `canFormat`, `needsExternalSync`, `takeOwnEcho`, `SYNTAX_TOKENS`, `highlightSpec`, `editorThemeSpec`, `disabledThemeSpec`, `editorSizeSpec`. No raw colours. |
| `src/lib/jsonEditorView.ts`               | Exports `editorViewOf`: finds the `EditorView` of a host element (tests and tooling).                                                                                                        |
| `src/lib/json.ts`                         | Exports `parseJson`, `formatJson`, `describeJsonError`, `JsonExpect` and result types.                                                                                                       |

## Testing

`src/components/forms/JsonInput.test.tsx`, `src/components/forms/JsonCodeEditor.test.tsx` (driven through `EditorView` transactions; no `<style>` added to `document`), `src/lib/jsonEditor.test.ts`, `src/lib/json.test.ts`. Browser checks (blur error, object check, Format JSON, Tab and Shift+Tab, highlighting, skeleton height, name and description, label click, read-only and disabled) are story tests on the `Components/JsonInput` story in `e2e/inputs.spec.ts`; the `Playground` story (typing, validation, Format JSON) is covered in `e2e/interact.spec.ts` and the axe matrix in `e2e/a11y.spec.ts`; see [Storybook](./storybook.md). The CSP check stays in cms-admin (`e2e/csp.spec.ts`). Run: `pnpm --filter @repo/form-commons test`, and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter @repo/form-commons test:stories`.

## Related

- [UI design tokens](./ui-design-tokens.md), [UI form components](./ui-form-components.md), [UI testing and guards](./ui-testing-and-guards.md), [Storybook](./storybook.md)
- [cms-admin Schema form](../../../apps/cms-admin/docs/schema-form.md) (`JsonField`)
