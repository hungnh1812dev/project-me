# Design system

How the admin is styled: the stack, the semantic tokens and palette, the shared `@repo/ui` package
the admin consumes (primitives, generic form components), the app's own global CSS and fonts, and
the dev-only UI kit page. For anyone building a screen or adding a component. The light/dark theme
is its own module, [Theme](./theme.md).

## Feature

### Stack

| Concern        | Choice                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| CSS            | Tailwind CSS v4 through `@tailwindcss/vite`. Tokens are CSS variables, mapped to utilities by `@theme inline` |
| Components     | shadcn/ui in the Base UI flavour (`style: base-nova`), on `@base-ui/react`, vendored in `@repo/ui`            |
| Variants       | `class-variance-authority`. Classes always go through `cn()` (`@repo/ui/lib/cn`)                              |
| Animation      | `tw-animate-css`. `prefers-reduced-motion: reduce` turns transitions and animations off globally              |
| Icons          | `lucide-react`. Decorative icons get `aria-hidden`; icon-only buttons get `aria-label`                        |
| Fonts          | Fira Sans (400, 500, 600) and Fira Code, self-hosted through `@fontsource`. No font CDN. Fonts stay per app   |
| Visual         | Minimal / Swiss, dense. Slate neutrals, a violet primary and an orange highlight                              |
| Forms          | react-hook-form v7 for admin data forms; state never in component state                                       |

Deviations: Fira Sans is the static `@fontsource/fira-sans` (no variable build exists), Fira Code is
`@fontsource-variable/fira-code`. The primitives were written by hand from the shadcn Base UI source
(the CLI could not run in this repo); `packages/ui/components.json` is kept for later CLI use.

### Shared package `@repo/ui` (Phase 6, D1 to D3)

- **D1 Package.** `packages/ui` is private ESM shipped as TypeScript source, compiled by each
  consumer (Vite here, `transpilePackages` in frontend). Subpath exports only, no barrel:
  `@repo/ui/components/*`, `/form/*`, `/hooks/*`, `/lib/*`, `/styles/theme.css`, `/styles/tokens`.
  No re-export shims in the apps.
- **D2 Tailwind sharing.** `theme.css` holds the tokens for `:root` and `.dark`, `@custom-variant
  dark`, the `@theme inline` mapping, radius and motion tokens, the global `:focus-visible` rule and
  the reduced-motion rule. The app's `globals.css` imports it and adds
  `@source '../../../../packages/ui/src'` (Tailwind doesn't scan `node_modules`). Fonts, `body`
  font settings, the `main`/`h1` focus exception and the `.rich-text` styles stay in `globals.css`.
- **D3 Form split.** Generic components moved to the package (`Field`, `PasswordInput`, `JsonInput`,
  `DatePicker`, `ConfirmDialog`, `UnsavedChangesDialog`, `SecretReveal`, `GatedButton`,
  `GatedMenuItem`, `FileDropzone`, `Pagination`). Components that use the admin's data layer stay in
  `src/components/form` ([Schema form](./schema-form.md),
  [Settings permission tree](./settings-permission-tree.md)). `Decision` comes from `lib/decision`.
- **Boundaries.** The package's `boundaries.test.ts` fails on `@/` or `apps/*` imports, on
  `react-router*`, `axios`, Redux, TanStack or react-hook-form imports, and on a `.tsx` in
  `components` or `form` without `'use client'`.
- Package tests and gates run with `pnpm --filter @repo/ui test` / `test:cov` (`src/form/**/*.tsx`
  70%, `src/lib/**/*.ts` and `tokens.ts` 85%, `src/components/**` excluded).

### Tokens and palette

Semantic token groups: surfaces (`background`, `card`, `popover`, `muted`, `secondary`, `accent`,
`sidebar`, each with `-foreground`), accent (`primary`, `ring`, `sidebar-primary`, `sidebar-ring`),
`highlight`, status (`destructive`, `success`, `warning`), lines (`border`, `input` at slate-500 so
controls reach 3:1, `sidebar-border`), and `--radius`, fonts, `--motion-duration-*`.

| Token                                                | Light                | Dark                 |
| ---------------------------------------------------- | -------------------- | -------------------- |
| `primary`, `ring`, `sidebar-primary`, `sidebar-ring` | violet-600 `#7c3aed` | violet-400 `#a78bfa` |
| `primary-foreground`, `sidebar-primary-foreground`   | white `#ffffff`      | slate-950 `#020617`  |
| `highlight`                                          | orange-700 `#c2410c` | orange-400 `#fb923c` |
| `highlight-foreground`                               | white `#ffffff`      | slate-950 `#020617`  |

Rules:

- Components use semantic token classes only: no raw hex and no palette classes. The package's
  `palette.test.ts` scans every `.tsx` in `packages/ui/src` **and** `apps/cms-admin/src`.
- `tokens.test.ts` keeps `tokens.ts` in sync with `theme.css` and checks 4.5:1 text pairs and 3:1
  control boundaries and focus rings in both themes.
- The highlight (D9) is used only for the active sidebar item's bar, the current page in
  `Pagination`, the `highlight` `Badge` variant and the UI kit swatches. A new use needs the same
  contrast checks and a reason it isn't `primary`.
- Focus: `:focus-visible` draws a 2px `ring` outline with 2px offset everywhere; only `main` and the
  page `<h1>` (focused programmatically after navigation) drop it.

### Components the admin uses

Primitives (`@repo/ui/components`): `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`,
`calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`,
`separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `textarea`, `tooltip`, `variants`.
Controls are 44px tall below `lg` and 32–40px above. Both dialog popups set `aria-modal="true"` and
trap and return focus.

Generic form components (`@repo/ui/form`), with the behaviour the admin relies on:

| Component              | Behaviour                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Field`                | Wraps one control; wires label (`htmlFor`), description and error (`aria-describedby`, `aria-invalid`, `role="alert"`), `required` mark outside the accessible name. Placeholder-only labels are not allowed. |
| `PasswordInput`        | Show/Hide toggle (`aria-pressed`).                                                                                                                |
| `JsonInput`            | Validates after first blur; `parseJson` gives "Invalid JSON: <reason> (line L, column C)" or a kind mismatch; "Format JSON".                      |
| `GatedButton`          | Fed a `Decision`: denied is `aria-disabled`, focusable, reason in tooltip and `aria-describedby`, ignores activation. Optional `tooltip` for allowed icon buttons. |
| `GatedMenuItem`        | The same for menu items.                                                                                                                          |
| `ConfirmDialog`        | `alertdialog` naming its target, Cancel focused first, `loading` while `onConfirm` runs, `error` slot, `hideConfirm`, `finalFocus`.               |
| `SecretReveal`         | One-time secret: read-only input, Copy, Done only (see [Settings access tokens](./settings-access-tokens.md)).                                   |
| `FileDropzone`         | Visible Upload `GatedButton` plus drop zone and a text progress list (see [Settings media](./settings-media.md)).                                |
| `DatePicker`           | `Calendar` in a `Popover`, focus on the selected day, Escape/Close without change, focus back to the trigger, `modal="trap-focus"`.              |
| `UnsavedChangesDialog` | "Discard unsaved changes?" (see [Document editor](./document-editor.md)).                                                                        |
| `Pagination`           | "Showing a–b of n", "Rows per page" (10/20/50/100), Previous/Next, "Page x of y" marked in `highlight`; focus moves to the other step button when one disables itself. Helpers `lastPage`, `clampPage`, `pageSlice` in `lib/pagination`. |

Every input supports default, filled, disabled, invalid and required states.

### UI kit route

`/admin/dev/ui-kit` (`UiKitPage`) shows every base input in every state, the palette swatches and
the badges, inside the shell. It is registered only when `import.meta.env.DEV` and loaded lazily, so
production drops it (the router test checks registration; the release check greps `dist` for
`UiKitPage`). The `destructive` badge is left out because it fails light-theme contrast (see
[Roadmap](./roadmap.md)).

### Adding a shadcn component

1. Add it to `packages/ui`, not to an app: run the CLI there or copy the Base UI source into
   `packages/ui/src/components/<name>.tsx`.
2. Review: `'use client'`, relative imports inside the package, arrow components with
   `displayName`, semantic tokens only, focus ring and 44px targets kept; the CLI must not touch
   `tsconfig.json`, `theme.css` or an app's dependencies.
3. Our own behaviour goes in `packages/ui/src/form` (under the gates).
4. Add the entry to `apps/frontend/src/ui-compile-check.ts`.
5. Run `pnpm --filter @repo/ui test typecheck lint` and `pnpm --filter frontend typecheck`.
6. Add it to the UI kit and, if user-visible, to `e2e/a11y.spec.ts`.

### Decisions

- **App-local in Phase 3, shared in Phase 6.** The stack stayed; the primitives moved to `@repo/ui`
  once `apps/frontend` needed them.
- **Source package, no build step**, so both bundlers compile it and there is no stale `dist`.
- **Data-layer components stay in the app**, which keeps the package free of router, Redux, React
  Query and react-hook-form.

## Files

| File                       | Spec                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/styles/globals.css`   | Imports Tailwind and `@repo/ui/styles/theme.css`, scans the package, fonts, focus exception, `.rich-text` styles. No colour tokens of its own. |
| `src/pages/dev/UiKitPage.tsx` | Default export `UiKitPage`: dev-only showcase of inputs, states, swatches and badges.        |
| `public/favicon.svg`       | The app icon.                                                                                   |

The shared primitives, form components and tokens live in `packages/ui` (outside this app).

## Testing

- `src/styles/globals.test.ts`: imports the shared theme after Tailwind, scans the package, declares
  no colour tokens, self-hosts the fonts, sets the Fira families.
- `e2e/inputs.spec.ts`: the UI kit inputs and their states.
- `e2e/a11y.spec.ts` includes `/admin/dev/ui-kit` in both themes and both widths.
- Package tests (`palette.test.ts`, `tokens.test.ts`, `boundaries.test.ts`, form tests):
  `pnpm --filter @repo/ui test`.
- Run: `pnpm --filter cms-admin exec vitest run src/styles` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/inputs.spec.ts`.

## Related

- [Theme](./theme.md)
- [App shell](./app-shell.md) (sidebar, header)
- [Schema form](./schema-form.md), [Settings permission tree](./settings-permission-tree.md) (admin-side form components)
- [Routing and guards](./routing-and-guards.md) (UI kit route)
