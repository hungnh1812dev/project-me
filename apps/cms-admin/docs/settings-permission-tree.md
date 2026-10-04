# Settings permission tree

`PermissionTree`, the permission picker shared by the role form and the access-token form (Phase
4.4): `@repo/ui` `Checkbox` boxes grouped by resource, content-type sub-groups under `document`, tri-state
group boxes, a filter and Select all. It stays in the admin (not `@repo/ui`) because it reads the
permission catalog.

## Feature

- **Props.** `value` and `onChange` (slug arrays), `catalog` (P1 data), `canReadCatalog`
  (`usePermissions().decision.allowed`), `isLoading`, `error`, `onRetry`, optional `label` (the
  legend, "Permissions").
- **Groups (D3).** `buildPermissionTree(catalog, selected)`: one group per resource, sorted, leaves
  sorted by slug. `document` holds no leaves itself: "All content types" (two-segment slugs) and one
  sub-group per content-type slug (three segments). Selected slugs missing from the catalog go last
  under "Unknown permissions" ("Not in the permission catalog.", `UNKNOWN_GROUP_ID`); they stay
  listed after unchecking so they can be checked again.
- **Controls.** Every box is the `@repo/ui` `Checkbox` (Base UI, `role="checkbox"`), rendered by the
  internal `TriStateCheckbox`; there is no native checkbox left. A group box with some descendants
  selected sets `indeterminate`, which shows a dash and exposes `aria-checked="mixed"`, next to
  "n of m selected"; toggling selects all descendants or clears them when all were selected
  (`toggleNode`). Checked and mixed boxes use the gold fill with a `primary-ink` border, with a 44px
  hit area below `lg`.
- **Names.** A wrapping `<label>` doesn't name a non-native checkbox, so each box gets
  `aria-labelledby` pointing at its visible text: a permission by its slug (and name when it adds
  anything), a group by its title. The description is wired through `aria-describedby`. The names
  are the same as with the native boxes, so tests find each one with
  `getByRole('checkbox', { name })`. Labels never wrap a control, so Tab and Space work everywhere.
- **Filter and Select all.** "Filter permissions" matches slug, name or description; Enter in it
  doesn't submit the form. Select all and the counts act on the visible permissions and never add
  unknown slugs (R2 and R3 would reject them).
- **States.** Loading skeleton rows (`aria-busy`), error with Retry, empty catalog message. Without
  `permission:read` the tree is replaced by the current slugs, read-only, with "Requires the
  "permission:read" permission to change permissions.".
- **Layout.** A bordered list capped at 20rem with its own scroll; rows 44px below `lg`.
- `groupSlugsByResource` also feeds the read-only slug lists in the roles and tokens tables.

### Decisions

- **Plain checkboxes**, not a tree widget, for predictable keyboard and screen-reader behaviour.
  Since the luxury restyle they are the shared `Checkbox` instead of native inputs (a guard test in
  `@repo/ui` blocks new native ones), with explicit names kept identical.
- **Unknown slugs are kept, never added**, so editing a role never silently drops a grant and
  Select all never sends one the backend rejects.

## Files

| File                                     | Spec                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/form/PermissionTree.tsx` | Exports `PermissionTree`, `PermissionTreeProps`. The picker UI and its states.               |
| `src/features/settings/permissionTree.ts`| Exports `buildPermissionTree`, `nodeSlugs`, `countSelected`, `nodeState`, `toggleNode`, `toggleSlug`, `filterPermissionTree`, `groupSlugsByResource`, `UNKNOWN_GROUP_ID` and the node types. Pure tree logic. |

## Testing

- `src/components/form/PermissionTree.test.tsx`, `src/features/settings/permissionTree.test.ts`.
- Unit tests query boxes by role and name only and check `aria-checked="mixed"` on partial groups.
- Exercised end to end in `e2e/settings-roles.spec.ts` and `e2e/settings-access-tokens.spec.ts`
  (`getByRole('checkbox', { name })`); `a11y.spec.ts` runs axe on the open Roles form with the tree,
  after checking one permission so a group is in the mixed state.
- Run: `pnpm --filter cms-admin exec vitest run src/components/form/PermissionTree.test.tsx src/features/settings/permissionTree.test.ts`.

## Related

- [Settings roles](./settings-roles.md), [Settings access tokens](./settings-access-tokens.md)
- [Settings permissions](./settings-permissions.md) (the catalog)
- [Design system](./design-system.md#components-the-admin-uses) (`Checkbox`)
