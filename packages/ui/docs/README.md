# @repo/ui docs

The shared shadcn (Base UI) primitives, generic form components, JSON editor and design tokens used by `apps/cms-admin` and `apps/frontend`. The admin-facing description of the design system is in [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md).

| Module | Scope |
| ------ | ----- |
| [UI design tokens](./ui-design-tokens.md) | `theme.css` and `tokens.ts`: luxury palette, `primary-ink`, contrast data |
| [UI primitives](./ui-primitives.md) | `components/*` (button variants, checkbox, radio group, badge, switch, calendar, ...), `cn`, sidebar hooks |
| [UI form components](./ui-form-components.md) | `Field`, dialogs, gated controls, dropzone, pagination and their pure helpers |
| [UI JSON editor](./ui-json-editor.md) | `JsonInput` on CodeMirror 6 in a shadow root, `JsonCodeEditor`, pure editor helpers |
| [UI testing and guards](./ui-testing-and-guards.md) | Vitest setup and polyfills, palette, gold-border, gold-text, raw-control and boundary guards |
