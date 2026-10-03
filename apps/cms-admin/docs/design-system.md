# Design system

The admin's styling stack, tokens, theme and base inputs. Phase 3 built them inside `apps/cms-admin`. Phase 6 moved the primitives, the generic form components and the theme into the shared package `@repo/ui` (`packages/ui`), so `apps/frontend` can reuse them, and refreshed the palette.

Source:

- `@repo/ui` (`packages/ui/src`): `components/` (primitives), `form/` (generic form components), `hooks/` (`use-mobile`, `use-sidebar`), `lib/` (`cn`, `json`, `decision`, `pagination`), `styles/{theme.css,tokens.ts}`, and `packages/ui/components.json`.
- cms-admin: `src/styles/globals.css`, `src/features/theme/`, `public/theme-init.js`, `src/components/form/` (the admin-data form components), `src/pages/dev/UiKitPage.tsx`.

## Styling decision

Phase 3 closed roadmap deferred question 2 with an app-local design system. Phase 6 reversed its "no shared package" part (decision D1 to D3 below), and closed deferred questions 3 to 5.

| Concern        | Choice                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| CSS            | Tailwind CSS v4 through `@tailwindcss/vite`. Tokens are CSS variables, mapped to utilities by `@theme inline` |
| Components     | shadcn/ui in the Base UI flavour (`style: base-nova`), on `@base-ui/react`, vendored in `@repo/ui`            |
| Variants       | `class-variance-authority`. Classes always go through `cn()` (`clsx` + `tailwind-merge`, `@repo/ui/lib/cn`)   |
| Animation      | `tw-animate-css`. `prefers-reduced-motion: reduce` turns transitions and animations off globally              |
| Icons          | `lucide-react`, imported by name. Decorative icons get `aria-hidden`; icon-only buttons get `aria-label`      |
| Fonts          | Fira Sans (400, 500, 600) and Fira Code, self-hosted through `@fontsource`. No font CDN. Fonts stay per app   |
| Visual         | Minimal / Swiss, dense. Slate neutrals, a violet primary and an orange highlight (see [Palette](#palette))    |
| Shared package | `@repo/ui` (see [Shared package](#shared-package-repoui))                                                     |

Two deviations from the spec's stack table:

- **Fira Sans is `@fontsource/fira-sans`, not `@fontsource-variable/fira-sans`.** Fira Sans has no variable build on Fontsource, so the static package is used with only the three weights the UI needs (`400.css`, `500.css`, `600.css`). Fira Code does have one: `@fontsource-variable/fira-code`.
- **The primitives are hand-written, not generated.** The shadcn CLI could not be used in this repo, so each primitive was written by hand from the shadcn Base UI (`base-nova`) source and then adapted (arrow components with `displayName`, `cn` from the package's `lib/cn`, 44px touch targets below `lg`). `components.json` (now in `packages/ui`) is kept so the CLI can be used later.

## Shared package (`@repo/ui`)

Decisions D1 to D3 of Phase 6:

- **D1 Package.** `packages/ui` is `@repo/ui`: `private`, ESM, and shipped as TypeScript source with no build step. Each consumer's bundler compiles it (Vite in cms-admin, `transpilePackages: ['@repo/ui']` in frontend). cms-admin and frontend depend on it with `workspace:*`.
- **Exports.** Subpaths only, no barrel: `@repo/ui/components/*`, `@repo/ui/form/*`, `@repo/ui/hooks/*`, `@repo/ui/lib/*`, `@repo/ui/styles/theme.css` and `@repo/ui/styles/tokens`. Apps import each module directly, for example `import { Button } from '@repo/ui/components/button'`. There are no re-export shims in the apps.
- **D2 Tailwind v4 sharing.** `@repo/ui/styles/theme.css` holds the semantic tokens for `:root` and `.dark`, `@custom-variant dark`, the `@theme inline` mapping, the radius and motion tokens, the global `:focus-visible` rule and the reduced-motion rule. Each app's global CSS imports it and adds `@source '../../../../packages/ui/src'`, because Tailwind does not scan the package through `node_modules`. Fonts, the `body` font settings, the `main`/`h1` focus exception and the `.rich-text` styles stay in cms-admin's `globals.css`.
- **D3 Form component split.** Only generic components moved to `src/form`: `Field`, `PasswordInput`, `JsonInput`, `DatePicker`, `ConfirmDialog`, `UnsavedChangesDialog` (it takes a structural prop type, not the admin's guard), `SecretReveal`, `GatedButton`, `GatedMenuItem`, `FileDropzone` and, from Phase 6, `Pagination`. `SchemaForm`, `SchemaField`, `schemaFormContext`, `PermissionTree` and `fields/` (including `MediaField` and `MediaPickerDialog`) use the admin's data layer, so they stay in `apps/cms-admin/src/components/form`. The package exports `Decision { allowed: boolean; reason: string | null }` (`lib/decision`), and the admin's `policies.ts` uses it.
- **Boundaries, checked by unit tests in the package.** `boundaries.test.ts` fails if any file under `src` imports through `@/`, from an `apps/*` path, or from `react-router*`, `axios`, `@reduxjs/*`, `react-redux`, `@tanstack/*` or `react-hook-form`, and if a `.tsx` module in `src/components` or `src/form` does not start with `'use client'` (needed by Next's App Router). Package code uses relative imports.
- **Frontend.** Wiring only for now: the dependency, `transpilePackages` and the theme import in `src/app/globals.css`. `apps/frontend/src/ui-compile-check.ts` re-exports every package entry, so frontend's TypeScript 5 typechecks the package too. Add each new entry there. Frontend's dark mode is still media-query based; it does not use the `.dark` switch yet.
- **Tests and coverage.** `pnpm --filter @repo/ui test` (and `test:cov`) runs the package tests, and the root `pnpm test` includes them. `src/components/**` is excluded from coverage. `src/form/**/*.tsx` is held at 70%, and `src/lib/**/*.ts` and `src/styles/tokens.ts` at 85% (lines, statements, functions and branches).

## Tokens

`@repo/ui/styles/theme.css` defines the semantic tokens on `:root` (light) and `.dark`, and `@theme inline` maps them to Tailwind colours (`bg-background`, `text-muted-foreground`, `border-input`, `ring-ring`, `bg-sidebar`, `bg-highlight`, …).

| Group     | Tokens                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Surfaces  | `background`, `card`, `popover`, `muted`, `secondary`, `accent`, `sidebar` (each with a `-foreground` pair) |
| Accent    | `primary`, `ring`, `sidebar-primary`, `sidebar-ring`                                                        |
| Highlight | `highlight`, `highlight-foreground`                                                                         |
| Status    | `destructive`, `success`, `warning` (each with a `-foreground` pair)                                        |
| Lines     | `border`, `input` (control borders, slate-500 in both themes so they reach 3:1), `sidebar-border`           |
| Other     | `--radius` (0.5rem, with `radius-sm` to `radius-xl`), `--font-sans` / `--font-mono`, `--motion-duration-*`  |

Rules:

- Components use semantic token classes only. No raw hex values and no palette classes (`bg-slate-100`, `text-violet-600`) in components. `packages/ui/src/palette.test.ts` scans every `.tsx` file in `packages/ui/src` and `apps/cms-admin/src` and fails on either.
- `@repo/ui/styles/tokens.ts` mirrors the colours. `tokens.test.ts` reads `theme.css` and checks that the two stay in sync, that every text pair reaches 4.5:1 (including `highlight-foreground` on `highlight`, and `highlight` on `background` and `card`), and that control boundaries and focus rings reach 3:1, in both themes.
- Focus: `:focus-visible` draws a 2px `ring`-coloured outline with a 2px offset on every element. Primitives may add their own ring on top. Only `main` and the page `<h1>`, which receive programmatic focus after navigation, drop the outline.

## Palette

Phase 6 (D9) replaced the indigo accent with a young, energetic violet and added an orange highlight. The neutral, status and line tokens stay on slate.

| Token                                                | Light                | Dark                 |
| ---------------------------------------------------- | -------------------- | -------------------- |
| `primary`, `ring`, `sidebar-primary`, `sidebar-ring` | violet-600 `#7c3aed` | violet-400 `#a78bfa` |
| `primary-foreground`, `sidebar-primary-foreground`   | white `#ffffff`      | slate-950 `#020617`  |
| `highlight`                                          | orange-700 `#c2410c` | orange-400 `#fb923c` |
| `highlight-foreground`                               | white `#ffffff`      | slate-950 `#020617`  |

The primary keeps its roles: primary buttons, links, the focus ring, the checked checkbox and switch, and the selected calendar day. The highlight is used only in four places:

- the active sidebar item's indicator bar (`data-active:before:bg-highlight` in `SidebarMenuButton`)
- the current-page marker in `Pagination`
- the `highlight` `Badge` variant
- the UI kit swatches

Use it sparingly. A new use needs the same contrast checks and a reason it is not `primary`.

## Theme

- **Choices:** Light, Dark or System (the default). The user picks one in the header's account menu (see [App shell](./app-shell.md)).
- **Storage:** `localStorage['cms-admin:theme']` (`THEME_STORAGE_KEY`). A missing, invalid or unreadable value means System.
- **Logic:** `src/features/theme/theme.ts` is pure: `resolveTheme(stored, systemDark)` (an explicit light or dark wins, otherwise the OS setting), `readStoredTheme()`, `writeStoredTheme()`, and `applyTheme(resolved)`, which toggles `.dark` and sets `color-scheme` on `<html>`.
- **Pre-paint:** `public/theme-init.js` is an external ES5 script that `index.html` loads before the module script. It applies the same rule before React mounts, so there is no flash of the wrong theme. It is not inline, because of the future CSP (SEC-4). A unit test runs it in jsdom against the `resolveTheme` truth table, so the two cannot drift.
- **Runtime:** `ThemeProvider` (in `AppProvider`) takes over after mount. It follows OS changes live while the choice is System. `useTheme()` returns `{ choice, resolved, setChoice }`.
- Every storage access goes through `src/features/shell/storage.ts` (`readStorage`, `writeStorage`). Both are wrapped in try/catch, and a failed write is kept in memory for the session.

## Primitives (`@repo/ui/components`)

`alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `sidebar` (with `hooks/use-sidebar.ts`), `skeleton`, `switch`, `table`, `textarea`, `tooltip`, and `variants.ts` (`buttonVariants`, `controlClasses`). This folder is excluded from coverage. Behaviour that we own goes in the package's `src/form` or `src/lib`, which stay under the coverage gates. The tests for the behaviour we added to primitives (Badge, Button, Input, SidebarMenuButton, Switch, Textarea) live in `src/form/__tests__`.

Controls are 44px tall below `lg` (1024px) and compact (32 to 40px) above it.

## Inputs

In the tables below, a **Where** path is relative to `packages/ui/src` (import it as `@repo/ui/<path without .tsx>`). A path marked _admin_ is in `apps/cms-admin/src/components`.

| Component       | Where                     | API and states                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | `components/button.tsx`   | `variant`: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`. `size`: `sm`, `default`, `lg`, `icon`. `type` defaults to `button`. `loading` shows a spinner, keeps the width and sets `aria-busy` and `aria-disabled` (it stays focusable). `render={<Link to="…" />}` renders a link with button styles and link semantics. In dev, an `icon` button without `aria-label` logs a warning. |
| `Input`         | `components/input.tsx`    | `type`: `text`, `email`, `password`, `search`, `url`, `tel`, `number`. `leading` (a decorative icon) and `trailing` (a control) slots.                                                                                                                                                                                                                                                                     |
| `PasswordInput` | `form/PasswordInput.tsx`  | An `Input` with a Show/Hide password toggle (`aria-label`, `aria-pressed`).                                                                                                                                                                                                                                                                                                                                |
| `Textarea`      | `components/textarea.tsx` | With `maxLength` it shows a live "n / max" count, linked through `aria-describedby`. The count turns `warning` at 90% and is announced at the limit.                                                                                                                                                                                                                                                       |
| `JsonInput`     | `form/JsonInput.tsx`      | Monospace, dependency-free. Props: `value` / `defaultValue` (text), `onChange(text)`, `onValidate(error \| null)`, `onValueChange(parsed \| undefined)`, `expect` (`object`, `array`, `any`), `required`, `disabled`. A "Format JSON" button pretty-prints valid text.                                                                                                                                     |
| `Switch`        | `components/switch.tsx`   | Base UI Switch as a native `<button role="switch">`, so `Field`'s label names and toggles it. Controlled (`checked`, `onCheckedChange(checked)`) or uncontrolled (`defaultChecked`). `name` and `value` submit through a hidden input. Space toggles it.                                                                                                                                                   |
| `Checkbox`      | `components/checkbox.tsx` | Base UI checkbox, used with a `Label` (for example "Remember me").                                                                                                                                                                                                                                                                                                                                         |

Phase 4 added the dialog primitives and the settings form components. Their full behaviour is in [Settings](./settings.md#primitives-and-form-components).

| Component        | Where                             | API and states                                                                                                                                                                                      |
| ---------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog`         | `components/dialog.tsx`           | Modal with `aria-modal="true"`, a labelled title, focus moved inside, trapped and returned to the trigger. `DialogContent` can show an icon-only Close.                                             |
| `AlertDialog`    | `components/alert-dialog.tsx`     | The same parts with `role="alertdialog"` and no outside-click dismissal.                                                                                                                            |
| `Select`         | `components/select.tsx`           | Base UI Select. Put `SelectTrigger` inside a `Field` for its label and `aria-*` wiring.                                                                                                             |
| `ConfirmDialog`  | `form/ConfirmDialog.tsx`          | An `alertdialog` that names its target, with a destructive verb button, Cancel focused first, `loading` while `onConfirm` runs (no second submit, no dismissal), an `error` slot and `hideConfirm`. |
| `GatedButton`    | `form/GatedButton.tsx`            | A `Button` fed a `useCan` decision. Denied: `aria-disabled="true"`, still focusable, the reason in a tooltip and `aria-describedby`, and clicks, Enter and form submission ignored.                 |
| `PermissionTree` | _admin_ `form/PermissionTree.tsx` | Native checkboxes grouped by resource (content-type sub-groups under `document`), tri-state group boxes, a filter, Select all, and loading, error, empty and read-only states.                      |
| `SecretReveal`   | `form/SecretReveal.tsx`           | An `alertdialog` for a one-time secret: read-only monospace input, Copy (announces "Copied." or the manual fallback) and Done. Escape and outside clicks do not close it.                           |
| `FileDropzone`   | `form/FileDropzone.tsx`           | A visible Upload `GatedButton` that opens a hidden file input, plus a drop zone, and an "Upload progress" list with each file's state in text.                                                      |

Phase 5 added the document form and the date picker. Their full behaviour is in [Documents UI](./documents-ui.md).

| Component              | Where                           | API and states                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Calendar`             | `components/calendar.tsx`       | Vendored shadcn calendar on `react-day-picker` 10 (`mode="single"`): semantic tokens, 44px day buttons below `lg`, arrow-key navigation, no inline styles.                                                                                                                                                              |
| `Popover`              | `components/popover.tsx`        | Vendored Base UI popover: `Popover`, `PopoverTrigger`, `PopoverContent` (with `initialFocus`), `PopoverTitle`, `PopoverClose`.                                                                                                                                                                                          |
| `DatePicker`           | `form/DatePicker.tsx`           | A `Field` control: a trigger showing the day (`Intl.DateTimeFormat`), the `Calendar` in a `Popover` with focus on the selected day or today, a Close button, and Clear date. Picking closes; Escape and Close close without a change; focus returns to the trigger. Tab stays inside while open (`modal="trap-focus"`). |
| `SchemaForm`           | _admin_ `form/SchemaForm.tsx`   | Renders `type.fields` with react-hook-form (`useForm` + `FormProvider`), a 6-column grid from `md`, a focused 400 alert, a read-only mode with its reason, and `onDirtyChange`. One `SchemaField` per field picks the control.                                                                                          |
| Field controls         | _admin_ `form/fields/`          | `TextField`, `NumberField`, `BooleanField` (`Switch`), `JsonField` (`JsonInput`), `RichTextField` (lazy Tiptap `RichTextEditor` with a `role="toolbar"`), `MediaField` with `MediaPickerDialog`, `ComponentField`, `RepeatableField` (`useFieldArray`) and `UnsupportedField`.                                          |
| `GatedMenuItem`        | `form/GatedMenuItem.tsx`        | A menu item fed a decision: denied, it is `aria-disabled`, described by the reason, and does nothing.                                                                                                                                                                                                                   |
| `ConfirmDialog`        | `form/ConfirmDialog.tsx`        | Now takes `finalFocus` (Base UI's), for when the control that opened it may be gone after the action, such as a deleted row.                                                                                                                                                                                            |
| `UnsavedChangesDialog` | `form/UnsavedChangesDialog.tsx` | "Discard unsaved changes?" for `useUnsavedChangesGuard`: Cancel stays, Discard leaves.                                                                                                                                                                                                                                  |

Phase 6 added these. Their use is in [Settings](./settings.md#pagination) and [Documents UI](./documents-ui.md).

| Component     | Where                  | API and states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pagination`  | `form/Pagination.tsx`  | A `nav` named "Pagination": "Showing a–b of n" ("Showing 0 of 0" when empty), a "Rows per page" select of `sizes` (default 10, 20, 50, 100), "Previous page" and "Next page" icon buttons disabled at the ends, and "Page x of y" with the current page marked in `highlight`. Props: `page` (1-based), `size`, `total`, `sizes`, `onPageChange`, `onSizeChange`. Focus stays on the control used; when Previous or Next becomes disabled by its own step, focus moves to the other one. The pure helpers `lastPage`, `clampPage` and `pageSlice` are in `lib/pagination.ts` (100% branch coverage). |
| `GatedButton` | `form/GatedButton.tsx` | New optional `tooltip`: a tooltip shown while the action is allowed, for icon buttons. A denied button still shows its reason instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Badge`       | `components/badge.tsx` | New `highlight` variant (`bg-highlight text-highlight-foreground`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Form state lives in react-hook-form v7, never in component state: fields read and write through `register`, `Controller` or `useFieldArray`, and repeatables are keyed by RHF's `field.id`, never the index. Tiptap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`) is imported only by `RichTextEditor.tsx`, so it loads as its own chunk, and it runs with `injectCSS: false` under the CSP; its styles are in `src/styles/globals.css` with semantic tokens. `react-day-picker` (with the vendored `calendar.tsx` and `popover.tsx`) was approved by the user after the Phase 5 spec was written; its AC-40 lists only react-hook-form and the four Tiptap packages. `date-fns` was not needed.

Every input supports the default, filled, disabled, invalid (`aria-invalid`, destructive border) and required states. The [UI kit](./app-shell.md#ui-kit-route) shows all of them.

### Field

`Field` (`@repo/ui/form/Field`) wraps exactly one control and wires the label, description and error. Every input goes in a `Field`, or gets an explicit accessible name. Placeholder-only labels are not allowed.

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
- `parseJson(text, { required, expect })` in `@repo/ui/lib/json` is pure. Empty text is valid (`value: undefined`) unless `required`. A syntax error becomes "Invalid JSON: <reason> (line L, column C)". The line and column come from the engine message (V8, Firefox and Safari wording) and are left out when the engine gives no position. A kind mismatch gives "Expected a JSON object." or "Expected a JSON array."
- `formatJson` pretty-prints with two spaces. "Format JSON" is disabled while the text is empty, invalid or disabled.

## Adding a shadcn component

Primitives are added to `packages/ui`, not to an app.

1. Run the CLI inside `packages/ui` if it works there: `pnpm dlx shadcn@latest add <name>`. It reads `packages/ui/components.json` (Base UI, `base-nova`, CSS `src/styles/theme.css`, aliases `@repo/ui/components`, `@repo/ui/lib/cn`, `@repo/ui/lib`, `@repo/ui/hooks`). Otherwise, copy the Base UI source for the component from the shadcn registry by hand into `packages/ui/src/components/<name>.tsx`.
2. Review the file before committing. It must start with `'use client'` and use relative imports inside the package (`../lib/cn`, not `@/lib/utils` or `@repo/ui/...`). Use arrow components with `displayName`, semantic token classes only, and keep the focus ring and the 44px targets below `lg`. Check that the CLI did not touch `tsconfig.json` or `theme.css`, and did not add a dependency to an app.
3. If the component has behaviour of our own, put that in `packages/ui/src/form` (under the coverage gates) and keep the `components` file a thin primitive.
4. Add the new entry to `apps/frontend/src/ui-compile-check.ts`, so frontend's TypeScript 5 checks it.
5. Run `pnpm --filter @repo/ui test`, `typecheck` and `lint`, then `pnpm --filter frontend typecheck`.
6. Add it to the cms-admin UI kit page and, if it is user-visible, to `e2e/a11y.spec.ts` through a page that uses it.
