# Design system

The admin's styling stack, tokens, theme and base inputs (Phase 3). Everything lives in `apps/cms-admin`. `@repo/ui` stays empty.

Source: `src/styles/{globals.css,tokens.ts}`, `src/features/theme/`, `public/theme-init.js`, `src/components/ui/`, `src/components/form/`, `src/utils/{cn,json}.ts`, `components.json`, `src/pages/dev/UiKitPage.tsx`.

## Styling decision

This closes roadmap deferred question 2.

| Concern        | Choice                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| CSS            | Tailwind CSS v4 through `@tailwindcss/vite`. Tokens are CSS variables, mapped to utilities by `@theme inline` |
| Components     | shadcn/ui in the Base UI flavour (`style: base-nova`), on `@base-ui/react`, vendored in `src/components/ui`   |
| Variants       | `class-variance-authority`. Classes always go through `cn()` (`clsx` + `tailwind-merge`, `src/utils/cn.ts`)   |
| Animation      | `tw-animate-css`. `prefers-reduced-motion: reduce` turns transitions and animations off globally              |
| Icons          | `lucide-react`, imported by name. Decorative icons get `aria-hidden`; icon-only buttons get `aria-label`      |
| Fonts          | Fira Sans (400, 500, 600) and Fira Code, self-hosted through `@fontsource`. No font CDN                       |
| Visual         | Minimal / Swiss, dense. Slate neutrals and one indigo accent (indigo-600 light, indigo-400 dark)              |
| Shared package | None. The primitives stay app-local until a second app needs them                                             |

Two deviations from the spec's stack table:

- **Fira Sans is `@fontsource/fira-sans`, not `@fontsource-variable/fira-sans`.** Fira Sans has no variable build on Fontsource, so the static package is used with only the three weights the UI needs (`400.css`, `500.css`, `600.css`). Fira Code does have one: `@fontsource-variable/fira-code`.
- **The primitives are hand-written, not generated.** The shadcn CLI could not be used in this repo, so each file in `src/components/ui` was written by hand from the shadcn Base UI (`base-nova`) source and then adapted (arrow components with `displayName`, `cn` from `@/utils/cn`, 44px touch targets below `lg`). `components.json` is kept so the CLI can be used later.

## Tokens

`src/styles/globals.css` defines the semantic tokens on `:root` (light) and `.dark`, and `@theme inline` maps them to Tailwind colours (`bg-background`, `text-muted-foreground`, `border-input`, `ring-ring`, `bg-sidebar`, …).

| Group    | Tokens                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Surfaces | `background`, `card`, `popover`, `muted`, `secondary`, `accent`, `sidebar` (each with a `-foreground` pair) |
| Accent   | `primary`, `ring`, `sidebar-primary`, `sidebar-ring`                                                        |
| Status   | `destructive`, `success`, `warning` (each with a `-foreground` pair)                                        |
| Lines    | `border`, `input` (control borders, slate-500 in both themes so they reach 3:1), `sidebar-border`           |
| Other    | `--radius` (0.5rem, with `radius-sm` to `radius-xl`), `--font-sans` / `--font-mono`, `--motion-duration-*`  |

Rules:

- Components use semantic token classes only. No raw hex values and no palette classes (`bg-slate-100`) in components.
- `src/styles/tokens.ts` mirrors the colours. `tokens.test.ts` checks that the two stay in sync, that every text pair reaches 4.5:1, and that control boundaries and focus rings reach 3:1, in both themes.
- Focus: `:focus-visible` draws a 2px `ring`-coloured outline with a 2px offset on every element. Primitives may add their own ring on top. Only `main` and the page `<h1>`, which receive programmatic focus after navigation, drop the outline.

## Theme

- **Choices:** Light, Dark or System (the default). The user picks one in the header's account menu (see [App shell](./app-shell.md)).
- **Storage:** `localStorage['cms-admin:theme']` (`THEME_STORAGE_KEY`). A missing, invalid or unreadable value means System.
- **Logic:** `src/features/theme/theme.ts` is pure: `resolveTheme(stored, systemDark)` (an explicit light or dark wins, otherwise the OS setting), `readStoredTheme()`, `writeStoredTheme()`, and `applyTheme(resolved)`, which toggles `.dark` and sets `color-scheme` on `<html>`.
- **Pre-paint:** `public/theme-init.js` is an external ES5 script that `index.html` loads before the module script. It applies the same rule before React mounts, so there is no flash of the wrong theme. It is not inline, because of the future CSP (SEC-4). A unit test runs it in jsdom against the `resolveTheme` truth table, so the two cannot drift.
- **Runtime:** `ThemeProvider` (in `AppProvider`) takes over after mount. It follows OS changes live while the choice is System. `useTheme()` returns `{ choice, resolved, setChoice }`.
- Every storage access goes through `src/features/shell/storage.ts` (`readStorage`, `writeStorage`). Both are wrapped in try/catch, and a failed write is kept in memory for the session.

## Primitives (`src/components/ui`)

`alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar` (with `use-sidebar.ts`), `skeleton`, `switch`, `table`, `textarea`, `tooltip`, and `variants.ts` (`buttonVariants`, `controlClasses`). This folder is excluded from coverage. Behaviour that we own goes in `src/components/form` or `src/utils`, which stay under the coverage gates.

Controls are 44px tall below `lg` (1024px) and compact (32 to 40px) above it.

## Inputs

| Component       | Where                    | API and states                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | `ui/button.tsx`          | `variant`: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`. `size`: `sm`, `default`, `lg`, `icon`. `type` defaults to `button`. `loading` shows a spinner, keeps the width and sets `aria-busy` and `aria-disabled` (it stays focusable). `render={<Link to="…" />}` renders a link with button styles and link semantics. In dev, an `icon` button without `aria-label` logs a warning. |
| `Input`         | `ui/input.tsx`           | `type`: `text`, `email`, `password`, `search`, `url`, `tel`, `number`. `leading` (a decorative icon) and `trailing` (a control) slots.                                                                                                                                                                                                                                                                     |
| `PasswordInput` | `form/PasswordInput.tsx` | An `Input` with a Show/Hide password toggle (`aria-label`, `aria-pressed`).                                                                                                                                                                                                                                                                                                                                |
| `Textarea`      | `ui/textarea.tsx`        | With `maxLength` it shows a live "n / max" count, linked through `aria-describedby`. The count turns `warning` at 90% and is announced at the limit.                                                                                                                                                                                                                                                       |
| `JsonInput`     | `form/JsonInput.tsx`     | Monospace, dependency-free. Props: `value` / `defaultValue` (text), `onChange(text)`, `onValidate(error \| null)`, `onValueChange(parsed \| undefined)`, `expect` (`object`, `array`, `any`), `required`, `disabled`. A "Format JSON" button pretty-prints valid text.                                                                                                                                     |
| `Switch`        | `ui/switch.tsx`          | Base UI Switch as a native `<button role="switch">`, so `Field`'s label names and toggles it. Controlled (`checked`, `onCheckedChange(checked)`) or uncontrolled (`defaultChecked`). `name` and `value` submit through a hidden input. Space toggles it.                                                                                                                                                   |
| `Checkbox`      | `ui/checkbox.tsx`        | Base UI checkbox, used with a `Label` (for example "Remember me").                                                                                                                                                                                                                                                                                                                                         |

Phase 4 added the dialog primitives and the settings form components. Their full behaviour is in [Settings](./settings.md#primitives-and-form-components).

| Component        | Where                     | API and states                                                                                                                                                                                      |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog`         | `ui/dialog.tsx`           | Modal with `aria-modal="true"`, a labelled title, focus moved inside, trapped and returned to the trigger. `DialogContent` can show an icon-only Close.                                             |
| `AlertDialog`    | `ui/alert-dialog.tsx`     | The same parts with `role="alertdialog"` and no outside-click dismissal.                                                                                                                            |
| `Select`         | `ui/select.tsx`           | Base UI Select. Put `SelectTrigger` inside a `Field` for its label and `aria-*` wiring.                                                                                                             |
| `ConfirmDialog`  | `form/ConfirmDialog.tsx`  | An `alertdialog` that names its target, with a destructive verb button, Cancel focused first, `loading` while `onConfirm` runs (no second submit, no dismissal), an `error` slot and `hideConfirm`. |
| `GatedButton`    | `form/GatedButton.tsx`    | A `Button` fed a `useCan` decision. Denied: `aria-disabled="true"`, still focusable, the reason in a tooltip and `aria-describedby`, and clicks, Enter and form submission ignored.                 |
| `PermissionTree` | `form/PermissionTree.tsx` | Native checkboxes grouped by resource (content-type sub-groups under `document`), tri-state group boxes, a filter, Select all, and loading, error, empty and read-only states.                      |
| `SecretReveal`   | `form/SecretReveal.tsx`   | An `alertdialog` for a one-time secret: read-only monospace input, Copy (announces "Copied." or the manual fallback) and Done. Escape and outside clicks do not close it.                           |
| `FileDropzone`   | `form/FileDropzone.tsx`   | A visible Upload `GatedButton` that opens a hidden file input, plus a drop zone, and an "Upload progress" list with each file's state in text.                                                      |

Every input supports the default, filled, disabled, invalid (`aria-invalid`, destructive border) and required states. The [UI kit](./app-shell.md#ui-kit-route) shows all of them.

### Field

`Field` (`src/components/form/Field.tsx`) wraps exactly one control and wires the label, description and error. Every input goes in a `Field`, or gets an explicit accessible name. Placeholder-only labels are not allowed.

```tsx
<Field label="Metadata" description="Any valid JSON." error={jsonError} required>
  <JsonInput value={text} onChange={setText} onValidate={setJsonError} />
</Field>
```

- Props: `label` (required), `hideLabel` (screen-reader only), `description`, `error`, `required`, `id`, `className`.
- The control id is the control's own `id`, then `id`, then a generated one. The label points at it with `htmlFor`.
- `aria-describedby` lists the description, then the error. An error also sets `aria-invalid` and renders under the control with `role="alert"`.
- `required` sets `required` and `aria-required`, and the label shows a red `*` as CSS content with empty alt text, so the mark is not part of the accessible name.

### JsonInput behaviour

- It does not validate while the user types until the first blur. After that it validates on every change.
- `parseJson(text, { required, expect })` in `src/utils/json.ts` is pure. Empty text is valid (`value: undefined`) unless `required`. A syntax error becomes "Invalid JSON: <reason> (line L, column C)". The line and column come from the engine message (V8, Firefox and Safari wording) and are left out when the engine gives no position. A kind mismatch gives "Expected a JSON object." or "Expected a JSON array."
- `formatJson` pretty-prints with two spaces. "Format JSON" is disabled while the text is empty, invalid or disabled.

## Adding a shadcn component

1. Run the CLI inside `apps/cms-admin` if it works there: `pnpm dlx shadcn@latest add <name>`. It reads `components.json` (Base UI, `base-nova`, aliases `@/components`, `@/utils/cn`, `@/hooks`). Otherwise, copy the Base UI source for the component from the shadcn registry by hand.
2. Review the file before committing. Imports must use `@/utils/cn`, not `@/lib/utils`. Use arrow components with `displayName`, semantic token classes only, and keep the focus ring. Check that the CLI did not touch `tsconfig`, `vite.config.ts` or `globals.css`.
3. If the component has behaviour of our own, put that in `src/components/form` (under the coverage gates) and keep the `ui` file a thin primitive.
4. Add it to the UI kit page and, if it is user-visible, to `e2e/a11y.spec.ts` through a page that uses it.
