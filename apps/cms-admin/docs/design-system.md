# Design system

How the admin is styled: the stack, the semantic tokens and palette, the shared `@repo/ui` package
the admin consumes (primitives, generic form components), the app's own global CSS and fonts, and
the dev-only UI kit page. For anyone building a screen or adding a component. The light/dark theme
is its own module, [Theme](./theme.md).

## Feature

### Stack

| Concern    | Choice                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| CSS        | Tailwind CSS v4 through `@tailwindcss/vite`. Tokens are CSS variables, mapped to utilities by `@theme inline`   |
| Components | shadcn/ui in the Base UI flavour (`style: base-nova`), on `@base-ui/react`, vendored in `@repo/ui`              |
| Variants   | `class-variance-authority`. Classes always go through `cn()` (`@repo/ui/lib/cn`)                                |
| Animation  | `tw-animate-css`. `prefers-reduced-motion: reduce` turns transitions and animations off globally                |
| Icons      | `lucide-react`. Decorative icons get `aria-hidden`; icon-only buttons get `aria-label`                          |
| Fonts      | Fira Sans (400, 500, 600) and Fira Code, self-hosted through `@fontsource`. No font CDN. Fonts stay per app     |
| Visual     | Quiet luxury on a minimal / Swiss, dense layout: warm stone neutrals, off-white canvas, metallic gold, charcoal |
| Forms      | react-hook-form v7 for admin data forms; state never in component state                                         |

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

Luxury palette: an off-white page with white cards, charcoal text (not black), warm stone neutrals,
solid metallic gold `#D4AF37` for the action fill (no gradient) and the new deep-gold `primary-ink`
wherever gold has to be read as text or as a boundary.

| Token                                              | Light                   | Dark                  |
| -------------------------------------------------- | ----------------------- | --------------------- |
| `background`                                       | `#FAFAF9` off-white     | `#1C1A17`             |
| `foreground`                                       | `#2B2B2B` charcoal      | `#F5F5F4`             |
| `card`, `popover`                                  | `#FFFFFF`               | `#292524`             |
| `card-foreground`, `popover-foreground`            | `#2B2B2B`               | `#F5F5F4`             |
| `primary`, `sidebar-primary`                       | `#D4AF37` metallic gold | `#D4AF37`             |
| `primary-foreground`, `sidebar-primary-foreground` | `#2B2B2B`               | `#1C1A17`             |
| `primary-ink` (`--color-primary-ink`)              | `#7A5C14` deep gold     | `#E0C068`             |
| `ring`, `sidebar-ring`                             | `#7A5C14`               | `#E0C068`             |
| `secondary`, `muted`                               | `#F5F5F4`               | `#292524`             |
| `secondary-foreground`                             | `#2B2B2B`               | `#F5F5F4`             |
| `muted-foreground`                                 | `#57534E`               | `#A8A29E`             |
| `accent` (hover tint)                              | `#F5F0E1`               | `#33302B`             |
| `accent-foreground`                                | `#2B2B2B`               | `#F5F5F4`             |
| `destructive` / fg                                 | `#B91C1C` / `#FFFFFF`   | `#F87171` / `#1C1A17` |
| `success` / fg                                     | `#15803D` / `#FFFFFF`   | `#4ADE80` / `#1C1A17` |
| `warning` / fg                                     | `#B45309` / `#FFFFFF`   | `#FBBF24` / `#1C1A17` |
| `highlight` / fg                                   | `#7A5C14` / `#FFFFFF`   | `#E0C068` / `#1C1A17` |
| `border`, `sidebar-border`                         | `#E7E5E4`               | `#33302B`             |
| `input`                                            | `#78716C`               | `#8B847E`             |
| `sidebar` / fg                                     | `#F5F5F4` / `#2B2B2B`   | `#1C1A17` / `#F5F5F4` |
| `sidebar-accent` / fg                              | `#E7E5E4` / `#2B2B2B`   | `#33302B` / `#F5F5F4` |

`apps/frontend/src/app/globals.css` pins `--ring: #7c3aed` and `--border: #e2e8f0` (the old values),
so the public site's focus outline and default border don't change with this palette.

Rules:

- Components use semantic token classes only: no raw hex and no palette classes. The package's
  `palette.test.ts` scans every `.tsx` in `packages/ui/src` **and** `apps/cms-admin/src`.
- `tokens.test.ts` keeps `tokens.ts` in sync with `theme.css` and checks 4.5:1 text pairs and 3:1
  control boundaries and focus rings in both themes.
- **Gold-border rule.** The gold fill is only about 2.1:1 against the page, so every gold surface
  carries a 1px `primary-ink` border (5.97:1 light, 9.85:1 dark). Any class string with
  `bg-primary` or `bg-sidebar-primary` (the `/NN` hover and opacity forms excepted) must also have
  `border-primary-ink`; `packages/ui/src/goldBorder.test.ts` scans `packages/ui/src` and
  `apps/cms-admin/src` and fails otherwise. Checked `Checkbox` and `RadioGroupItem`, the checked
  `Switch`, the `default` button and the `default` badge all follow it.
- **Gold is never text.** Links, text, icons and underlines that should look gold use
  `text-primary-ink` (4.5:1), never `text-primary` / `text-sidebar-primary` (or the `fill-`,
  `stroke-`, `decoration-` forms). `packages/ui/src/goldText.test.ts` scans `.tsx`, `.ts` and `.css`
  in both trees. Labels on a gold fill use `primary-foreground` (charcoal).
- The highlight (D9) is used only for the active sidebar item's bar, the current page in
  `Pagination`, the `highlight` `Badge` variant, the editor's `true`/`false`/`null` colour and the UI
  kit swatches. It is now deep gold (same values as `primary-ink`) so it doesn't clash with the gold
  primary. A new use needs the same
  contrast checks and a reason it isn't `primary`.
- Focus: `:focus-visible` draws a 2px `ring` outline with 2px offset everywhere; only `main` and the
  page `<h1>` (focused programmatically after navigation) drop it.

### Button roles

Three roles map onto the existing variant names (none renamed, added or removed):

| Role   | Variant       | Look                                                                                                   | Use                                                           |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Action | `default`     | gold `primary` fill, 1px `primary-ink` border, charcoal `primary-foreground` label, hover `primary/90` | The primary call to action, at most one per view area         |
| Normal | `outline`     | `background` fill, `input` border, charcoal label, hover `accent`                                      | Everyday and secondary actions                                |
| Danger | `destructive` | `destructive` fill, white label (light) / `#1C1A17` (dark), hover `destructive/90`                     | Destructive actions, behind `ConfirmDialog` when irreversible |

`secondary` and `ghost` are unchanged; `link` uses `text-primary-ink`. Every role has the 2px `ring`
focus outline, 50% opacity when disabled and a width-keeping spinner with `aria-busy` when
`loading`. The UI kit shows the three roles in default, hover, focus, disabled and loading states
in both themes (`e2e/inputs.spec.ts`).

### Components the admin uses

Primitives (`@repo/ui/components`): `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`,
`calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`,
`radio-group`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `textarea`,
`tooltip`, `variants`. Controls are 44px tall below `lg` and 32–40px above. Both dialog popups set
`aria-modal="true"` and trap and return focus.

- **`Checkbox`** (Base UI, `role="checkbox"`): checked and `indeterminate` states paint the gold fill
  with a `primary-ink` border and a `primary-foreground` check or dash; `indeterminate` is exposed
  as `aria-checked="mixed"`. Invalid shows the `destructive` border.
- **`RadioGroup` / `RadioGroupItem`** (new, Base UI): one Tab stop, arrow keys move focus and
  selection. Name the group with `aria-label` or `aria-labelledby`; checked items use the same gold
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
   `displayName`, semantic tokens only, every gold fill paired with `border-primary-ink`, gold never
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
- **Luxury restyle.** Colours change only through tokens; button variant names stay; only native
  checkboxes and radios moved to primitives (no other new shadcn controls); fonts unchanged.
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
    charcoal and off-white values, syntax colours 4.5:1.
  - `palette.test.ts`: no raw hex or palette classes in `.tsx`.
  - `goldBorder.test.ts`: every `bg-primary` / `bg-sidebar-primary` has `border-primary-ink`.
  - `goldText.test.ts`: no `text-primary` (or `fill-`/`stroke-`/`decoration-`) gold text.
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
