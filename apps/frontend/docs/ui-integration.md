# UI integration

How `apps/frontend` consumes `@repo/ui` without changing its look when the shared palette changed.

## Feature

- `ui-compile-check.ts` re-exports every `@repo/ui` primitive (now including `radio-group`), so `pnpm --filter frontend typecheck` proves each one compiles under Next.js (`transpilePackages`). A new primitive needs an entry here.
- The shared theme moved to the Strapi palette; the pins stay. Frontend renders only `--ring` and `--border` from it, so `globals.css` pins them to the old values (`--ring: #7c3aed`, `--border: #e2e8f0`). Decision: pin instead of restyling, because the public look is out of scope.

## Files

| File | Spec |
| ---- | ---- |
| `src/ui-compile-check.ts` | Type-only barrel of namespace re-exports of `@repo/ui/components/*`; never imported at runtime. |

## Testing

No unit tests. Check with `pnpm --filter frontend typecheck`.

## Related

- [Public site](./public-site.md)
- [UI design tokens](../../../packages/ui/docs/ui-design-tokens.md)
