# UI testing and guards

Test setup and the scan tests that enforce the design rules across `packages/ui` and `apps/cms-admin`.

## Feature

- `src/test/setup.ts` adds jsdom polyfills (`ResizeObserver`, `Range.getClientRects` / `getBoundingClientRect`, `document.execCommand`) because jsdom has no layout and CodeMirror measures text.
- Guards: no raw hex or palette classes; every `bg-primary` / `bg-sidebar-primary` has `border-primary-ink`; primary is never text (`text-primary-ink` instead); no native checkbox or radio in admin code (`type="file"` only in `FileDropzone`) and no tag-and-type selectors in tests; the package imports no app, router, Redux, TanStack, axios or react-hook-form code.
- Coverage gates: `src/form/**/*.tsx` 70%, `src/lib/**/*.ts` and `tokens.ts` 85%.

## Files

| File | Spec |
| ---- | ---- |
| `src/test/setup.ts` | Vitest setup: polyfills and RTL cleanup. |

## Testing

`src/palette.test.ts`, `src/primaryBorder.test.ts`, `src/primaryText.test.ts`, `src/rawControls.test.ts`, `src/boundaries.test.ts`. Run: `pnpm --filter @repo/ui test` (`test:cov` for gates).

## Related

- [UI design tokens](./ui-design-tokens.md), [UI primitives](./ui-primitives.md)
