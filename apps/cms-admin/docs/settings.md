# Settings

Phase 4 replaces the `/admin/settings/*` placeholders with working pages for users, roles,
permissions, access tokens and the media library, and adds name editing to `/admin/profile`. This
page grows with each small phase. Small phase 4.1 laid the foundations described below, 4.2 added
the Users page, 4.3 the Permissions page and 4.4 the Roles page with the PermissionTree. The other
two routes are still placeholders.

Every request goes through `cmsApi` (see [API client](./api-client.md)). ABAC checks are
**client-side defense in depth only** (see [RBAC and ABAC](./rbac-abac.md)); the backend stays the
authority, and a server 403 is shown as "no access".

Source: `src/features/settings/`:

```text
types.ts                  User, Permission, PermissionConflict, AccessToken, AccessTokenSecret,
                          MediaAsset, ExpiresIn, EXPIRES_IN_OPTIONS, expiresInLabel (Role is in auth/types)
queryKeys.ts              settingsKeys
search.ts                 filterBySearch
roleHierarchy.ts          roleLevelOf, assignableRoles, usersWithRoles (UserRow)
validation.ts             PERMISSION_SLUG_PATTERN, validatePermission, permissionChanges,
                          ROLE_SLUG_PATTERN, roleSlugFromName, validateRole, roleChanges
permissionTree.ts         buildPermissionTree, nodeSlugs, countSelected, nodeState, toggleNode,
                          toggleSlug, filterPermissionTree, groupSlugsByResource
conflict.ts               parsePermissionConflict (P4 409 → counts sentence or server message)
api/                      usersApi (U1, U3, U4), rolesApi (R1 to R4), permissionsApi (P1 to P4)
hooks/                    useUsers, useAssignRole, useDeleteUser, useRoles, useCreateRole,
                          useUpdateRole, useDeleteRole, usePermissions, useCreatePermission,
                          useUpdatePermission, useDeletePermission
components/               ListState, SearchField, LiveRegion, useAnnouncer
```

`router.tsx` maps each settings key to its page through `SETTINGS_PAGES`; a key without a page
still renders `SettingsPlaceholderPage`. Each route stays behind `RequireAccess
permission="<res>:read"`.

## Backend contract

Paths are relative to `/api/v1`. Every id in a path goes through `encodeURIComponent`. The contract
comes from the legacy docs in [`../docs-old-dev/`](../docs-old-dev/) and has not been checked
against the real backend yet.

| #   | Method and path                  | Permission                            | Body                                             | Success                               |
| --- | -------------------------------- | ------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| U1  | `GET /users`                     | `user:read`                           | —                                                | `200 User[]`                          |
| U2  | `PUT /users/:id`                 | bearer only (self, or `user:manager`) | `{ name }` (never `password`)                    | `200 User`                            |
| U3  | `PATCH /users/:id/role`          | `user:role_manager`                   | `{ roleId }`                                     | `200 User`                            |
| U4  | `DELETE /users/:id`              | `user:manager`                        | —                                                | `204`                                 |
| R1  | `GET /roles`                     | `role:read`                           | —                                                | `200 Role[]`                          |
| R2  | `POST /roles`                    | `role:manager`                        | `{ name, slug, permissions[], level }`           | `201 Role`                            |
| R3  | `PUT /roles/:id`                 | `role:manager`                        | changed fields of `{ name, permissions, level }` | `200 Role`                            |
| R4  | `DELETE /roles/:id`              | `role:manager`                        | —                                                | `204`                                 |
| P1  | `GET /permissions`               | `permission:read`                     | —                                                | `200 Permission[]`                    |
| P2  | `POST /permissions`              | `permission:manager`                  | `{ slug, name, description }`                    | `201 Permission`                      |
| P3  | `PUT /permissions/:id`           | `permission:manager`                  | `{ name?, description? }`                        | `200 Permission`                      |
| P4  | `DELETE /permissions/:id`        | `permission:manager`                  | —                                                | `204`, or `409 PermissionConflict`    |
| T1  | `GET /access-tokens`             | `api_token:read`                      | —                                                | `200 AccessToken[]` (no secret)       |
| T2  | `POST /access-tokens`            | `api_token:manager`                   | `{ name, permissions[], expiresIn }`             | `201 AccessTokenSecret` (secret once) |
| T3  | `POST /access-tokens/:id/revoke` | `api_token:manager`                   | `{}`                                             | `200 AccessTokenSecret` (new secret)  |
| T4  | `DELETE /access-tokens/:id`      | `api_token:manager`                   | —                                                | `204`                                 |
| M1  | `GET /media`                     | `media:read`                          | —                                                | `200 MediaAsset[]` (newest first)     |
| M2  | `POST /media/upload`             | `media:manager`                       | `multipart/form-data`, field `file`              | `201 MediaAsset`                      |
| M3  | `DELETE /media/:id`              | `media:manager`                       | —                                                | `204`                                 |

`expiresIn` is one of `30m`, `1h`, `1d`, `1m`, `1y`, `never` (`EXPIRES_IN_OPTIONS`). `1m` is
labelled "1 month"; that reading is not yet checked against the backend (D6, a known gap).

## Query keys

`settingsKeys` is the only source of settings keys. Each list has one key under `['settings']`:
`users()`, `roles()`, `permissions()`, `accessTokens()` and `media()` (for example
`['settings', 'accessTokens']`). `settingsKeys.all` clears the whole feature. There are no
optimistic updates, and a failed mutation leaves the cache unchanged.

| Mutation              | Invalidates                                               |
| --------------------- | --------------------------------------------------------- |
| `useAssignRole`       | `users`                                                   |
| `useDeleteUser`       | `users`                                                   |
| `useCreateRole`       | `roles`                                                   |
| `useUpdateRole`       | `roles`, `users` (and `['auth', 'me']` for your own role) |
| `useDeleteRole`       | `roles`, `users`                                          |
| `useCreatePermission` | `permissions`                                             |
| `useUpdatePermission` | `permissions`                                             |
| `useDeletePermission` | `permissions`                                             |

The other slices add their rows here.

## The shared `guard`

`guard(decision)` lives in `src/features/auth/permissions/guard.ts` (moved from
`features/content/access.ts`, no behaviour change). Every mutation calls it first: a denied decision
throws `ApiError { status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: reason }`, so no request is
sent and no cache entry changes. The content hooks import it from there too.

## Primitives and form components

Vendored by hand from shadcn/ui (`base-nova`, Base UI), adapted to the house rules (arrow components
with `displayName`, semantic tokens, 44px touch targets below `lg`):

- `components/ui/dialog.tsx`: `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent` (optional
  icon-only Close), `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.
- `components/ui/alert-dialog.tsx`: the same parts as `AlertDialog*`, with `role="alertdialog"` and no
  outside-click dismissal.
- `components/ui/select.tsx`: `Select` (Base UI `Select.Root`), `SelectTrigger`, `SelectValue`,
  `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`. Put
  `SelectTrigger` inside a `Field` so it gets its label and `aria-*` wiring.

Both dialog popups set `aria-modal="true"` themselves (Base UI does not). Focus moves inside on open,
is trapped, and returns to the trigger on close. The UI kit (`/admin/dev/ui-kit`) shows each one.

`components/form/`:

- `GatedButton` takes a `Decision` from `useCan`. When denied it renders `aria-disabled="true"`, stays
  focusable, exposes the reason through a tooltip and `aria-describedby`, and ignores clicks, Enter
  and form submission (D5).
- `ConfirmDialog` confirms a destructive action in an `alertdialog`: `title` (names the target),
  `description`, a destructive `confirmLabel` verb, `onConfirm` (async; shows `loading`, blocks a
  second submit and dismissal while pending), `error` (`role="alert"`) and a `children` slot for a
  conflict summary. Cancel gets the initial focus. Use `trigger` for an uncontrolled dialog, or
  `open` and `onOpenChange`. A resolved `onConfirm` closes the dialog; a rejected one keeps it open so
  the caller can show `error`. `hideConfirm` removes the confirm button and moves focus to Cancel,
  for a state where the action can no longer run (the permission and role delete conflicts).
- `PermissionTree` picks permission slugs; see [PermissionTree](#permissiontree).

## List building blocks

In `src/features/settings/components/`:

- `ListState` renders the four list states (AC-3): skeleton rows in a busy group, the error with
  Retry (a server 403 shows "You don't have access to <items>." with no Retry), "No <items> yet."
  with the primary action, and "No <items> match "<q>"." Otherwise it renders the list.
- `SearchField` is a labelled `type="search"` box ("Search <items>") with a polite live count
  ("3 users"). Pages filter with `filterBySearch(items, query, fields)`: case-insensitive, trimmed,
  over the named fields, with no request.
- `useAnnouncer` plus `LiveRegion` give each page one polite status region for success messages
  (AC-10, D2: no toast library). Announcing the same text twice still re-announces it.

## Users (`/admin/settings/users`)

`src/pages/settings/UsersPage.tsx`, with its dialogs in `src/pages/settings/users/`.

- **List (U1 + R1).** `useUsers` loads U1. `useRoles` loads R1 only with `role:read`; while it is
  allowed and loading, the page waits so no row flashes "Unknown". `usersWithRoles` joins each user
  to its role by `roleId` and sorts by name. The role column shows the role name, "No role" for a
  `null` `roleId`, or "Unknown" when R1 is unavailable or the id has no match. Each row shows the
  name (plus a "You" badge on the signed-in user), username, email, "Verified" or "Not verified" in
  text, the role and the created date. Search covers name, username and email. No control edits a
  name or password (AC-17).
- **Levels.** `roleLevelOf` gives 0 for no role and `undefined` when the role is unknown. An unknown
  level denies both row actions (Assumption 4).
- **Table.** The vendored `Table` has a screen-reader caption and `scope="col"` headers, inside a
  labelled, focusable `region` ("Users table") that scrolls sideways at 375px instead of the page.
- **Policy use.** Each row computes `useCan('assign_role', 'user', { targetUserId, targetLevel,
newRoleLevel })` (with the highest assignable level) and `useCan('delete', 'user', { targetUserId,
targetLevel })`. Both buttons are `GatedButton`s named after the row ("Change role for
  jane@example.com", "Delete jane@example.com"). Self, a target at or above the actor's level, an
  unknown level and a missing `user:role_manager` or `user:manager` are denied with the policy's
  reason.
- **Change role.** `ChangeRoleDialog` is a `ConfirmDialog` (`alertdialog`, Cancel focused first,
  "Change role" confirm) titled "Change the role of <email>?" with a `Select` of
  `assignableRoles(roles, actor.level)`: levels below the actor's, highest first, labelled
  "Name (level n)". The current role is preselected when it is assignable; otherwise saving asks to
  "Choose a role.". `useAssignRole` guards `assign_role` again, then sends U3 `{ roleId }`. A server
  403 shows inside the dialog.
- **Delete.** `DeleteUserDialog` confirms "Delete <email>?" with a destructive "Delete user" button.
  `useDeleteUser` guards `delete user`, then sends U4; the row disappears after the refetch.
- **Feedback.** Success is announced in the page's `LiveRegion` ("Role of <email> changed to
  <role>.", "User <email> deleted."). Each dialog is remounted per opening, so a previous error never
  shows again.

## Permissions (`/admin/settings/permissions`)

`src/pages/settings/PermissionsPage.tsx`, with its dialogs in `src/pages/settings/permissions/`.

- **List (P1).** `usePermissions` loads the catalog (only with `permission:read`). The page groups it
  by resource (the slug before the first `:`) into native `<details>` sections, open by default, each
  with a count badge ("document 6 permissions" to a screen reader) and its own captioned table
  ("document permissions") in a labelled, focusable scroll region. Groups and rows are sorted by slug.
  Each row shows the slug in monospace, the name and the description. Search covers slug, name and
  description; the group counts follow the search.
- **Policy use.** `useCan('create' | 'update' | 'delete', 'permission')` gates New permission and
  each row's Edit and Delete (`GatedButton`s named "Edit <slug>", "Delete <slug>"). All three need
  `permission:manager`. The empty state repeats New permission.
- **Create and edit.** `PermissionFormDialog` is a modal `Dialog` with a native form (Enter submits).
  Slug (required, `PERMISSION_SLUG_PATTERN`, help text "resource:action, lowercase. It can't be
  changed later."), Name (required, at most 100 characters) and Description (required, the
  `Textarea` counter at 500). Create shows the info note "Creating a permission grants nothing by
  itself…". `validatePermission` runs on submit, then on every change. A P2 409 shows "A permission
  with this slug already exists." on Slug and clears when the slug changes; any other server error
  shows as an alert in the dialog. On edit the slug is read-only, focus starts on Name, and
  `permissionChanges` sends P3 only the changed (trimmed) fields; with no change the dialog just
  closes.
- **Delete.** `DeletePermissionDialog` confirms "Delete <slug>?" with "Delete permission". On a P4
  409, `parsePermissionConflict(error)` reads `{ roleCount, accessTokenCount }` from the error body:
  "This permission is still used by 2 roles and 1 access token. Remove it from them first."
  (pluralized, a zero count left out). Without usable counts (missing, not whole numbers, or both 0)
  it falls back to the server message. The dialog then switches to "<slug> is still in use", links
  to Roles and Access tokens (each only when the actor can read it; following one closes the dialog)
  and offers only Close.
- **Feedback.** `Permission "<slug>" created.`, `… updated.` and `… deleted.` go to the page's
  `LiveRegion`.

## Roles (`/admin/settings/roles`)

`src/pages/settings/RolesPage.tsx`, with its dialogs in `src/pages/settings/roles/`.

- **List (R1).** `useRoles` loads the roles (only with `role:read`). One captioned table ("Roles")
  in a labelled, focusable scroll region: name with a "Default" badge, slug in monospace, level and a
  permission count. Rows are sorted by level descending, then by name (case ignored). The count is a
  toggle button ("Writer: 3 permissions" to a screen reader, `aria-expanded`) that opens a detail row
  with the role's slugs grouped by resource (`groupSlugsByResource`), read-only. Search covers name
  and slug.
- **Policy use.** New role uses `useCan('create', 'role')`; each row's Edit and Delete use
  `useCan('update' | 'delete', 'role', { isDefault })` (`GatedButton`s "Edit <name>", "Delete
  <name>"). All need `role:manager`; Delete is also denied for a default role ("A default role cannot
  be deleted."). No client-side level-hierarchy rule applies to roles (D4).
- **Create and edit.** `RoleFormDialog` (a wide modal `Dialog`, Enter submits): Name (required, at
  most 100), Slug (required, `ROLE_SLUG_PATTERN`, at most 63), Level (a whole number 0 to 100, a
  `number` input) and the PermissionTree. On create, the slug follows `roleSlugFromName(name)` until
  the user types in Slug; a R2 409 shows "A role with this slug already exists." on Slug and clears
  when the slug changes; a 400 (unknown slug) shows the server message as an alert. On edit, Slug is
  read-only; a default role's Name and Level are disabled with "The name and level of a default role
  cannot be changed." while its permissions stay editable. `roleChanges` builds R3's body from the
  changed fields only (permissions compare as a set), and Save is disabled while there is none.
- **Your own role (AC-22).** When the edited role is `me.roleId`, `useUpdateRole` refetches
  `GET /auth/me` after R3, dispatches `userLoaded` and invalidates `['auth', 'me']`, so the menu,
  `<Can>` checks and the profile follow without a reload. A failed refetch is ignored (the save
  succeeded).
- **Delete.** `DeleteRoleDialog` confirms `Delete role "<name>"?` with "Delete role". On a R4 409 it
  says "This role is still assigned to users. Assign them another role first." and, when the users
  list is cached, "Assigned to 3 users."; it then offers only Close. Other errors stay in the
  dialog.
- **Feedback.** `Role "<name>" created.`, `… updated.` and `… deleted.` go to the page's
  `LiveRegion`.

## PermissionTree

`src/components/form/PermissionTree.tsx`, with its pure logic in
`src/features/settings/permissionTree.ts`. Used by the role form (and, from 4.5, the token form).

- **Props.** `value` and `onChange` (slug arrays), `catalog` (P1 data), `canReadCatalog`
  (`usePermissions().decision.allowed`), `isLoading`, `error` and `onRetry`, and an optional `label`
  (the legend, "Permissions").
- **Groups (D3).** `buildPermissionTree(catalog, selected)` makes one group per resource (the text
  before the first `:`), sorted alphabetically, with leaves sorted by slug. `document` holds no
  leaves itself: it is split into "All content types" (two-segment slugs) and one sub-group per
  content-type slug found in the catalog (three segments). Selected slugs the catalog lacks go last
  under "Unknown permissions", described as "Not in the permission catalog."; they stay listed after
  being unchecked, so they can be checked again.
- **Controls.** Every control is a native checkbox. A group has a tri-state checkbox
  (`indeterminate` set through a ref) named by its label, with "n of m selected" as its description;
  toggling it selects all of its descendants, or clears them when all were selected (`toggleNode`).
  A permission is named by its slug (monospace) and name (left out when it only repeats the slug)
  and described by its description. Labels never wrap a control, so Tab and Space work everywhere.
- **Filter and Select all.** The filter (`type="search"`, "Filter permissions") matches slug, name
  or description; Enter in it does not submit the form. Select all and the counts act on the
  visible permissions, and Select all never adds unknown slugs (R2 and R3 would reject them).
- **States.** Loading shows skeleton rows (`aria-busy`), a load error shows the message with Retry,
  and an empty catalog says so. Without `permission:read` the tree is replaced by the current slugs,
  read-only, and the note "Requires the "permission:read" permission to change permissions.".
- **Layout.** Groups sit in a bordered list capped at 20rem with its own vertical scroll. Rows are
  44px tall below `lg`.

## Test doubles

- **Unit (MSW):** `src/test/msw/settingsHandlers.ts` has one opt-in recorder factory per contract
  row (`listUsersHandler`, `updateUserRoleHandler`, …, `uploadMediaHandler`). None is a global
  default. Each records method, decoded params, `Content-Type` and body. A multipart body is kept
  as raw text, because jsdom's `FormData` and `File` do not cross MSW's Node interceptors; read its
  file part with `multipartFile(body)`. Fixtures: `makeUser`, `makePermission`, `makeAccessToken`,
  `makeAccessTokenSecret` and `makeMediaAsset` in `src/test/fixtures.ts`.
- **E2E:** `e2e/fixtures/mockSettings.ts` is the in-memory settings backend that `mockApi` delegates
  `/users*`, `/roles*`, `/permissions*`, `/access-tokens*` and `/media*` to (also available as the
  `mockSettings` fixture). It checks the bearer (401), then the route's permission with
  `requirePermission` (`<res>:manager` satisfies `<res>:read`, else 403), and answers 404
  `Not mocked: …` for anything not in `SETTINGS_ROUTES`. Its users are the users `mockApi` models,
  each user's role is added to the roles store, and the permissions store starts with
  `PERMISSION_CATALOG`. `addRole` and `removeRole` change the roles store. `ROLES.superAdmin` now holds every catalog slug, `ROLES.admin` (level 50)
  every `<res>:read`, and the old partial super admin is `ROLES.userManager`.
  `mockApi.latestAccessToken(email)` returns a bearer for direct API calls from a spec.
- **E2E routes so far:** U1, U3 and U4 (both enforce the level hierarchy with a 403, and answer 404
  for an unknown user or role), R1 to R4, and P1 to P4. R2 answers 400 for an invalid body or a
  slug missing from the catalog and 409 for a known role slug. R3 answers 400 when a default role's
  name or level changes, replaces the role (never mutates it, since `ROLES` is shared) and hands
  the new role to every user holding it, so `/auth/me` follows. R4 answers 400 for a default role
  and 409 while a user holds the role. P2 answers 400 for a slug that does not match the
  pattern or a missing name or description, and 409 for a known slug. P3 and P4 answer 404 for an
  unknown id. P4 answers 409 `{ message, roleCount, accessTokenCount }`, counted from the roles and
  access tokens in the store that grant the slug; otherwise it removes the permission
  (`removePermission`). U3 updates the `mockApi` user in place, so `/auth/me` sees the
  new role; U4 removes the user through `removeUser`. Use `mockApi.failNext(method, path, 403)` for a
  server 403 that the client guard would otherwise prevent. Specs: `e2e/settings-users.spec.ts`,
  `e2e/settings-permissions.spec.ts`, `e2e/settings-roles.spec.ts`.
