# Design system

How the admin is styled: the stack, the semantic tokens and palette, the shared `@repo/ui` package
the admin consumes (primitives, generic form components), the app's own global CSS and fonts, and
the dev-only UI kit page. For anyone building a screen or adding a component. The light/dark theme
is its own module, [Theme](./theme.md).

## Feature

### Stack

| Concern    | Choice                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| CSS        | Tailwind CSS v4 through `@tailwindcss/vite`. Tokens are CSS variables, mapped to utilities by `@theme inline` |
| Components | shadcn/ui in the Base UI flavour (`style: base-nova`), on `@base-ui/react`, vendored in `@repo/ui`            |
| Variants   | `class-variance-authority`. Classes always go through `cn()` (`@repo/ui/lib/cn`)                              |
| Animation  | `tw-animate-css`. `prefers-reduced-motion: reduce` turns transitions and animations off globally              |
| Icons      | `lucide-react`. Decorative icons get `aria-hidden`; icon-only buttons get `aria-label`                        |
| Fonts      | Fira Sans (400, 500, 600) and Fira Code, self-hosted through `@fontsource`. No font CDN. Fonts stay per app   |
| Visual     | Flat indigo on cool lavender-grey (Strapi-based), minimal / Swiss, dense layout                               |
| Forms      | react-hook-form v7 for admin data forms; state never in component state                                       |

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
`sidebar`, each with `-foreground`), accent (`primary`, `primary-ink`, `ring`, `sidebar-primary`,
`sidebar-ring`), `highlight`, status (`destructive`, `success`, `warning`), lines (`border`, `input`
so controls reach 3:1, `sidebar-border`), and `--radius`, fonts, `--motion-duration-*`. Values live
in `packages/ui/src/styles/theme.css` (`:root` and `.dark`) and `tokens.ts`, always changed together.

Strapi palette: a `#F6F6F9` page with white cards and nav, `#32324D` text and a solid indigo
`#4945FF` action fill, following the Strapi Design System scales. `primary-ink` means "primary used
as text or as a boundary". Src: **S** is an exact Strapi value (scale step), **D** an AA-derived
value of the same hue where the Strapi value fails AA.

| Token                                              | Light                 | Src                       | Dark                  | Src                |
| -------------------------------------------------- | --------------------- | ------------------------- | --------------------- | ------------------ |
| `background`                                       | `#F6F6F9`             | S neutral100              | `#181826`             | S dark neutral100  |
| `foreground`                                       | `#32324D`             | S neutral800              | `#FFFFFF`             | S dark neutral800  |
| `card`, `popover`                                  | `#FFFFFF`             | S neutral0                | `#212134`             | S dark neutral0    |
| `card-foreground`, `popover-foreground`            | `#32324D`             | S                         | `#FFFFFF`             | S                  |
| `primary`, `sidebar-primary`                       | `#4945FF`             | S primary600              | `#4945FF`             | S buttonPrimary600 |
| `primary-foreground`, `sidebar-primary-foreground` | `#FFFFFF`             | S                         | `#FFFFFF`             | S                  |
| `primary-ink` (`--color-primary-ink`)              | `#4945FF`             | S primary600              | `#9A98FF`             | D                  |
| `ring`, `sidebar-ring`                             | `#4945FF`             | S                         | `#9A98FF`             | D                  |
| `secondary` / fg                                   | `#F0F0FF` / `#271FE0` | S primary100 / primary700 | `#32324D` / `#9A98FF` | S neutral150 / D   |
| `muted`                                            | `#EAEAEF`             | S neutral150              | `#32324D`             | S                  |
| `muted-foreground`                                 | `#666687`             | S neutral600              | `#A5A5BA`             | S dark neutral600  |
| `accent` (hover tint) / fg                         | `#F0F0FF` / `#32324D` | S primary100 / neutral800 | `#32324D` / `#FFFFFF` | S                  |
| `destructive` / fg                                 | `#B72B1A` / `#FFFFFF` | S danger700               | `#F38B83` / `#181826` | D                  |
| `success` / fg                                     | `#2F6846` / `#FFFFFF` | S success700              | `#5CB176` / `#181826` | S success500       |
| `warning` / fg                                     | `#A14F00` / `#FFFFFF` | D                         | `#F29D41` / `#181826` | S warning500       |
| `highlight` / fg                                   | `#4945FF` / `#FFFFFF` | = `primary-ink`           | `#9A98FF` / `#181826` | = `primary-ink`    |
| `border`                                           | `#DCDCE4`             | S neutral200              | `#32324D`             | S dark neutral150  |
| `input`                                            | `#80809C`             | D                         | `#8E8EA9`             | D                  |
| `sidebar` / fg                                     | `#FFFFFF` / `#32324D` | S                         | `#212134` / `#FFFFFF` | S                  |
| `sidebar-accent` / fg (active, hover nav)          | `#F0F0FF` / `#271FE0` | S primary100 / primary700 | `#181826` / `#9A98FF` | S / D              |
| `sidebar-border`                                   | `#EAEAEF`             | S neutral150              | `#32324D`             | S                  |

Why the D values: light `input` (Strapi `#DCDCE4` is 1.36:1), light `warning` (Strapi `#D9822F` is
2.92:1 with white), dark `primary-ink` / `ring` / `highlight` (Strapi `#7B79FF` is 3.54:1 on
`#32324D`), dark `input` (Strapi `#666687` is 2.86:1), and dark `destructive` (Strapi `#EE5E52` is
3.68:1 on its 20% badge tint over `card`). Light `success` uses success700 and light `destructive`
danger700 (danger600 `#D02B20` is 4.14:1 on its 10% badge tint) for margin.

Measured contrast (the repo's `contrastRatio`):

- **Light.** Every text pair reaches at least 4.59:1 (lowest `muted-foreground` on `muted`), e.g.
  `foreground`/`background` 11.46, `primary-foreground`/`primary` 5.87, `primary-ink`/`background`
  5.44, `primary-ink`/`accent` 5.20, `sidebar-accent-foreground`/`sidebar-accent` 7.89,
  `warning-foreground`/`warning` 5.78. The lowest boundary is `input`/`background` at 3.55:1; the
  primary fill is 5.44:1 against the page.
- **Dark.** Every text pair reaches at least 4.89:1 (lowest `primary-ink` on `accent` and
  `secondary-foreground` on `secondary`); `destructive` reaches 4.62:1 on its 20% badge tint over
  `card`. Every boundary reaches 3:1 (`input`/`card` 4.95). The primary fill `#4945FF` is only
  2.99:1 against the page and 2.69:1 against cards, so it keeps a 1px `primary-ink` border
  (`#9A98FF`, 6.94:1 on the page, 6.24:1 on cards).

`apps/frontend/src/app/globals.css` pins `--ring: #7c3aed` and `--border: #e2e8f0` (the old values),
so the public site's focus outline and default border don't change with this palette.

Rules:

- Components use semantic token classes only: no raw hex and no palette classes. The package's
  `palette.test.ts` scans every `.tsx` in `packages/ui/src` **and** `apps/cms-admin/src`.
- `tokens.test.ts` keeps `tokens.ts` in sync with `theme.css` and checks 4.5:1 text pairs and 3:1
  control boundaries and focus rings in both themes.
- **Primary-border rule.** In dark the indigo fill is only 2.99:1 against the page, so every
  primary surface carries a 1px `primary-ink` border (in light it matches the fill; in dark
  `#9A98FF` is what reaches 3:1). Any class string with
  `bg-primary` or `bg-sidebar-primary` (the `/NN` hover and opacity forms excepted) must also have
  `border-primary-ink`; `packages/ui/src/primaryBorder.test.ts` scans `packages/ui/src` and
  `apps/cms-admin/src` and fails otherwise. Checked `Checkbox` and `RadioGroupItem`, the checked
  `Switch`, the `default` button and the `default` badge all follow it.
- **Primary is never text.** Links, text, icons and underlines in the primary colour use
  `text-primary-ink` (4.5:1), never `text-primary` / `text-sidebar-primary` (or the `fill-`,
  `stroke-`, `decoration-` forms), because dark `primary` as text is only 2.99:1.
  `packages/ui/src/primaryText.test.ts` scans `.tsx`, `.ts` and `.css` in both trees. Labels on a
  primary fill use `primary-foreground` (white).
- The highlight (D9) is used only for the active sidebar item's bar, the current page in
  `Pagination`, the `highlight` `Badge` variant, the editor's `true`/`false`/`null` colour and the UI
  kit swatches. It takes the `primary-ink` values, following Strapi, which marks the active item and
  the current page in primary; there is no second accent colour. The active nav item keeps its 4px
  bar next to the `sidebar-accent` tint, so the state isn't shown by colour alone. A new use needs the same
  contrast checks.
- Focus: `:focus-visible` draws a 2px `ring` outline with 2px offset everywhere; only `main` and the
  page `<h1>` (focused programmatically after navigation) drop it.

### Button roles

Three roles map onto the existing variant names (none renamed, added or removed):

| Role   | Variant       | Look                                                                                                  | Use                                                           |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Action | `default`     | indigo `primary` fill, 1px `primary-ink` border, white `primary-foreground` label, hover `primary/90` | The primary call to action, at most one per view area         |
| Normal | `outline`     | `background` fill, `input` border, `foreground` label, hover `accent`                                 | Everyday and secondary actions                                |
| Danger | `destructive` | `destructive` fill, white label (light) / `#181826` (dark), hover `destructive/90`                    | Destructive actions, behind `ConfirmDialog` when irreversible |

`secondary` is the Strapi-style pale indigo tint (`#F0F0FF` / `#271FE0` light, `#32324D` /
`#9A98FF` dark); `ghost` is unchanged; `link` uses `text-primary-ink`. Every role has the 2px `ring`
focus outline, 50% opacity when disabled and a width-keeping spinner with `aria-busy` when
`loading`. The UI kit shows the three roles in default, hover, focus, disabled and loading states
in both themes (`e2e/inputs.spec.ts`).

### Components the admin uses

Primitives (`@repo/ui/components`): `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`,
`calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`,
`radio-group`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `textarea`,
`tooltip`, `variants`. Controls are 44px tall below `lg` and 32–40px above. Both dialog popups set
`aria-modal="true"` and trap and return focus.

- **`Checkbox`** (Base UI, `role="checkbox"`): checked and `indeterminate` states paint the indigo fill
  with a `primary-ink` border and a `primary-foreground` check or dash; `indeterminate` is exposed
  as `aria-checked="mixed"`. Invalid shows the `destructive` border.
- **`RadioGroup` / `RadioGroupItem`** (new, Base UI): one Tab stop, arrow keys move focus and
  selection. Name the group with `aria-label` or `aria-labelledby`; checked items use the same indigo
  fill and `primary-ink` border.
- **Hit areas.** Both boxes stay 16px visually; an `::after` (`after:-inset-3.5`) widens the hit
  area to 44×44px without changing layout. Dense lists (the documents table and the column chooser)
  add `lg:after:-inset-2` and a `lg:min-h-8 lg:min-w-8` cell, so at `lg` and above the hit area
  shrinks to 32px and never overlaps the next row's box; below `lg` it stays 44px.
- **Names.** A wrapping `<label>` doesn't name a non-native `role="checkbox"`, so every `Checkbox`
  and `RadioGroupItem` gets `aria-labelledby` pointing at its visible text, or `aria-label` when no
  text is visible (row and select-all boxes, media cards named by file name).
- **No native controls.** `apps/cms-admin/src` has no `<input type="checkbox">` or
  `type="radio"`; `type="file"` is allowed only in `FileDropzone` (shadcn has no file primitive).

Generic form components (`@repo/ui/form`), with the behaviour the admin relies on:

| Component              | Behaviour                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Field`                | Wraps one control; wires label (`htmlFor`), description and error (`aria-describedby`, `aria-invalid`, `role="alert"`), `required` mark outside the accessible name. Placeholder-only labels are not allowed.                                                                                                                                                                         |
| `PasswordInput`        | Show/Hide toggle (`aria-pressed`).                                                                                                                                                                                                                                                                                                                                                    |
| `JsonInput`            | Validates after first blur; `parseJson` gives "Invalid JSON: <reason> (line L, column C)" or a kind mismatch; "Format JSON". CodeMirror in a lazy chunk, inside the open shadow root of `<repo-json-editor>` (delegated focus, one Tab stop, label click focuses it); the content is named by `label` and described by an in-shadow node mirroring the `Field` description and error. |
| `GatedButton`          | Fed a `Decision`: denied is `aria-disabled`, focusable, reason in tooltip and `aria-describedby`, ignores activation. Optional `tooltip` for allowed icon buttons.                                                                                                                                                                                                                    |
| `GatedMenuItem`        | The same for menu items.                                                                                                                                                                                                                                                                                                                                                              |
| `ConfirmDialog`        | `alertdialog` naming its target, Cancel focused first, `loading` while `onConfirm` runs, `error` slot, `hideConfirm`, `finalFocus`.                                                                                                                                                                                                                                                   |
| `SecretReveal`         | One-time secret: read-only input, Copy, Done only (see [Settings access tokens](./settings-access-tokens.md)).                                                                                                                                                                                                                                                                        |
| `FileDropzone`         | Visible Upload `GatedButton` plus drop zone and a text progress list (see [Settings media](./settings-media.md)).                                                                                                                                                                                                                                                                     |
| `DatePicker`           | `Calendar` in a `Popover`, focus on the selected day, Escape/Close without change, focus back to the trigger, `modal="trap-focus"`.                                                                                                                                                                                                                                                   |
| `UnsavedChangesDialog` | "Discard unsaved changes?" (see [Document editor](./document-editor.md)).                                                                                                                                                                                                                                                                                                             |
| `Pagination`           | "Showing a–b of n", "Rows per page" (10/20/50/100), Previous/Next, "Page x of y" marked in `highlight`; focus moves to the other step button when one disables itself. Helpers `lastPage`, `clampPage`, `pageSlice` in `lib/pagination`.                                                                                                                                              |

Every input supports default, filled, disabled, invalid and required states.

### JSON editor (`JsonInput` on CodeMirror 6)

- **API kept.** Same props as before (`value`, `defaultValue`, `onChange`, `onValidate`,
  `onValueChange`, `expect`, `required`, `disabled`, `readOnly`, `name`, `id`, `aria-*`, `onBlur`,
  `rows`), plus an optional `label` used for the in-shadow name. The ref exposes `focus()` so
  react-hook-form focuses the editor on an invalid save.
- **Lazy chunk.** `React.lazy` loads `form/JsonCodeEditor.tsx`, so `@codemirror/*` is its own chunk
  and not in the entry chunk. While it loads, a read-only skeleton of the same height shows the
  text (no layout shift).
- **Shadow root.** The view mounts inside `<repo-json-editor>`, a form-associated custom element
  (defined once) with an open shadow root and `delegatesFocus`. CodeMirror's styles go into a
  constructed stylesheet adopted by that shadow root, never into a `<style>` element, so the CSP
  stays `style-src 'self'` (see [CSP and headers](./csp-and-headers.md#json-editor-under-the-csp)).
  Never use a closed shadow root: tests and axe must reach the editor.
- **Theming.** Tailwind doesn't cross the shadow boundary, so the editor is themed by
  `EditorView.theme` and `HighlightStyle` with `var(--token)` colours only (built in
  `lib/jsonEditor.ts`, tested to contain no raw colour). Custom properties inherit, so light and
  dark follow the theme. Syntax: property names `primary-ink`, strings `success`, numbers `warning`,
  `true`/`false`/`null` `highlight`, punctuation `muted-foreground`; each reaches 4.5:1 on the
  editor background (`tokens.test.ts`). The host carries the `input` border, the `ring`
  `:focus-within` outline, the invalid `destructive` border and the disabled `muted` background.
- **Extensions.** JSON highlighting, line numbers, bracket matching, auto-closing brackets, history,
  line wrapping. No lint gutter, folding, autocomplete UI or `indentWithTab`, so Tab and Shift+Tab
  leave the editor (no keyboard trap) and the host adds no extra tab stop.
- **Accessibility.** The content has `role="textbox"`, `aria-multiline`, `aria-label` = the field
  label, `aria-invalid`, `aria-required` and `aria-readonly`; its `aria-describedby` points at an
  in-shadow node mirroring the description and current error. A click on the `Field` label (found
  through `ElementInternals.labels`) focuses the editor.
- **Pure helpers** in `lib/jsonEditor.ts` (validation timing, format enablement, controlled-sync
  decision, theme and size specs) are under the 85% `src/lib` gate.

### UI kit route

`/admin/dev/ui-kit` (`UiKitPage`) shows every base input in every state, the palette swatches and
the badges, inside the shell. It is registered only when `import.meta.env.DEV` and loaded lazily, so
production drops it (the router test checks registration; the release check greps `dist` for
`UiKitPage`). It also shows the three button roles in every state, `Checkbox` (including the mixed
state), `RadioGroup` and `JsonInput` (default, disabled, read-only, invalid, empty). The
`destructive` badge is back in the Badge section: its pair now passes axe contrast in both themes.

### Adding a shadcn component

1. Add it to `packages/ui`, not to an app: run the CLI there or copy the Base UI source into
   `packages/ui/src/components/<name>.tsx`.
2. Review: `'use client'`, relative imports inside the package, arrow components with
   `displayName`, semantic tokens only, every primary fill paired with `border-primary-ink`, primary never
   used as text, focus ring and 44px targets kept; the CLI must not touch
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
- **Earlier restyle.** Colours change only through tokens; button variant names stay; only native
  checkboxes and radios moved to primitives (no other new shadcn controls); fonts unchanged.
- **Strapi restyle.** Colours only (radius, shadows, fonts, spacing and layout kept); AA first, so
  failing Strapi values get an AA-derived value of the same hue (D); highlight = `primary-ink`; the
  active nav item keeps its 4px bar; token names kept, the frontend keeps its `--ring`/`--border`
  pins; the gold guards became `primaryBorder.test.ts` and `primaryText.test.ts`.
- **CodeMirror in a shadow root instead of a CSP nonce.** A nonce would have changed `style-src`
  and needed per-request injection in nginx and `vite preview`; the shadow root keeps the policy.

## Files

| File                          | Spec                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/globals.css`      | Imports Tailwind and `@repo/ui/styles/theme.css`, scans the package, fonts, focus exception, `.rich-text` styles. No colour tokens of its own. |
| `src/pages/dev/UiKitPage.tsx` | Default export `UiKitPage`: dev-only showcase of button roles, inputs, checkbox and radio states, `JsonInput`, swatches and badges.            |
| `public/favicon.svg`          | The app icon.                                                                                                                                  |

The shared primitives, form components and tokens live in `packages/ui` (outside this app): notably
`styles/theme.css` + `styles/tokens.ts`, `components/variants.ts`, `components/checkbox.tsx`,
`components/radio-group.tsx`, `components/badge.tsx`, `form/JsonInput.tsx`,
`form/JsonCodeEditor.tsx`, `lib/jsonEditor.ts` and `lib/jsonEditorView.ts`.

## Testing

- `src/styles/globals.test.ts`: imports the shared theme after Tailwind, scans the package, declares
  no colour tokens, self-hosts the fonts, sets the Fira families.
- `e2e/inputs.spec.ts`: the UI kit inputs and their states, the button roles, checkbox and radio
  states, 44px hit areas measured at 375px, and the JSON editor (name, description, format,
  read-only, disabled, no layout shift).
- `e2e/a11y.spec.ts` includes `/admin/dev/ui-kit` in both themes and both widths.
- Package tests: `pnpm --filter @repo/ui test`.
  - `tokens.test.ts`: values match `theme.css`, text pairs 4.5:1, `input`/`ring`/`primary-ink` 3:1,
    the Strapi and AA-derived values, the destructive badge tint, syntax colours 4.5:1.
  - `palette.test.ts`: no raw hex or palette classes in `.tsx`.
  - `primaryBorder.test.ts`: every `bg-primary` / `bg-sidebar-primary` has `border-primary-ink`.
  - `primaryText.test.ts`: no `text-primary` (or `fill-`/`stroke-`/`decoration-`) primary text.
  - `rawControls.test.ts`: no native checkbox or radio in `apps/cms-admin/src` (`type="file"` only
    in `FileDropzone`), and no `input[type="checkbox"]`, `input[type="radio"]` or `.indeterminate`
    selector in cms-admin unit tests or e2e specs: query by role and name.
  - `boundaries.test.ts`, button variant tests, `JsonInput` / `JsonCodeEditor` tests (driven through
    `EditorView` transactions; no `<style>` added to `document`), `lib/jsonEditor.test.ts`.
- Run: `pnpm --filter cms-admin exec vitest run src/styles` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/inputs.spec.ts`.

## Related

- [Theme](./theme.md)
- [App shell](./app-shell.md) (sidebar, header)
- [Schema form](./schema-form.md), [Settings permission tree](./settings-permission-tree.md) (admin-side form components)
- [Routing and guards](./routing-and-guards.md) (UI kit route)
