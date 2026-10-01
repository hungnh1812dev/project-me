# API Reference

Per-endpoint reference for `abyssoftime-cms-api`, for use building the CMS-Admin frontend. Every endpoint is
listed as **Endpoint / Request / Response / Error** — nothing else. For the surrounding context (hybrid
cookie/Bearer auth model, CORS, permission catalog, pagination/filter syntax, gotchas) see
`docs/cms-admin-integration.md`; this file is the flat lookup table that guide's §5 tables summarize in prose.

All paths are relative to `/api/v1` unless marked **public**/**unprefixed**. `Auth: bearer` means
`JwtAuthGuard` (send `Authorization: Bearer <accessToken>`, plus `credentials: "include"` since `refresh_token`
still rides along as a cookie); a permission slug means `PermissionsGuard` also applies on top of the bearer
check.

## Error envelope (applies to every endpoint below)

Every non-2xx response is Nest's default `HttpException` shape:

```json
{ "statusCode": 400, "message": "email must be an email", "error": "Bad Request" }
```

`message` is a string, or a string array for `ValidationPipe` failures (unknown body fields → `400`, not
silently dropped). Per-endpoint **Error** entries below list only the status codes and conditions specific to
that route, not this envelope.

---

## Health

#### `GET /health` (unprefixed, no `/api/v1`)
- **Request:** —
- **Response:** `200 { status: "ok" }`
- **Error:** none

---

## Auth — `/auth`

#### `GET /auth/has-users`
- **Auth:** none
- **Request:** —
- **Response:** `200 { hasUsers: boolean }`
- **Error:** none

#### `POST /auth/register`
- **Auth:** none · rate-limited
- **Request:** `RegisterDto { email: string, name: string, username: string (3-32 chars, /^[a-zA-Z0-9_.-]+$/), password: string (min 8), accountType: boolean }`
- **Response:** `201 MessageResponseDto { message: string }`
- **Error:** `409` email or username already in use; `429` rate limited

#### `POST /auth/verify-otp`
- **Auth:** none · rate-limited
- **Request:** `VerifyOtpDto { email: string, otp: string (6 digits) }`
- **Response:** `200 MessageResponseDto`
- **Error:** `400` no pending OTP / expired / mismatch; `404` no account with that email; `409` already verified; `429`

#### `POST /auth/resend-otp`
- **Auth:** none · rate-limited
- **Request:** `ResendOtpDto { email: string }`
- **Response:** `200 MessageResponseDto`
- **Error:** `404` no account; `409` already verified; `429`

#### `POST /auth/login`
- **Auth:** none · rate-limited
- **Request:** `LoginDto { email: string, password: string }`
- **Response:** `200 { message: string, accessToken: string }`, sets `refresh_token` httpOnly cookie — hold `accessToken` in memory client-side, attach as `Authorization: Bearer <accessToken>`
- **Error:** `401` unknown email or wrong password (message intentionally identical for both); `403` email not yet verified; `429`

#### `POST /auth/refresh`
- **Auth:** `refresh_token` cookie (read via `JwtRefreshGuard`)
- **Request:** — (cookie only)
- **Response:** `200 { message: string, accessToken: string }` (rotated), rotates `refresh_token` cookie
- **Error:** `401` cookie missing/invalid/expired — treat as session-ended, redirect to login

#### `POST /auth/logout`
- **Auth:** none required
- **Request:** —
- **Response:** `200 MessageResponseDto`, clears `refresh_token` cookie (no access-token cookie left to clear)
- **Error:** none — always succeeds even if not logged in

#### `GET /auth/me`
- **Auth:** bearer (`JwtAuthGuard`), no permission requirement
- **Request:** —
- **Response:** `200 MeResponseDto { documentId, email, name, username, accountType, verified, roleId: string|null, createdAt, updatedAt, role: RoleResponseDto|null }` — `role` embeds `{ documentId, name, slug, permissions: string[], level, isDefault, createdAt, updatedAt, updatedBy }`, read fresh from the DB every call (not decoded from the JWT)
- **Error:** `401` missing/invalid/expired access token, or account deleted after token issuance; `404` `roleId` doesn't resolve to an existing role (shouldn't happen in normal operation)

#### `POST /auth/forgot-password`
- **Auth:** none · rate-limited
- **Request:** `ForgotPasswordDto { email: string }`
- **Response:** `200 MessageResponseDto` — always success regardless of whether the email exists (enumeration prevention)
- **Error:** `429` only

#### `POST /auth/reset-password`
- **Auth:** none · rate-limited
- **Request:** `ResetPasswordDto { token: string (plaintext, emailed, 1h expiry), newPassword: string (min 8) }`
- **Response:** `200 MessageResponseDto`
- **Error:** `400` invalid/expired token; `429`

---

## Users — `/users`

#### `GET /users`
- **Auth:** `user:read`
- **Request:** —
- **Response:** `200 UserResponseDto[]` — **not paginated**, returns every user. `UserResponseDto { documentId, email, name, username, accountType, verified, roleId: string|null, createdAt, updatedAt }`
- **Error:** `403` missing permission

#### `PUT /users/:id`
- **Auth:** bearer only — no permission slug (self-service; editing someone else additionally requires `user:manager`, checked in the service layer)
- **Request:** `UpdateUserDto { name?: string, password?: string }` — ⚠️ `password` is stored **without hashing** by this route (known gap)
- **Response:** `200 UserResponseDto`
- **Error:** `403` caller isn't this user and lacks `user:manager` (not a missing-permission-slug 403); `404` unknown id

#### `PATCH /users/:id/role`
- **Auth:** `user:role_manager`
- **Request:** `UpdateUserRoleDto { roleId: string }`
- **Response:** `200 UserResponseDto`
- **Error:** `403` level-hierarchy or super-admin-promotion violation; `404` unknown user/role id

#### `DELETE /users/:id`
- **Auth:** `user:manager`
- **Request:** —
- **Response:** `204` no body
- **Error:** `404` unknown id

---

## Roles — `/roles`

#### `GET /roles`
- **Auth:** `role:read`
- **Request:** —
- **Response:** `200 RoleResponseDto[] { documentId, name, slug, permissions: string[], level, isDefault, createdAt, updatedAt, updatedBy: string|null }`
- **Error:** `403`

#### `POST /roles`
- **Auth:** `role:manager`
- **Request:** `CreateRoleDto { name: string, slug: string (lowercase-hyphenated, max 63 chars, immutable), permissions: string[] (unique), level: number (0-100) }`
- **Response:** `201 RoleResponseDto`
- **Error:** `400` unknown permission slug; `409` slug already exists

#### `PUT /roles/:id`
- **Auth:** `role:manager`
- **Request:** `UpdateRoleDto { name?, permissions?: string[], level?: number (0-100) }` — all optional
- **Response:** `200 RoleResponseDto`
- **Error:** `400` default role's `name`/`level` is immutable, or unknown permission slug; `404` unknown id

#### `DELETE /roles/:id`
- **Auth:** `role:manager`
- **Request:** —
- **Response:** `204`
- **Error:** `400` default roles can't be deleted; `404` unknown id; `409` still assigned to at least one user

---

## Permissions — `/permissions`

#### `GET /permissions`
- **Auth:** `permission:read`
- **Request:** —
- **Response:** `200 PermissionResponseDto[] { documentId, slug, name, description?, createdAt, updatedAt, updatedBy: string|null }`
- **Error:** `403`

#### `POST /permissions`
- **Auth:** `permission:manager`
- **Request:** `CreatePermissionDto { slug: string ("resource:action", lowercase), name: string, description: string }`
- **Response:** `201 PermissionResponseDto`
- **Error:** `409` slug already exists

#### `PUT /permissions/:id`
- **Auth:** `permission:manager`
- **Request:** `UpdatePermissionDto { name?: string, description?: string }` — slug is not updatable
- **Response:** `200 PermissionResponseDto`
- **Error:** `404` unknown id

#### `DELETE /permissions/:id`
- **Auth:** `permission:manager`
- **Request:** —
- **Response:** `204`
- **Error:** `404` unknown id; `409 { message, roleCount, accessTokenCount }` if still referenced — surface those counts in a confirm dialog rather than a generic toast

---

## Access Tokens — `/access-tokens`

API keys for machine clients (not CMS-Admin's own session), but the admin UI needs a management screen.

#### `GET /access-tokens`
- **Auth:** `api_token:read`
- **Request:** —
- **Response:** `200 AccessTokenResponseDto[] { documentId, name, permissions: string[], expiresAt: Date|null, createdAt, updatedAt, updatedBy: string|null }` — no `token` field, secret is never listed again
- **Error:** `403`

#### `POST /access-tokens`
- **Auth:** `api_token:manager`
- **Request:** `CreateAccessTokenDto { name: string, permissions: string[] (unique; empty array skips slug validation entirely), expiresIn: "30m"|"1h"|"1d"|"1m"|"1y"|"never" }`
- **Response:** `201 AccessTokenSecretResponseDto` — same fields as `AccessTokenResponseDto` plus `token: string` (plaintext, shown **once**)
- **Error:** `400` unknown permission slug (unless `permissions` is empty)

#### `POST /access-tokens/:id/revoke`
- **Auth:** `api_token:manager`
- **Request:** `RevokeAccessTokenDto { name?, permissions?: string[], expiresIn? }` — all optional, unset falls back to the current value; secret always rotates regardless of what's provided
- **Response:** `200 AccessTokenSecretResponseDto` — new plaintext `token` shown once
- **Error:** `404` unknown id

#### `DELETE /access-tokens/:id`
- **Auth:** `api_token:manager`
- **Request:** —
- **Response:** `204`
- **Error:** `404` unknown id

---

## Content Types — `/content-types`

Schema itself (`fields`/`kind`/`draftToPublish`) is schema-as-code (JSON files), not editable through the API.
`listFields` (the "Configure columns" projection) is the one admin-mutable exception.

#### `GET /content-types`
- **Auth:** `content_type:read`
- **Request:** —
- **Response:** `200 ContentTypeSummaryResponseDto[] { slug, name, kind: "single"|"collection", draftToPublish }`
- **Error:** `403`

#### `GET /content-types/:slug`
- **Auth:** `content_type:read`
- **Request:** —
- **Response:** `200 ContentTypeResponseDto` — summary fields plus `{ documentId, fields: FieldDefinitionResponseDto[], listFields: string[], createdAt, updatedAt }`. `FieldDefinitionResponseDto { name, type: "text"|"richtext"|"number"|"boolean"|"media"|"json"|"component", width?, header?, component?, repeatable?, fields? }` — `component`/`repeatable`/`fields` only present when `type === "component"`, `fields` recurses.
- **Error:** `400` unsafe/malformed slug; `404` unknown slug

#### `PATCH /content-types/:slug/list-fields`
- **Auth:** `content_type:manager` (seeded to `super_admin` only — expect `403` for every other role)
- **Request:** `UpdateListFieldsDto { listFields: string[] }` (non-empty)
- **Response:** `200 ContentTypeResponseDto` — same shape as `GET :slug`, `listFields` reflects the new value; persists across a backend restart
- **Error:** `400` unsafe/malformed slug, empty array, or an entry that isn't a listable system column (`id`, `documentId`, `status`, `createdAt`, `updatedAt`, `publishedAt`, `updatedBy`) or an eligible field (`text`/`number`/`boolean` kind only); `403` caller isn't `super_admin`; `404` unknown slug

---

## Documents — single-type — `/documents/single-type/:slug`

No delete route — single-types are never deleted, only overwritten.

#### `GET /documents/single-type/:slug`
- **Auth:** `document:read`
- **Request:** —
- **Response:** `200 DocumentResponseDto` — see shared shape below
- **Error:** `404` never saved yet

#### `PUT /documents/single-type/:slug`
- **Auth:** `document:update`
- **Request:** `SaveDocumentDto { data: Record<string, unknown> }` — shape depends on the content type's schema
- **Response:** `200 DocumentResponseDto` — create-or-update semantics, no separate create call
- **Error:** `400` invalid field data for this content type's schema

#### `POST /documents/single-type/:slug/publish`
- **Auth:** `document:publish`
- **Request:** —
- **Response:** `200 { status: "published" }`
- **Error:** `400` `draftToPublish` is `false` for this content type

#### `POST /documents/single-type/:slug/unpublish`
- **Auth:** `document:unpublish`
- **Request:** —
- **Response:** `200 { status: "draft" }`
- **Error:** `400` (same as above)

---

## Documents — collection-type — `/documents/collection-type/:slug`

⚠️ `/bulk` routes are declared before `/:documentId` server-side — not something to replicate client-side.

#### `GET /documents/collection-type/:slug`
- **Auth:** `document:read`
- **Request:** query params — see "Collection-list pagination & filtering" below
- **Response:** `200 ListDocumentsResponseDto { items: ListedDocumentItemResponseDto[], total, start, size }` — each item carries `id: number` (the DB-generated autoincrement key, internal ordering only — not a stable public identifier, use `documentId` for that) alongside `documentId`, `status`, `createdAt`, `updatedAt`, `updatedBy`; `data` is separately projected to the content type's configured `listFields` only
- **Error:** `400` invalid query param

#### `POST /documents/collection-type/:slug`
- **Auth:** `document:create`
- **Request:** `SaveDocumentDto { data }`
- **Response:** `201 DocumentResponseDto`
- **Error:** `400` invalid field data

#### `GET /documents/collection-type/:slug/:documentId`
- **Auth:** `document:read`
- **Request:** —
- **Response:** `200 DocumentResponseDto`
- **Error:** `404` unknown documentId

#### `PUT /documents/collection-type/:slug/:documentId`
- **Auth:** `document:update`
- **Request:** `SaveDocumentDto { data }`
- **Response:** `200 DocumentResponseDto`
- **Error:** `400` invalid field data; `404` unknown documentId

#### `DELETE /documents/collection-type/:slug/:documentId`
- **Auth:** `document:delete`
- **Request:** —
- **Response:** `204`
- **Error:** `404` unknown documentId

#### `POST /documents/collection-type/:slug/:documentId/publish`
- **Auth:** `document:publish`
- **Request:** —
- **Response:** `200 { status: "published" }`
- **Error:** `400` `draftToPublish` is `false`

#### `POST /documents/collection-type/:slug/:documentId/unpublish`
- **Auth:** `document:unpublish`
- **Request:** —
- **Response:** `200 { status: "draft" }`
- **Error:** `400` `draftToPublish` is `false`

#### `POST /documents/collection-type/:slug/:documentId/duplicate`
- **Auth:** `document:create`
- **Request:** —
- **Response:** `201 DocumentResponseDto` — new draft copy of the source document
- **Error:** `404` source document not found

#### `POST /documents/collection-type/:slug/bulk`
- **Auth:** **both** `document:create` and `document:publish`
- **Request:** `BulkCreateDto { items: SaveDocumentDto[] }` (1-100 items)
- **Response:** `201 BulkCreateResponseDto { items: DocumentResponseDto[] }` — creates *and publishes* every item; `updatedBy` on every item is resolved once for the whole batch (all items share the caller's id)
- **Error:** `400` invalid field data on any item — **all prior successes in the batch are rolled back** (all-or-nothing, including the current item if it failed at the publish step)

#### `DELETE /documents/collection-type/:slug/bulk`
- **Auth:** `document:delete`
- **Request:** `BulkDeleteDto { documentIds: string[] }` (1-100 items)
- **Response:** `200 BulkDeleteResponseDto { deleted: string[], failed: { documentId, error? }[] }` — **partial success, no rollback**
- **Error:** none at the route level — per-id failures surface inside the 200 response's `failed` array

### Shared shape: `DocumentResponseDto`

```
{ data: {
    documentId: string,
    status: "draft" | "modified" | "published",
    createdAt: Date,
    updatedAt: Date,
    updatedBy: { documentId: string, name: string } | null,
    ...every dynamic content-type field spread alongside these
} }
```

Dynamic fields aren't enumerable from the schema — read them off `GET /content-types/:slug`'s `fields` list at
runtime rather than hardcoding per content type. `updatedBy` is `null` when never saved by an authenticated
caller, or when the recorded user id no longer resolves to an existing user — never a missing key, never
throws.

---

## Public documents (no auth) — `/public/documents`

Always resolves the **published** version only (never draft). `updatedBy` is never present on these responses
(no `updatedBy` key at all — by design, public responses don't expose internal editor identities).

#### `GET /public/documents/single-type/:slug`
- **Auth:** none (public, unauthenticated)
- **Request:** —
- **Response:** `200 DocumentResponseDto` (no `updatedBy` key)
- **Error:** `404` nothing published yet

#### `GET /public/documents/collection-type/:slug/:documentId`
- **Auth:** none
- **Request:** —
- **Response:** `200 DocumentResponseDto` (no `updatedBy` key)
- **Error:** `404` unknown documentId or nothing published

---

## Media — `/media`

#### `GET /media`
- **Auth:** `media:read`
- **Request:** —
- **Response:** `200 MediaAssetResponseDto[]` — **not paginated**, newest first. `{ documentId, fileName, mimeType (sniffed from bytes), size, width, height, url, thumbnailUrl, publicId, hash (SHA-256), uploadedBy: string|null, createdAt, updatedAt }`
- **Error:** `403`

#### `POST /media/upload`
- **Auth:** `media:manager`
- **Request:** `multipart/form-data`, field name `file` — don't set `Content-Type` manually, let the browser set the multipart boundary
- **Response:** `201 MediaAssetResponseDto`
- **Error:** `400` no file provided; `413` over size limit; `422` unsupported type (PNG/JPEG only today)

#### `DELETE /media/:id`
- **Auth:** `media:manager`
- **Request:** —
- **Response:** `204`
- **Error:** `404` unknown id

---

## Collection-list pagination & filtering

Applies only to `GET /documents/collection-type/:slug`. Query params (optional, sent as strings):

| Param | Meaning | Default |
|---|---|---|
| `start` | offset, non-negative integer | `0` |
| `size` | page size, 1-100 | `20` |
| `orderBy` | system column or text/number/boolean field (allowlisted) | `id` |
| `sortDir` | `asc` \| `desc` | `desc` |
| `search` | case-insensitive substring, OR'd across text/richtext list fields | — |
| `filters` | per-field filters, `filters[field][$op]=value` | — |

Filter operators by field kind: text → `$eq` `$ne` `$contains`; number/timestamp system columns
(`created_at`/`updated_at`/`published_at`) → `$eq` `$ne` `$gt` `$gte` `$lt` `$lte`; boolean/`id`/`document_id` →
`$eq` `$ne` (boolean values as the **string** `"true"`/`"false"`). One operator per field; all filters AND
together, and AND with `search`. richtext/media/json/component fields aren't filterable or sortable.
