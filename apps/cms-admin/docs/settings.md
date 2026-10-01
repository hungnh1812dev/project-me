# Settings

Phase 4 replaces the `/admin/settings/*` placeholders with working pages for users, roles,
permissions, access tokens and the media library, and adds name editing to `/admin/profile`. This
page grows with each small phase. Small phase 4.1 laid the foundations described below; the pages
themselves are still placeholders.

Every request goes through `cmsApi` (see [API client](./api-client.md)). ABAC checks are
**client-side defense in depth only** (see [RBAC and ABAC](./rbac-abac.md)); the backend stays the
authority, and a server 403 is shown as "no access".

Source: `src/features/settings/`:

```text
types.ts                  User, Permission, PermissionConflict, AccessToken, AccessTokenSecret,
                          MediaAsset, ExpiresIn, EXPIRES_IN_OPTIONS, expiresInLabel (Role is in auth/types)
queryKeys.ts              settingsKeys
search.ts                 filterBySearch
components/               ListState, SearchField, LiveRegion, useAnnouncer
```

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
`['settings', 'accessTokens']`). `settingsKeys.all` clears the whole feature. The invalidation matrix
is added with the mutations in the page slices.

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
  the caller can show `error`.

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
  `PERMISSION_CATALOG`. `ROLES.superAdmin` now holds every catalog slug, `ROLES.admin` (level 50)
  every `<res>:read`, and the old partial super admin is `ROLES.userManager`.
  `mockApi.latestAccessToken(email)` returns a bearer for direct API calls from a spec.
