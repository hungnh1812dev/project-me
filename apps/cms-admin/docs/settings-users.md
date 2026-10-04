# Settings users

The Users page at `/admin/settings/users` (Phase 4.2): lists every user with their role, and lets an
admin change a user's role or delete a user, within the role-level hierarchy. For administrators
managing accounts. No control edits a name or password here (AC-17).

## Feature

- **List (U1 + R1).** `useUsers` loads U1. `useRoles` loads R1 only with `role:read`; while it is
  allowed and loading the page waits, so no row flashes "Unknown". `usersWithRoles` joins each user
  to its role by `roleId` and sorts by name. The role column shows the role name, "No role" for a
  `null` `roleId`, or "Unknown" when R1 is unavailable or the id has no match. Each row: name (plus a
  "You" badge for the signed-in user), username, email, "Verified" or "Not verified" in text, role,
  created date. Search covers name, username and email. One page of rows (default 10).
- **Levels.** `roleLevelOf` gives 0 for no role and `undefined` for an unknown role; an unknown level
  denies both row actions (Assumption 4).
- **Table.** Screen-reader caption, `scope="col"` headers, inside a labelled, focusable region
  ("Users table") that scrolls sideways at 375px instead of the page.
- **Policy.** Each row computes `useCan('assign_role', 'user', { targetUserId, targetLevel,
  newRoleLevel })` (with the highest assignable level) and `useCan('delete', 'user', { targetUserId,
  targetLevel })`. `GatedButton`s "Change role for <email>" and "Delete <email>". Self, a target at or
  above the actor's level, an unknown level, or a missing permission deny with the policy's reason.
- **Change role.** `ChangeRoleDialog`, a `ConfirmDialog` titled "Change the role of <email>?" with a
  `Select` of `assignableRoles(roles, actor.level)` (levels below the actor's, highest first,
  "Name (level n)"). The current role is preselected when assignable, otherwise saving asks to
  "Choose a role.". `useAssignRole` guards again, then sends U3 `{ roleId }`. A server 403 shows
  inside the dialog.
- **Delete.** `DeleteUserDialog` confirms "Delete <email>?" with "Delete user"; `useDeleteUser`
  guards, then U4.
- **Feedback.** "Role of <email> changed to <role>." and "User <email> deleted." in the page's
  `LiveRegion`. Each dialog remounts per opening, so an old error never shows again.

### Decisions

- **Unknown level denies**, so a user whose role can't be resolved is never editable by mistake.
- **Wait for R1 when allowed**, to avoid flashing "Unknown" roles.

## Files

| File                                            | Spec                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/pages/settings/UsersPage.tsx`              | Default export: list, search, paging, row actions, dialogs.                      |
| `src/pages/settings/users/ChangeRoleDialog.tsx` | Exports `ChangeRoleDialog`: assignable-role select, U3.                          |
| `src/pages/settings/users/DeleteUserDialog.tsx` | Exports `DeleteUserDialog`: confirmed U4.                                        |
| `src/features/settings/api/usersApi.ts`         | Exports `getUsers`, `assignUserRole`, `deleteUser`, `updateUserName` (U1–U4; U2 is used by [Profile](./profile.md)). |
| `src/features/settings/hooks/useUsers.ts`       | Exports `useUsers`, `useAssignRole`, `useDeleteUser` and their variable types.   |
| `src/features/settings/roleHierarchy.ts`        | Exports `roleLevelOf`, `assignableRoles`, `usersWithRoles`, `UserRow`.           |

## Testing

- `UsersPage.test.tsx`, `api/usersApi.test.ts`, `hooks/useUsers.test.ts`, `roleHierarchy.test.ts`.
- `e2e/settings-users.spec.ts`. The mock's U3 and U4 enforce the level hierarchy (403) and answer 404
  for an unknown user or role; U3 updates the `mockApi` user in place so `/auth/me` follows; U4 calls
  `removeUser`.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/settings/UsersPage.test.tsx src/features/settings/hooks/useUsers.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-users.spec.ts`.

## Related

- [Settings foundation](./settings-foundation.md), [Settings roles](./settings-roles.md)
- [RBAC and ABAC](./rbac-abac.md) (`user` policies), [Profile](./profile.md)
