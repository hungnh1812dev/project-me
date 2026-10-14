# UI rich text editor

`RichTextEditor`, the Tiptap HTML editor with a formatting toolbar, and the `richtext` rules it uses. For admin forms that edit rich text; cms-admin's `RichTextField` binds it to react-hook-form.

## Feature

- Props: `id` (the editable element), `labelId` (the visible label that names the editor and its toolbar), controlled `value: string` (HTML, `''` when empty), `onChange(html)`, `onBlur`, `onRoundTripLoss(html)`, `readOnly`, `aria-describedby`. The ref exposes `focus()`. It is not on the [input contract](./ui-input-contract.md): no `config`, and the label is outside the component.
- Default export, so a consumer loads it with `React.lazy` and Tiptap and ProseMirror stay in their own chunk. The consumer provides the `Suspense` fallback.
- Node set (D1): paragraph, h2 to h4, bold, italic, strike, inline code, code block, bullet and ordered lists, blockquote and links. No images, raw HTML, hard break, rule, underline or trailing node.
- Links: `http`, `https` and `mailto` only (`isAllowedHref`). The link panel is not a `<form>` (it sits inside forms): Enter applies, Escape closes, an empty URL removes the link, a refused URL shows `LINK_ERROR`.
- Toolbar: one tab stop, moved with the arrow keys, Home and End (roving tabindex), `aria-pressed` per button, and a pointer press keeps the focus in the editor. Hidden when read-only.
- Round trip (D2): after loading, when the editor's HTML differs from `value` beyond formatting-neutral changes (`changesOnRoundTrip`), it calls `onRoundTripLoss` with the HTML it keeps. Showing `ROUND_TRIP_WARNING` is up to the consumer.
- A new `value` from outside (a form reset) replaces the content; echoes of its own edits don't.
- CSP: `injectCSS: false`, so Tiptap adds no `<style>`. The content styles are the `.rich-text` rules in `styles/theme.css`, on semantic tokens.
- Focus: the frame (`data-slot="rich-text-editor"`) draws the focus outline with `focus-within`, around the toolbar and the content.

## Files

| File                                      | Spec                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/forms/RichTextEditor.tsx` | Default export `RichTextEditor`; exports `RichTextEditorHandle`, `RichTextEditorProps`. Toolbar, link panel. The only `@tiptap/*` importer. |
| `src/lib/richtext.ts`                     | Exports `isAllowedHref`, `normalizeRichText`, `changesOnRoundTrip`, `ALLOWED_LINK_PROTOCOLS`, `LINK_ERROR`, `ROUND_TRIP_WARNING`.           |
| `src/styles/theme.css`                    | The `.rich-text` content rules (`@layer components`).                                                                                       |

## Testing

`src/components/forms/RichTextEditor.test.tsx` (toolbar keys, every format, links, round trip, outside value, handle, read-only) and `src/lib/richtext.test.ts`. Stories: `Components/RichTextEditor` `AllStates` (empty, every format, read-only, lost markup with the warning) and `Playground`, plus the RichTextEditor section of the UI kit overview. `e2e/interact.spec.ts` types, applies Bold and adds a link in the Playground; `e2e/a11y.spec.ts` runs axe and the keyboard walk on it and the overview; see [Storybook](./storybook.md). The field, lazy chunk and CSP checks stay in cms-admin (`RichTextField.test.tsx`, `e2e/schema-form.spec.ts`, `e2e/csp.spec.ts`). Run: `pnpm --filter @repo/form-commons test`, and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter @repo/form-commons test:stories`.

## Related

- [UI form components](./ui-form-components.md), [UI design tokens](./ui-design-tokens.md), [Storybook](./storybook.md)
- [cms-admin Schema form](../../../apps/cms-admin/docs/schema-form.md) (`RichTextField`)
