# UI testing and guards

Test setup and the scan tests that enforce the design rules across `packages/form-commons` and `apps/cms-admin`.

## Feature

- `src/test/setup.ts` adds jsdom polyfills (`ResizeObserver`, `Range.getClientRects` / `getBoundingClientRect`, `document.execCommand`) because jsdom has no layout and CodeMirror measures text.
- Guards: no raw hex or palette classes; every `bg-primary` / `bg-sidebar-primary` has `border-primary-ink`; primary is never text (`text-primary-ink` instead); no native checkbox or radio in admin code (`type="file"` only in `FileDropzone`) and no tag-and-type selectors in tests; the package imports no app, router, Redux, TanStack or axios code, and react-hook-form only under `src/components/rhf/**` and `src/stories/**` (D-1 amended). `VALID_SUBPATH` and the exact `package.json` `exports` assertion include `components/rhf/*`, and the `'use client'` scan covers `components/(ui|forms|rhf)/*.tsx`.
- Stories are guarded too: `boundaries.test.ts` scans `src/stories/**` with the same forbidden imports, fails on a `*.stories.*` file outside `src/stories/` and on a `storybook` / `@storybook/*` import outside it; `palette`, `primaryBorder` and `primaryText` each assert a story file is in their scan set; `rawControls` scans `src/stories/**/*.tsx` for native checkboxes and radios and `e2e/**/*.ts` for tag or type selectors.
- Coverage gates: `src/components/forms/**/*.tsx` 70%, `src/lib/**/*.ts` and `tokens.ts` 85%. `src/stories/**` is excluded from coverage, and Vitest (`src/**/*.test.{ts,tsx}`) picks up neither the stories nor `e2e/`.

## Files

| File                | Spec                                     |
| ------------------- | ---------------------------------------- |
| `src/test/setup.ts` | Vitest setup: polyfills and RTL cleanup. |

## Testing

`src/palette.test.ts`, `src/primaryBorder.test.ts`, `src/primaryText.test.ts`, `src/rawControls.test.ts`, `src/boundaries.test.ts`. Run: `pnpm --filter @repo/form-commons test` (`test:cov` for gates). Browser-level checks of the stories run with `test:stories`; see [Storybook](./storybook.md#testing).

## Related

- [UI design tokens](./ui-design-tokens.md), [UI primitives](./ui-primitives.md), [Storybook](./storybook.md)
