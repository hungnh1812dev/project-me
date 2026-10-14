# UI integration

How `apps/frontend` consumes `@repo/form-commons` without changing its look when the shared palette changed.

## Feature

- `ui-compile-check.ts` re-exports every `@repo/form-commons` primitive (now including `radio-group`) and form component, so `pnpm --filter frontend typecheck` proves each one compiles under Next.js (`transpilePackages`). A new primitive needs an entry here.
- The shared theme moved to the Strapi palette; the pins stay. Frontend renders only `--ring` and `--border` from it, so `globals.css` pins them to the old values (`--ring: #7c3aed`, `--border: #e2e8f0`). Decision: pin instead of restyling, because the public look is out of scope.
- `globals.css` scans the package with `@source '../../../../packages/form-commons/src'` and, right after it, skips the Storybook stories with `@source not '../../../../packages/form-commons/src/stories'`, so classes used only in stories never reach the public bundle (and story edits don't change the build). The stories and their tests live in `@repo/form-commons`; see [Storybook](../../../packages/form-commons/docs/storybook.md).

## Files

| File                      | Spec                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/globals.css`     | Imports Tailwind and `@repo/form-commons/styles/theme.css`, `@source` for `packages/form-commons/src` and `@source not` for its `src/stories`, the `--ring`/`--border` pins. |
| `src/ui-compile-check.ts` | Type-only barrel of namespace re-exports of `@repo/form-commons/components/ui/*` and `@repo/form-commons/components/forms/*`; never imported at runtime.                     |

## Testing

No unit tests. Check with `pnpm --filter frontend typecheck` and `pnpm --filter frontend build`.

## Related

- [Public site](./public-site.md)
- [UI design tokens](../../../packages/form-commons/docs/ui-design-tokens.md)
- [Storybook](../../../packages/form-commons/docs/storybook.md)
