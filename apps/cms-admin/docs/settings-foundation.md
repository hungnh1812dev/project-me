# Settings foundation

What the five settings pages (users, roles, permissions, access tokens, media) share (Phase 4,
paging added in Phase 6): the backend contract, the types, `settingsKeys` and the invalidation
matrix, the policy use per page, client-side search and pagination, the list building blocks, the
form validation rules, and the unit and e2e test doubles. Every request goes through `cmsApi`; ABAC
is client-side defense in depth only.

## Feature

### Backend contract

Paths are relative to `/api/v1`, every id goes through `encodeURIComponent`. The contract comes from
the legacy docs in `../docs-old-dev/` and has not been checked against the real backend yet.

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

`expiresIn` is one of `30m`, `1h`, `1d`, `1m`, `1y`, `never` (`EXPIRES_IN_OPTIONS`); `1m` is labelled
"1 month" by `expiresInLabel`, not yet checked against the backend (D6).

### Routing

`router.tsx` maps each settings key to its page through `SETTINGS_PAGES`, behind
`RequireAccess permission="<res>:read"`; the menu entries are in [App shell](./app-shell.md).

### Query keys and invalidation

`settingsKeys` is the only source of keys: `all`, `users()`, `roles()`, `permissions()`,
`accessTokens()`, `media()`, each under `['settings']`. No optimistic updates; a failed mutation
leaves the cache unchanged.

| Mutation               | Invalidates                                               |
| ---------------------- | --------------------------------------------------------- |
| `useAssignRole`        | `users`                                                   |
| `useDeleteUser`        | `users`                                                   |
| `useCreateRole`        | `roles`                                                   |
| `useUpdateRole`        | `roles`, `users` (and `['auth', 'me']` for your own role) |
| `useDeleteRole`        | `roles`, `users`                                          |
| `useCreatePermission`, `useUpdatePermission`, `useDeletePermission` | `permissions`  |
| `useCreateAccessToken`, `useRevokeAccessToken`, `useDeleteAccessToken` | `accessTokens` |
| `useUploadMedia`       | `media`, once per batch and only when a file uploaded     |
| `useDeleteMedia`       | `media`                                                   |
| `useUpdateProfile`     | `users` (and writes the new name to `['auth', 'me']`)     |

### Policy use per page

Every write control is a `GatedButton` fed by `useCan`, and each mutation hook calls `guard` with the
same decision first.

| Page          | Read              | Control                      | `useCan(action, subject, attrs)`                                       | Needs                |
| ------------- | ----------------- | ---------------------------- | ---------------------------------------------------------------------- | -------------------- |
| Users         | `user:read`       | Change role                  | `assign_role`, `user`, `{ targetUserId, targetLevel, newRoleLevel }`   | `user:role_manager`  |
| Users         |                   | Delete                       | `delete`, `user`, `{ targetUserId, targetLevel }`                      | `user:manager`       |
| Roles         | `role:read`       | New role, Edit, Delete       | `create` / `update` / `delete`, `role`, `{ isDefault }`                | `role:manager`       |
| Permissions   | `permission:read` | New permission, Edit, Delete | `create` / `update` / `delete`, `permission`                           | `permission:manager` |
| Access tokens | `api_token:read`  | New token, Revoke, Delete    | `create` / `revoke` / `delete`, `api_token`                            | `api_token:manager`  |
| Media library | `media:read`      | Upload, Delete               | `upload` / `delete`, `media`                                           | `media:manager`      |
| Profile       | signed in         | Edit name                    | none (U2 is bearer only for your own record)                           | —                    |

### List building blocks

- `ListState` renders the four list states (AC-3): skeleton rows in a busy group; the error with
  Retry (a server 403 shows "You don't have access to <items>." with no Retry); "No <items> yet."
  with the primary action; "No <items> match "<q>"." Otherwise the list.
- `SearchField`: a labelled `type="search"` box ("Search <items>") with a polite live count
  ("3 users"). Pages filter with `filterBySearch(items, query, fields)`: case-insensitive, trimmed,
  no request.
- `useAnnouncer` + `LiveRegion`: one polite status region per page for success messages (AC-10, D2:
  no toast library). The same text twice is still re-announced. The content pages reuse them.

### Pagination (Phase 6, D5 to D8)

The endpoints return full lists, so lists page on the client; the backend is unchanged.

- Each page builds its sorted, searched list, then `useListPaging(items, search)` slices it with
  `pageSlice`. `Pagination` sits under the table or grid inside `ListState`, so it is hidden while
  loading, in error or empty.
- "Rows per page" 10, 20, 50, 100; default 10 (D6).
- `page` and `size` live in the query string, left out at 1 and 10 (`parsePaging`,
  `serializePaging`, other params kept). Invalid values fall back and a page past the end clamps,
  with `replace`. Next, Previous and size changes push an entry (size goes back to page 1), so Back
  restores the page. A search change goes back to page 1 with `replace`; the live count still
  announces every match.
- A delete that empties the last page moves to the new last page; never an empty page while items
  remain. Focus stays on the control used; when Next or Previous disables itself, focus moves to the
  other.

### Validation rules (`validation.ts`)

Shared by the forms: `validatePermission` / `permissionChanges` (`PERMISSION_SLUG_PATTERN`, name ≤
100, description ≤ 500), `validateRole` / `roleChanges` / `roleSlugFromName` (`ROLE_SLUG_PATTERN`,
slug ≤ 63, name ≤ 100, level 0–100), `validateTokenName` (`TOKEN_NAME_MAX` 100) and
`validateProfileName` (`PROFILE_NAME_MAX` 100). Each form runs its rule on submit, then on every
change.

### Decisions

- **Client-side paging (D5)** over full lists; very large lists still load in full until the backend
  pages.
- **No toast library (D2)**: one live region per page.
- **`guard` before every mutation**, so a denied action never reaches the network.

### Manual smoke against :8080 (D9)

**Not run (2026-10-02, no `super_admin` credentials).** The contract, including `expiresIn: "1m"`
(D6), is checked only against the legacy docs and the mocks; Phase 4 stays IN REVIEW. To run: start
the backend, `pnpm --filter cms-admin dev`, sign in as `super_admin`, one pass per page, create a
token with "1 month" and compare `expiresAt` with the creation time; record results here.

## Files

| File                                             | Spec                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/features/settings/types.ts`                 | Exports `User`, `Permission`, `PermissionConflict`, `AccessToken`, `AccessTokenSecret`, `MediaAsset`, `ExpiresIn`, `EXPIRES_IN_OPTIONS`, `expiresInLabel`. |
| `src/features/settings/queryKeys.ts`             | Exports `settingsKeys`.                                                                |
| `src/features/settings/search.ts`                | Exports `filterBySearch`.                                                              |
| `src/features/settings/paging.ts`                | Exports `parsePaging`, `serializePaging`, `DEFAULT_PAGING`, `PAGE_SIZES`, `Paging`, `PageSize`. |
| `src/features/settings/validation.ts`            | Form rules for permissions, roles, tokens and the profile name (see above).           |
| `src/features/settings/hooks/useListPaging.ts`   | Exports `useListPaging`, `ListPaging`. URL-backed client paging with clamping.         |
| `src/features/settings/components/ListState.tsx` | Exports `ListState`, `ListStateProps`, `Noun`. The four list states.                   |
| `src/features/settings/components/SearchField.tsx` | Exports `SearchField`, `SearchFieldProps`.                                           |
| `src/features/settings/components/LiveRegion.tsx`| Exports `LiveRegion`.                                                                  |
| `src/features/settings/components/useAnnouncer.ts` | Exports `useAnnouncer`.                                                              |
| `src/test/msw/settingsHandlers.ts`               | One opt-in MSW recorder per contract row plus `settingsErrorReply` and `multipartFile`; records method, params, `Content-Type`, body. |
| `src/test/nodeMultipart.ts`                      | Exports `useNodeFormData`, `uploadFile`. Node `FormData` for upload tests (jsdom's doesn't cross MSW). |
| `e2e/fixtures/mockSettings.ts`                   | In-memory settings backend behind `mockApi` (also the `mockSettings` fixture); see below. |

## Testing

- Unit: `types.test.ts`, `queryKeys.test.ts`, `search.test.ts`, `paging.test.ts`,
  `validation.test.ts`, `hooks/useListPaging.test.tsx`, `components/components.test.tsx`, and
  `src/test/msw/settingsHandlers.test.ts`. Coverage at the end of 4.8: the pure settings modules are
  at 97% branch coverage or more (bar 90%, read from the report).
- **E2E double.** `mockSettings` checks the bearer (401), then the route's permission
  (`<res>:manager` satisfies `<res>:read`, else 403), and answers 404 `Not mocked: …` outside
  `SETTINGS_ROUTES`. Its users are `mockApi`'s; the permissions store starts with
  `PERMISSION_CATALOG`. `ROLES.superAdmin` holds every slug, `ROLES.admin` (level 50) every
  `<res>:read`, `ROLES.userManager` the old partial super admin. Helpers: `addRole`, `removeRole`,
  `addAccessToken`, `removeAccessToken`, `addMedia`, `removePermission`, `removeMedia`, `removeUser`.
  Per-route behaviour is on each settings page. Use `mockApi.failNext(method, path, 403)` for a server
  403 the client guard would prevent.
- `e2e/settings-mock.spec.ts` checks the mock itself. `e2e/a11y.spec.ts` runs axe on all five pages
  (plus three open dialogs) in both themes and widths, walks Tab order (primary action, search,
  every row action, visible focus), and checks focus stays inside every dialog and returns on close
  (AC-42, AC-43).
- Run: `pnpm --filter cms-admin exec vitest run src/features/settings` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-mock.spec.ts`.

## Related

- [Settings users](./settings-users.md), [Settings roles](./settings-roles.md),
  [Settings permissions](./settings-permissions.md), [Settings access tokens](./settings-access-tokens.md),
  [Settings media](./settings-media.md), [Settings permission tree](./settings-permission-tree.md), [Profile](./profile.md)
- [RBAC and ABAC](./rbac-abac.md), [API client](./api-client.md)
- [Design system](./design-system.md) (`Pagination`, `GatedButton`, `ConfirmDialog`)
