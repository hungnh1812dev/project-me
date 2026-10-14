# @repo/form-commons docs

The shared shadcn (Base UI) primitives, generic form components, JSON and rich text editors and design tokens used by `apps/cms-admin` and `apps/frontend`. The admin-facing description of the design system is in [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md).

| Module                                              | Scope                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [UI design tokens](./ui-design-tokens.md)           | `theme.css` and `tokens.ts`: Strapi palette, `primary-ink`, contrast data                                                 |
| [UI input contract](./ui-input-contract.md)         | `lib/inputContract`: controlled value props, JSON-only `config` types per input, `isJsonConfig` guard                     |
| [UI primitives](./ui-primitives.md)                 | `components/ui/*` (button variants, checkbox, radio group, badge, switch, calendar, ...), `cn`, sidebar hooks             |
| [UI form components](./ui-form-components.md)       | `components/forms/*`: `Field`, dialogs, gated controls, dropzone, pagination and their pure helpers                       |
| [UI JSON editor](./ui-json-editor.md)               | `components/forms/JsonInput` on CodeMirror 6 in a shadow root, `JsonCodeEditor`, pure editor helpers                      |
| [UI rich text editor](./ui-rich-text-editor.md)     | `components/forms/RichTextEditor` on Tiptap (toolbar, links, round-trip check), `lib/richtext`, `.rich-text` styles       |
| [UI RHF field](./ui-rhf-field.md)                   | `components/rhf/RHFField`: `Field` bound to react-hook-form via `useController`, render-prop children typed from `name`   |
| [UI testing and guards](./ui-testing-and-guards.md) | Vitest setup and polyfills, palette, primary-border, primary-text, raw-control and boundary guards                        |
| [Storybook](./storybook.md)                         | `.storybook/*`, `src/stories/**`, Playwright story tests in `e2e/`, and the mapping of the removed cms-admin UI kit tests |
