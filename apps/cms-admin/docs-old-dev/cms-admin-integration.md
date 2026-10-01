# CMS-Admin ↔ API Integration Guide

Audience: whoever is building the CMS-Admin frontend against this backend (`abyssoftime-cms-api`). This is a
consumer-facing guide — not an internal architecture doc (see `/docs/documents/*` for that) — covering how to
authenticate, call every endpoint, and handle errors from a browser app.

For the machine-readable contract, use the live-exported `nestjs-openapi.json` (repo root) or run the API and
open `GET /api-docs`. This document explains the parts an OpenAPI file can't: the hybrid cookie/Bearer
authentication model, CORS requirements, permission gating, and per-flow gotchas.

## 1. Base setup

- Base URL: `http://localhost:8080` in local dev (`PORT` env var). All routes are under `/api/v1/*` **except**
  `GET /health`, which is unprefixed.
- Every request/response body is JSON except media upload (`multipart/form-data`).
- **CORS is configured with a strict, credentialed, exact-match allowlist** (`CORS_ORIGINS` env var,
  comma-separated origins — see `docs/documents/cors.md`). Every authenticated `/api/v1/*` route, including the
  cookie-bearing auth ones, only sends `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true`
  back to an origin that's in that allowlist; any other origin gets neither header and the browser blocks the
  response. **If CMS-Admin's dev/staging/prod origin isn't already in `CORS_ORIGINS`, ask the backend team to
  add it** — there's no wildcard fallback and no way to work around this client-side. `/public/documents/*` (the
  two public read routes, §5.8) is the one exception: it's open to any origin, without credentials, since those
  routes carry no session.
- Every `fetch`/`axios` call **must** send cookies (for `refresh_token`) **and**, once a session exists,
  attach the in-memory access token as an `Authorization` header (see §2):
  ```js
  fetch(url, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` }, ... })
  // axios: axios.create({ baseURL, withCredentials: true }) + a request interceptor adding the header
  ```

## 2. Authentication model — read this before building the login page

This API uses a **hybrid** model (access token moved off cookies on 2026-08-08): the **refresh token** is still
`httpOnly`-cookie-based, but the **access token** is `Authorization: Bearer`-based — returned in the
`login`/`refresh` JSON response body, held in memory client-side, and sent back as an `Authorization: Bearer
<token>` header on every subsequent request. Treating both tokens the same way (e.g. assuming neither is ever
readable/storable, or assuming both live in cookies) is the single most likely integration mistake.

- `login`/`refresh` set **one** `httpOnly` cookie server-side: `refresh_token` (7 day TTL, or 30 day when
  `rememberMe: true` was sent on login). JavaScript **cannot read it** (`httpOnly`) — that's by design, don't
  try to store it yourself.
- **`login` and `refresh` both return `{ "message": string, "accessToken": string }`.** Capture `accessToken`
  from the response body and hold it **in memory only** — a module-level variable, not `localStorage`/
  `sessionStorage`/a cookie — then attach it as `Authorization: Bearer <accessToken>` on every authenticated
  request. `logout` still returns `{ "message": string }` only and clears the `refresh_token` cookie
  server-side (there's no access-token cookie left to clear).
- Cookie flags (`secure`, `sameSite`) for `refresh_token` come from `COOKIE_SECURE` / `COOKIE_SAMESITE` env
  vars — ask the backend team what's set in each environment; `sameSite: "strict"` would block a
  cross-subdomain admin app even with CORS enabled, `"lax"`/`"none"` would not.
- The unrelated API-token mechanism (`Authorization: Bearer cms_<64-hex>`, long-lived, DB-backed, used by
  third-party integrations) already read the same header before this change and is unaffected — §4 covers how
  the two share one guard safely.

### 2.1 Onboarding flow (register → verify → login)

New users are **not usable until email-verified**. The flow is:

```
POST /auth/register  →  201, user created but unverified, OTP emailed
POST /auth/verify-otp →  200, marks user verified
POST /auth/login      →  200, returns accessToken + sets refresh_token cookie (fails with 403 if not yet verified)
```

`POST /auth/resend-otp` re-sends the code if the user didn't get it / it expired.

There is **no invite-based signup** in this backend (no `/api/invites`, no `/auth/invite/:token`) — every new
user goes through open self-registration + OTP verification. If CMS-Admin's design assumes an invite-only admin
onboarding flow, that doesn't exist server-side yet — flag it rather than building UI against it.

### 2.2 Endpoint reference

| Method & path | Auth | Rate-limited | Body | Success | Notes |
|---|---|---|---|---|---|
| `GET /auth/has-users` | none | no | — | `200 { hasUsers: boolean }` | Use to decide whether to show a first-run "create admin" screen vs. a normal login screen. |
| `POST /auth/register` | none | yes (429 possible) | `RegisterDto` | `201 UserResponseDto` | See fields below. `409` if email/username taken. |
| `POST /auth/verify-otp` | none | yes | `{ email, otp }` (otp = 6-digit string) | `200 MessageResponseDto` | `400` bad/expired/missing OTP, `404` no account, `409` already verified. |
| `POST /auth/resend-otp` | none | yes | `{ email }` | `200 MessageResponseDto` | `404`, `409` (already verified). |
| `POST /auth/login` | none | yes | `{ email, password, rememberMe? }` | `200 { message, accessToken }`, sets `refresh_token` cookie | `401` bad credentials (message is intentionally identical for "no such user" vs "wrong password" — don't try to distinguish these in the UI). `403` if email not yet verified. |
| `POST /auth/refresh` | `refresh_token` cookie (read via `JwtRefreshGuard`) | no | — | `200 { message, accessToken }` (rotated), rotates `refresh_token` cookie | `401` if cookie missing/invalid/expired — treat as "session ended," send the user to `/login`. |
| `POST /auth/logout` | none required | no | — | `200 MessageResponseDto`, clears `refresh_token` cookie | Always succeeds even if not logged in. There's no access-token cookie to clear — the client is responsible for discarding its in-memory `accessToken`. |
| `POST /auth/forgot-password` | none | yes | `{ email }` | `200 MessageResponseDto` | Always returns success regardless of whether the email exists (enumeration prevention) — don't render "email not found" in the UI, just show a generic "check your inbox" message. |
| `POST /auth/reset-password` | none | yes | `{ token, newPassword }` | `200 MessageResponseDto` | `token` is the plaintext value emailed by forgot-password, 1-hour expiry. `400` if invalid/expired. |
| `GET /auth/me` | `Authorization: Bearer <accessToken>` (`JwtAuthGuard`) | no | — | `200 MeResponseDto` | Resolves the access token into the caller's own identity + resolved `role` (with `permissions`), in one call — see §2.3. `401` if the token is missing/invalid/expired, or if the account was deleted after the token was issued. `404` if the user's `roleId` doesn't resolve to an existing role (should not happen in normal operation). No permission requirement. |

**`RegisterDto` fields** (all required): `email` (string), `name` (string, display name), `username`
(3–32 chars: letters/numbers/underscore/dot/hyphen), `password` (min 8 chars), `accountType` (boolean).

**Session lifecycle for the frontend**: there's no client-readable cookie to check on app load, so every
mount does `POST /auth/refresh` first (off the `refresh_token` cookie, no `accessToken` needed to *initiate*
it), captures the returned `accessToken`, then calls `GET /auth/me` (see §2.3) with it — redirect to login on
a `401` from either call. On any `401` from *any other* authenticated call, attempt `POST /auth/refresh` once,
capture the new `accessToken`, and retry the original request; if the refresh also 401s, clear local UI state
(including the in-memory `accessToken`) and redirect to `/login`. There's no built-in "silent refresh on a
timer" — the access token just expires (15 min) and the next request will 401, which is the trigger to
refresh.

### 2.3 `GET /auth/me` response shape

Call this once on login-success and once on app-mount (after the refresh above) to resolve the access token
into "who is logged in and what can they do," instead of `GET /users` + `GET /roles` with a client-side email
match (which breaks on cold reload and requires permissions the caller may not hold just to identify
themselves).

```json
{
  "documentId": "…",
  "email": "user@example.com",
  "name": "Jane Doe",
  "username": "janedoe",
  "accountType": false,
  "verified": true,
  "roleId": "…",
  "role": {
    "documentId": "…",
    "name": "Editor",
    "slug": "editor",
    "level": 20,
    "isDefault": false,
    "permissions": ["document:read", "document:update"],
    "createdAt": "…",
    "updatedAt": "…",
    "updatedBy": null
  },
  "createdAt": "…",
  "updatedAt": "…"
}
```

`role` is `null` if `roleId` is `null` (no role assigned yet). `role.permissions`/`level`/`slug` are read fresh
from the database on every call, not cached from the JWT — a role edit can take up to the access token's
~15-minute TTL to show up here, matching how long it takes `PermissionsGuard` itself to pick up the change.

## 3. Error shape

No custom exception filter is registered, so every error is Nest's default `HttpException` JSON shape:

```json
{
  "statusCode": 400,
  "message": "email must be an email",
  "error": "Bad Request"
}
```

`message` is a **string** for most handler-thrown errors, but can be a **string array** for `ValidationPipe`
failures (the pipe runs with `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown body
fields are rejected outright with `400`, not silently dropped). Handle both shapes:

```js
const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
```

Status codes you'll see across the API: `200`, `201`, `204` (no body — delete/publish-adjacent routes),
`400`, `401`, `403`, `404`, `409` (uniqueness conflicts), `413` (media upload too large), `422` (unsupported
media type), `429` (rate limit on auth-mutation routes — see §2.2's "Rate-limited" column).

## 4. Authorization model (everything except `/auth/*` and public document routes)

Every other module is guarded by `JwtAuthGuard` (reads `Authorization: Bearer <accessToken>`) and, on most routes,
`PermissionsGuard` (checks the caller's role permissions against a `@RequirePermissions("resource:action")`
decorator). Two status codes to distinguish in the UI:

- `401` — not logged in / session expired → redirect to login.
- `403` — logged in, but lacks the permission → show "you don't have access to this," don't redirect.

Permission slugs are always `resource:action`, lowercase, flat (no hierarchy/inheritance — a role just holds an
array of slugs). Full current catalog:

```
document:read  document:create  document:update  document:delete  document:publish  document:unpublish
user:read  user:manager  user:role_manager
role:read  role:manager
permission:read  permission:manager
api_token:read  api_token:manager
media:read  media:manager
content_type:read
```

`document:*` slugs are the one exception to plain `resource:action`: each also exists in a scoped 3-segment
form, `document:<action>:<content-type-slug>` (e.g. `document:read:cv-page`), auto-synced into the catalog for
every content type on boot. A grant of the global 2-segment slug still authorizes the action across every
content type; the 3-segment form narrows it to just that one. Both forms are ordinary entries in
`GET /api/v1/permissions` — CMS-Admin's picker (`PermissionTree`) renders the `document` group as a per-action
"All content types" vs. "Specific content types" toggle (backed by `GET /api/v1/content-types` for the
checkbox list) instead of a flat checkbox list, and builds/parses the 3-segment slug accordingly. No other
resource has this scoping.

Default seeded roles: `super_admin` (level 100, every permission), `admin` (level 50, read-only across every
resource), `editor` (level 20, no permissions by default — grant explicitly), `guest` (level 0, no
permissions). CMS-Admin should fetch `GET /api/v1/permissions` and `GET /api/v1/roles` to build its own
role/permission-management screens dynamically rather than hardcoding this list — it's a live catalog, not a
constant.

One asymmetric route worth knowing about: `PUT /api/v1/users/:id` (self-service profile update) is guarded by
`JwtAuthGuard` only — **no permission check** — because a user can always edit their own profile; editing
*someone else's* is allowed only if the caller holds `user:manager`, and that check happens inside the service,
not the guard, so a `403` from this specific route means "you don't outrank/aren't this user," not "missing
permission slug."

## 5. Module reference

All paths below are relative to `/api/v1` unless marked public. `@ApiBearerAuth` = requires
`Authorization: Bearer <accessToken>`.

### 5.1 Users — `/users`

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /users` | `user:read` | — | `200 UserResponseDto[]` — **not paginated**, returns everything. |
| `PUT /users/:id` | none (self or `user:manager`, see §4) | `UpdateUserDto` (`name?`, `password?`) | `200 UserResponseDto` |
| `PATCH /users/:id/role` | `user:role_manager` | `{ roleId }` | `200 UserResponseDto`; `403` on level-hierarchy/super-admin-promotion violation |
| `DELETE /users/:id` | `user:manager` | — | `204` |

`UserResponseDto`: `documentId, email, name, username, accountType, verified, roleId (string|null), createdAt,
updatedAt`. There is no `GET /users/:id` (single-user fetch) — list-then-find-client-side, or ask backend to
add it if the admin UI needs a dedicated detail route.

⚠️ `UpdateUserDto.password` is stored **without hashing** by this route today (documented gap, see
`docs/documents/users.md`) — don't build a "change my password" flow against it without flagging this to the
backend team first; consider gating that UI behind a fix.

### 5.2 Roles — `/roles`

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /roles` | `role:read` | — | `200 RoleResponseDto[]` |
| `POST /roles` | `role:manager` | `CreateRoleDto` | `201 RoleResponseDto`; `400` unknown permission slug, `409` slug exists |
| `PUT /roles/:id` | `role:manager` | `UpdateRoleDto` (all optional) | `200 RoleResponseDto`; `400` default role's name/level is immutable |
| `DELETE /roles/:id` | `role:manager` | — | `204`; `400` default roles can't be deleted, `409` still assigned to users |

`CreateRoleDto`: `name, slug` (lowercase-hyphenated, immutable after creation), `permissions: string[]`,
`level: number` (0–100). No `GET /roles/:id`.

### 5.3 Permissions — `/permissions`

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /permissions` | `permission:read` | — | `200 PermissionResponseDto[]` |
| `POST /permissions` | `permission:manager` | `{ slug, name, description }` | `201 PermissionResponseDto`; `409` slug exists |
| `PUT /permissions/:id` | `permission:manager` | `{ name?, description? }` | `200 PermissionResponseDto` — slug is not updatable |
| `DELETE /permissions/:id` | `permission:manager` | — | `204`; `409` `{ message, roleCount, accessTokenCount }` if still referenced — surface those counts in a confirm dialog rather than a generic error toast |

### 5.4 Access Tokens — `/access-tokens`

API keys for machine clients, not for CMS-Admin's own session — but the admin UI needs a management screen for
them.

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /access-tokens` | `api_token:read` | — | `200 AccessTokenResponseDto[]` — **no `token` field**, secret is never listed again |
| `POST /access-tokens` | `api_token:manager` | `CreateAccessTokenDto` | `201 AccessTokenSecretResponseDto` — includes plaintext `token` **once** |
| `POST /access-tokens/:id/revoke` | `api_token:manager` | `RevokeAccessTokenDto` (all fields optional, unset = keep current value) | `200 AccessTokenSecretResponseDto` — secret always rotates, new plaintext `token` shown once |
| `DELETE /access-tokens/:id` | `api_token:manager` | — | `204` |

`CreateAccessTokenDto.expiresIn` enum: `"30m" | "1h" | "1d" | "1m" | "1y" | "never"`. An empty `permissions`
array skips slug validation entirely (treated as "no scoped permissions").

**UX note**: because the plaintext token is only ever returned once (create/revoke response), the admin UI
must show it in a copy-to-clipboard modal immediately and warn it won't be shown again — there's no "reveal
token" affordance to fall back on.

### 5.5 Content Types — `/content-types`

Schema itself (`fields`/`kind`/`draftToPublish`) is defined as schema-as-code on the backend (JSON files), not
created/edited through the API. `listFields` — the "Configure columns" list-view projection — is the one
admin-mutable exception, via the `PATCH .../list-fields` route below.

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /content-types` | `content_type:read` | — | `200 ContentTypeSummaryResponseDto[]` — `{ slug, name, kind: "single"\|"collection", draftToPublish }` |
| `GET /content-types/:slug` | `content_type:read` | — | `200 ContentTypeResponseDto` — adds `documentId, fields: FieldDefinitionResponseDto[], listFields, createdAt, updatedAt`; `404` if slug unknown |
| `PATCH /content-types/:slug/list-fields` | `content_type:manager` | `{ listFields: string[] }` | `200 ContentTypeResponseDto` — same shape as `GET :slug`, `listFields` reflects the new value; `400` if the array is empty or any entry isn't a listable system column (`documentId`, `status`, `createdAt`, `updatedAt`, `publishedAt`, `updatedBy`) or an eligible field (`text`/`number`/`boolean` kind only — `richtext`/`media`/`json`/`component` fields aren't listable); `404` if slug unknown |

`content_type:manager` is granted to `super_admin` only today — expect `403` for every other role, including
`admin`. The PATCH persists across a backend restart/redeploy (it's stored separately from the schema-sync
process that re-derives `fields`/`kind`/`draftToPublish` from the JSON files on every boot).

`FieldDefinitionResponseDto`: `{ name, type: "text"|"richtext"|"number"|"boolean"|"media"|"json"|"component",
width?, header?, component?, repeatable?, fields? }` — `component`/`repeatable`/`fields` are only present when
`type === "component"`, and `fields` recurses (nested component fields use the same shape).

**Drive your document-editor form generation off this response** — field `type` picks the input widget,
`header: true` marks which fields show as list-table columns by default, `listFields` on the content type is
the actual configured projection for `GET .../collection-type/:slug` list responses. `listFields` entries that
name a system column (`documentId`, `status`, `createdAt`, `updatedAt`, `publishedAt`, `updatedBy`) now render
real values in list `data` — see §5.7 and §6 below.

`draftToPublish` matters for the publish/unpublish buttons: when `false` ("Mode B" content types), publish and
unpublish routes will `400` — hide or disable those buttons for that content type rather than letting the user
hit the error.

### 5.6 Documents — single-type — `/documents/single-type/:slug`

No delete route (single-types are never deleted, only overwritten).

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /documents/single-type/:slug` | `document:read` | — | `200 DocumentResponseDto`; `404` if never saved |
| `PUT /documents/single-type/:slug` | `document:update` | `SaveDocumentDto` = `{ data: <content-type's fields> }` | `200 DocumentResponseDto` — create-or-update semantics, no separate "create" call needed |
| `POST /documents/single-type/:slug/publish` | `document:publish` | — | `200 { status: "published" }`; `400` if `draftToPublish` is `false` for this content type |
| `POST /documents/single-type/:slug/unpublish` | `document:unpublish` | — | `200 { status: "draft" }`; `400` (same as above) |

### 5.7 Documents — collection-type — `/documents/collection-type/:slug`

⚠️ Route order matters server-side (`/bulk` is declared before `/:documentId`) — not something you need to
replicate client-side, just don't be surprised that `/bulk` isn't treated as a `documentId` value.

| Method & path | Permission | Body/Query | Response |
|---|---|---|---|
| `GET /documents/collection-type/:slug` | `document:read` | query: see §6 | `200 ListDocumentsResponseDto` |
| `POST /documents/collection-type/:slug` | `document:create` | `SaveDocumentDto` | `201 DocumentResponseDto` |
| `GET /documents/collection-type/:slug/:documentId` | `document:read` | — | `200 DocumentResponseDto`; `404` |
| `PUT /documents/collection-type/:slug/:documentId` | `document:update` | `SaveDocumentDto` | `200 DocumentResponseDto` |
| `DELETE /documents/collection-type/:slug/:documentId` | `document:delete` | — | `204`; `404` |
| `POST .../:documentId/publish` | `document:publish` | — | `200 { status: "published" }`; `400` (Mode B) |
| `POST .../:documentId/unpublish` | `document:unpublish` | — | `200 { status: "draft" }`; `400` |
| `POST .../:documentId/duplicate` | `document:create` | — | `201 DocumentResponseDto` (new draft copy); `404` source not found |
| `POST :slug/bulk` | **both** `document:create` **and** `document:publish` | `{ items: SaveDocumentDto[] }` (1–100) | `201 { items: DocumentResponseDto[] }` — creates *and publishes* every item; if any item fails, **all prior successes in the batch are rolled back** (all-or-nothing) |
| `DELETE :slug/bulk` | `document:delete` | `{ documentIds: string[] }` (1–100) | `200 { deleted: string[], failed: [{documentId, error}] }` — **partial success, no rollback** — the UI must reconcile `deleted` vs `failed` per-row, this isn't atomic like bulk-create |

Note the bulk create/delete asymmetry (all-or-nothing vs. partial-success/no-rollback) — build the result
handling for each separately rather than sharing one "bulk result toast" component.

`DocumentResponseDto` = `{ data: { documentId, status: "draft"|"modified"|"published", createdAt, updatedAt,
updatedBy: { documentId, name } | null, ...every dynamic content-type field spread alongside these } }`. The
dynamic fields aren't enumerable from the schema (TS can't type an open index signature) — read them off
`GET /content-types/:slug`'s `fields` list at runtime instead of hardcoding per content type.

`updatedBy` is `null` when the document has never been saved by an authenticated caller, or when the
recorded user id no longer resolves to an existing user — never a missing key, and this route never `404`s
or `500`s because of it. **Not present on `/public/documents/*` responses** (§5.8) — those stay exactly as
before, no `updatedBy` key at all, by design (public responses don't expose internal editor identities).

### 5.8 Public documents (no auth) — `/public/documents`

Always resolves the **published** version only (never draft). Use these for any public-facing site the CMS
feeds, not for the admin UI's own editing views (which need drafts too, via §5.6/5.7).

| Method & path | Response |
|---|---|
| `GET /public/documents/single-type/:slug` | `200 DocumentResponseDto`; `404` if nothing published |
| `GET /public/documents/collection-type/:slug/:documentId` | `200 DocumentResponseDto`; `404` |

### 5.9 Media — `/media`

| Method & path | Permission | Body | Response |
|---|---|---|---|
| `GET /media` | `media:read` | — | `200 MediaAssetResponseDto[]` — **not paginated**, newest first |
| `POST /media/upload` | `media:manager` | `multipart/form-data`, field name `file` | `201 MediaAssetResponseDto`; `400` no file, `413` over size limit, `422` unsupported type (**PNG/JPEG only** today) |
| `DELETE /media/:id` | `media:manager` | — | `204`; `404` |

`MediaAssetResponseDto`: `documentId, fileName, mimeType (sniffed from bytes, not the upload's declared
Content-Type — don't trust the browser's guess either), size, width, height, url, thumbnailUrl, publicId, hash
(SHA-256), uploadedBy, createdAt, updatedAt`.

```js
const form = new FormData();
form.append("file", fileInput.files[0]);
await fetch("/api/v1/media/upload", { method: "POST", credentials: "include", body: form });
// don't set Content-Type manually — let the browser set the multipart boundary
```

## 6. Collection-list pagination & filtering (`GET /documents/collection-type/:slug` only)

This is the only endpoint with real pagination/filtering. Query params (all optional, all sent as strings):

| Param | Meaning | Default |
|---|---|---|
| `start` | offset, non-negative integer | `0` |
| `size` | page size, 1–100 | `20` |
| `orderBy` | a system column or a text/number/boolean field on the content type (allowlisted server-side) | `id` |
| `sortDir` | `asc` \| `desc` | `desc` |
| `search` | case-insensitive substring match, OR'd across the content type's text/richtext list fields | — |
| `filters` | per-field filters, see below | — |

`filters` is a nested object sent as `filters[field][$op]=value`, e.g.
`?filters[title][$contains]=engineer&filters[age][$gte]=18`. Operators by field kind:

- text: `$eq`, `$ne`, `$contains`
- number / timestamp system columns (`created_at`, `updated_at`, `published_at`): `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- boolean / `id` / `document_id`: `$eq`, `$ne` (boolean values must be the **string** `"true"`/`"false"`, not a JS boolean)

One operator per field; richtext/media/json/component fields aren't filterable or sortable (not in the
allowlist). All filters AND together, and AND with `search`.

`ListDocumentsResponseDto`: `{ items: ListedDocumentItemResponseDto[], total, start, size }`. Each item's
`data` is **projected down to the content type's configured `listFields` only** — not the full document — so
don't expect to render a full detail view from list data; fetch the single document on row-click. If
`listFields` includes a system column (`documentId`/`status`/`createdAt`/`updatedAt`/`publishedAt`/`updatedBy`),
`data` carries the real resolved value for it — e.g. `listFields: ["title", "updatedAt", "updatedBy"]` renders
`data.updatedAt` as the real timestamp and `data.updatedBy` as `{ documentId, name } | null`, not `null`
placeholders. This is what makes "Updated By" usable as a Configure-columns choice (§5.5).

## 7. Known gaps vs. a "complete" CMS-Admin API surface

Things you may expect from a typical admin-panel API that **don't exist yet** in this backend — worth flagging
to the backend team rather than working around client-side:

- **No pagination on `GET /users` or `GET /media`** — fine for now, but a growing user/media table will need
  server-side paging eventually; don't build the admin table component assuming every list endpoint paginates
  the same way as documents.
- **No `GET /users/:id` or `GET /roles/:id`** single-fetch routes — detail views must reuse the list response.
- **No locale/i18n support anywhere** (no `locale` query param on any route, no locales module) — if the admin
  UI needs multi-language content, that's not implemented server-side.

## 8. Quick smoke-test sequence

Useful for verifying an environment before wiring up real UI:

```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/api/v1/auth/has-users
TOKEN=$(curl -s -c cookies.txt -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"...","password":"..."}' | jq -r .accessToken)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/auth/me
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/users
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/content-types
# cookies.txt still carries refresh_token — needed only for a follow-up POST /auth/refresh
```
