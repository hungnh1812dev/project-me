# Settings roles

The Roles page at `/admin/settings/roles` (Phase 4.4): lists roles with their level and permissions,
and creates, edits and deletes them with the [permission tree](./settings-permission-tree.md). For
administrators shaping who can do what.

## Feature

- **List (R1).** `useRoles` loads the roles (only with `role:read`). One captioned table ("Roles") in
  a labelled, focusable scroll region: name with a "Default" badge, slug in monospace, level, and a
  permission-count toggle ("Writer: 3 permissions", `aria-expanded`) that opens a read-only detail
  row with the slugs grouped by resource (`groupSlugsByResource`). Sorted by level descending, then
  name (case ignored). Search covers name and slug. One page of roles; detail rows don't count.
- **Policy.** New role `useCan('create', 'role')`; each row's Edit and Delete
  `useCan('update' | 'delete', 'role', { isDefault })` ("Edit <name>", "Delete <name>"). All need
  `role:manager`; Delete is denied for a default role.
- **Create and edit.** `RoleFormDialog` (wide modal, Enter submits): Name (≤ 100), Slug
  (`ROLE_SLUG_PATTERN`, ≤ 63), Level (whole number 0–100) and the PermissionTree. On create the slug
  follows `roleSlugFromName(name)` until the user types in Slug; R2 409 shows "A role with this slug
  already exists." on Slug (cleared when it changes); a 400 shows the server message. On edit Slug is
  read-only; a default role's Name and Level are disabled with "The name and level of a default role
  cannot be changed." while permissions stay editable. `roleChanges` sends only changed fields
  (permissions compared as a set); Save is disabled with no change.
- **Your own role (AC-22).** When the edited role is `me.roleId`, `useUpdateRole` refetches
  `GET /auth/me` after R3, dispatches `userLoaded` and invalidates `['auth', 'me']`, so the menu,
  `<Can>` and the profile follow without a reload. A failed refetch is ignored.
- **Delete.** `DeleteRoleDialog` confirms `Delete role "<name>"?`. On R4 409: "This role is still
  assigned to users. Assign them another role first." plus "Assigned to 3 users." when the users list
  is cached; then only Close.
- **Feedback.** `Role "<name>" created.`, `… updated.`, `… deleted.` in the `LiveRegion`.

### Decisions

- **No client-side level rule for roles (D4).** The page mirrors the backend contract (level 0–100
  only), so an actor may create or edit a role above their own level if the backend allows it
  (P4-SEC-1, see [Roadmap](./roadmap.md)).
- **Refetch `me` after editing your own role**, so permission changes apply immediately.

## Files

| File                                            | Spec                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `src/pages/settings/RolesPage.tsx`              | Default export: table, detail rows, search, paging, actions.               |
| `src/pages/settings/roles/RoleFormDialog.tsx`   | Exports `RoleFormDialog`: create and edit with the PermissionTree.         |
| `src/pages/settings/roles/DeleteRoleDialog.tsx` | Exports `DeleteRoleDialog`: confirmed R4 with the 409 conflict state.      |
| `src/features/settings/api/rolesApi.ts`         | Exports `getRoles`, `createRole`, `updateRole`, `deleteRole` and input types (R1–R4). |
| `src/features/settings/hooks/useRoles.ts`       | Exports `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`, `UpdateRoleVariables`. |

## Testing

- `RolesPage.test.tsx`, `roles/DeleteRoleDialog.test.tsx`, `api/rolesApi.test.ts`,
  `hooks/useRoles.test.ts`.
- `e2e/settings-roles.spec.ts`. The mock's R2 answers 400 for an invalid body or unknown slug and 409
  for a known role slug; R3 400 when a default role's name or level changes, replaces the role and
  hands it to every holder (so `/auth/me` follows); R4 400 for a default role, 409 while held.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/settings/RolesPage.test.tsx src/pages/settings/roles src/features/settings/hooks/useRoles.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-roles.spec.ts`.

## Related

- [Settings permission tree](./settings-permission-tree.md), [Settings foundation](./settings-foundation.md)
- [Settings users](./settings-users.md), [RBAC and ABAC](./rbac-abac.md), [Auth session](./auth-session.md)
