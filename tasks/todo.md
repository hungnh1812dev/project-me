# Task List: Abyss CMS v1

Spec: [../SPEC.md](../SPEC.md) · Plan: [plan.md](plan.md)

Conventions for every task:
- **Definition of Done:** tests pass (`pnpm turbo run test --filter=<pkg>`), `pnpm turbo run lint typecheck` clean, `pnpm format` run, docs/`.env.example` updated, no literals (see `code-standards`).
- "§" refers to SPEC.md sections. "C#" refers to the review findings fixed by SPEC §7.
- Size: S = 1–2 files · M = 3–5 files.

---

## Phase 0: Walking skeleton

- [ ] **T01: Monorepo + tooling isolation** · M · Deps: none
  - Acceptance:
    - pnpm workspace + `turbo.json` (`build` dependsOn `^build`, outputs `dist/**`); `abyss.code-workspace` with one folder per app/package
    - `tsconfig.base.json` has compilerOptions only; each project has its own tsconfig, ESLint, Oxlint and `.prettierrc.cjs` extending `@abyss/prettier-config`
    - root scripts: `build`, `test`, `lint`, `typecheck`, `format`
  - Verify: `pnpm install && pnpm turbo run build --dry-run` shows form-commons before apps; `pnpm format` runs.
  - Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `abyss.code-workspace`, `packages/prettier-config/*`

- [ ] **T02: cms-api skeleton (config, pipeline, health)** · M · Deps: T01
  - Acceptance:
    - Zod env schema → frozen `IAppConfig`. Production refinements fail on console mail, missing secrets or short secrets (§12-15). Boot summary redacts secrets.
    - Express adapter, prefix `/api/v1`, strict routing off, `trust proxy` = `TRUST_PROXY_HOPS`, unified error filter `{statusCode,errorCode,message,requestId}`.
    - `GET /health/live` and `/health/ready` (DB ping) return `{status}` only.
  - Verify: integration tests for config failures, the trailing-slash route and health; `.env.example` lists every key.
  - Files: `apps/cms-api/src/{main.ts,config/env.schema.ts,config/app-config.ts,common/filters/http-exception.filter.ts,modules/health/*}`, `apps/cms-api/.env.example`

- [ ] **T03: @abyss/form-commons package (dist-only) + first components** · M · Deps: T01
  - Acceptance:
    - tsup builds ESM+CJS+d.ts+`styles.css` into `dist/`. `exports` point only into `dist`. `sideEffects` set so unused components tree-shake.
    - `components/ui/{button,input,label}` from the shadcn CLI. `components/forms/{Field,TextInput}` support RHF + native rules + Zod and set `aria-invalid`/`aria-describedby`.
  - Verify: Vitest component tests; `pnpm --filter @abyss/form-commons build` produces `dist/index.d.ts`.
  - Files: `packages/form-commons/{package.json,tsup.config.ts,components.json,src/index.ts,src/components/forms/Field/*,src/components/forms/TextInput/*}`

- [ ] **T04: cms-admin & web skeletons + Dockerfiles + proxy smoke test** · M · Deps: T02, T03 · Needs Q4 (placeholders OK)
  - Acceptance:
    - Both apps render a page that imports from `@abyss/form-commons` and calls `/api/v1/health/live` through `src/config/endpoints.ts`. The Axios client strips trailing slashes.
    - Multi-stage Dockerfiles (turbo prune, non-root). Nginx `absolute_redirect off; port_in_redirect off;`.
    - `docker-compose.smoke.yml` with Traefik routes `domain.localhost` (web + `/api`) and `admin.domain.localhost`. The smoke script asserts a POST with a trailing slash isn't 3xx and the admin→API CORS call succeeds.
  - Verify: `pnpm smoke` (compose up + script) passes.
  - Files: `apps/{cms-admin,web}/{src/main.tsx,src/config/endpoints.ts,Dockerfile,nginx.conf}`, `apps/cms-api/Dockerfile`, `docker-compose.smoke.yml`, `scripts/smoke.sh`

### Checkpoint 0
- [ ] `pnpm turbo run build lint typecheck test` green
- [ ] Smoke test green (zero CORS/308 issues)
- [ ] Review with user before Phase 1

---

## Phase 1: Content engine spike

- [ ] **T05: JSON schema format + definition validator** · M · Deps: T02
  - Acceptance:
    - Documented format (`docs/modules/content-schema.md`): kind, draftAndPublish, field types (string, text, richtext, integer, decimal, boolean, date, datetime, json, media, component, repeatable component), `sensitive` hint.
    - The validator rejects: depth > 3, identifiers that fail `^[a-z][a-z0-9_]*$`, composed table/column names > 63 bytes, collisions after normalisation, reserved names.
    - `content/schemas/cv-page.json` is ported from the old ERD (fix the `responsitoryLink` → `repositoryLink` typo).
  - Verify: unit tests for every rejection rule plus cv-page acceptance.
  - Files: `apps/cms-api/src/modules/content-engine/{definition.schema.ts,definition.validator.ts,naming.ts}`, `apps/cms-api/content/schemas/cv-page.json`, docs file

- [ ] **T06: SQL migration generator + content:migrate** · M · Deps: T05 · **Needs Q1**
  - Acceptance:
    - `content:generate` diffs the definitions against `content_types.definition_hash` and writes an SQL migration into `content/migrations/` (schema `content`, root partial unique indexes, component tables with `parent_id … ON DELETE CASCADE`, `component_uid`, `order_index`, indexes). Additive only unless `--allow-destructive`.
    - `content:migrate` applies pending migrations in a transaction with an advisory lock and upserts `content_types`.
  - Verify: Testcontainers test: cv-page → exactly 8 tables (§12-16); re-run is a no-op; a destructive change without the flag fails.
  - Files: `apps/cms-api/src/modules/content-engine/{sql-generator.ts,migration-runner.ts,cli/generate.ts,cli/migrate.ts}`, `package.json` scripts

- [ ] **T07: Content tree repository** · M · Deps: T06
  - Acceptance:
    - `ContentRepository.insertTree / loadTrees / replaceTree` for a slug, using parameterized SQL only. The slug and identifiers come from the registry, never from input.
    - Loading N roots with a 3-level tree runs 1 query for roots plus 1 per component table that has requested rows (batched `parent_id = ANY($1::int[])`).
    - `replaceTree` keeps `component_uid` for components the client sends back, deletes the rest (cascade), and runs inside the caller's transaction.
  - Verify: integration tests: round trip, query count assertion, cascade removes no rows belonging to another root.
  - Files: `apps/cms-api/src/modules/content-engine/{content.repository.ts,tree-loader.ts,registry.service.ts}`, tests

### Checkpoint 1
- [ ] §12-16 green; tree round trip green
- [ ] Review the content engine design with the user (highest-risk area)

---

## Phase 2: Identity

- [ ] **T08: Core Prisma schema, system roles seed, owner:bootstrap** · M · Deps: T02
  - Acceptance:
    - Prisma models for every §8.1 table (schema `public`). `created_by` uses ON DELETE SET NULL. Partial unique index for the single owner (raw SQL in the migration).
    - Seed system roles (`public, guest, reviewer, editor, admin, owner`) with immutable slug/rank.
    - `owner:bootstrap` CLI: advisory lock, refuses if an owner exists, Argon2id hash (§12-1).
  - Verify: integration tests: first run ok, second run fails, concurrent runs → exactly one owner.
  - Files: `apps/cms-api/prisma/{schema.prisma,migrations/*,seed.ts}`, `apps/cms-api/src/modules/identity/cli/owner-bootstrap.ts`

- [ ] **T09: Login, JWT, refresh rotation, logout** · M · Deps: T08 · **Needs Q2**
  - Acceptance:
    - `POST /auth/login` (Argon2id verify, identical error for unknown email and wrong password) returns an access token in the body; refresh cookie as in §6.
    - `/auth/refresh` rotates with `family_id`; reuse revokes the family and bumps `token_version` (§12-10). `/auth/refresh` and `/logout` require an allowlisted `Origin`.
    - JWT HS256 pinned with `sub,tv,pv,kid`. No register route exists (§12-2).
  - Verify: integration tests for each criterion, including the cookie attributes.
  - Files: `apps/cms-api/src/modules/identity/{auth.controller.ts,auth.service.ts,refresh-token.service.ts,jwt.strategy.ts}`, `common/constants/auth.constants.ts`

- [ ] **T10: Rate limiting + client IP resolution** · S · Deps: T09
  - Acceptance:
    - `ClientIpResolver` uses `TRUST_PROXY_HOPS` / `CLIENT_IP_HEADER`; spoofed XFF ignored (§12-8).
    - Throttles: login per IP + per email, OTP request, 2FA verify, refresh, using named constants.
  - Verify: integration tests with forged headers; 429 bodies use the unified error shape.
  - Files: `apps/cms-api/src/common/{client-ip.resolver.ts,guards/throttle.guard.ts,constants/limits.constants.ts}`

- [ ] **T11: Admin login slice** · M · Deps: T04, T09
  - Acceptance:
    - cms-admin: `LoginPage` built from `Field`/`TextInput`/`Button`; RTK `authSlice` keeps the access token in memory only; the Axios interceptor refreshes once on 401 with a queued retry.
    - Protected route shell; logout clears the store and calls `/auth/logout`.
  - Verify: Vitest for slice + interceptor; Playwright: owner logs in, reloads (silent refresh), logs out.
  - Files: `apps/cms-admin/src/{store/auth.slice.ts,lib/api-client.ts,features/auth/LoginPage.tsx,app/ProtectedRoute.tsx}`, `apps/e2e/tests/login.spec.ts`

- [ ] **T12: OTP service + password lifecycle** · M · Deps: T09, T10
  - Acceptance:
    - `OtpService`: HMAC with `OTP_PEPPER`, purpose-bound, 5 attempts per code, 5 issued per account per hour, single-use atomic consume (§12-9).
    - Endpoints `request-otp` (always 202), `reset` (requires TOTP when enabled), `set` (invite), `change`. Each bumps `token_version` (§12-10). Mail port with Console (dev only) and Gmail adapters.
    - UI: Reset + Set-password pages in cms-admin.
  - Verify: integration tests (enumeration timing/body parity, attempt limits, old access token → 401); Playwright reset flow using the console mail capture in test mode.
  - Files: `apps/cms-api/src/modules/identity/{otp.service.ts,password.controller.ts,password.service.ts}`, `apps/cms-api/src/infrastructure/mail/*`, `apps/cms-admin/src/features/auth/{ResetPasswordPage,SetPasswordPage}.tsx`

- [ ] **T13: Two-factor authentication** · M · Deps: T12 · **Needs Q3**
  - Acceptance:
    - TOTP setup (QR) → enable requires password + first code; secret AES-256-GCM with `kid`; last time step stored (no replay); disable requires password + code.
    - Login with 2FA returns `tempToken` (300 s, 5 attempts); `/2fa/verify` accepts TOTP or email code per method.
    - UI: 2FA challenge modal + security settings page.
  - Verify: integration tests (replay rejected, attempts exhausted, temp token expiry); Playwright login with TOTP (test secret).
  - Files: `apps/cms-api/src/modules/identity/{two-factor.service.ts,two-factor.controller.ts,crypto/secret-box.ts}`, `apps/cms-admin/src/features/auth/{TwoFactorModal,SecuritySettingsPage}.tsx`

### Checkpoint 2
- [ ] §12-1, 2, 8, 9, 10 green
- [ ] Owner can log in with 2FA in cms-admin; review with user

---

## Phase 3: Access control

- [ ] **T14: Roles/permissions model + policy evaluator + conditions DSL** · M · Deps: T08
  - Acceptance:
    - `PolicyEvaluator.can(actor, action, subject)` and `fieldsFor(actor, subject)` → `{ readable, writable }`. Unknown subject → deny.
    - Conditions DSL compiler (§8.3) → parameterized SQL fragments; invalid operators or variables rejected at save time.
    - `ActorContext` covers account, reviewer and api token (token scope ∩ creator's current permissions).
  - Verify: unit tests (matrix per role, DSL injection attempts rejected).
  - Files: `apps/cms-api/src/modules/access/{policy-evaluator.ts,conditions.compiler.ts,actor-context.ts,permission.decorator.ts}`

- [ ] **T15: Revocation versions in the JWT guard** · S · Deps: T09, T14
  - Acceptance:
    - The guard compares `tv`/`pv` with DB values through `VersionCache` (invalidated on write; 5 s TTL fallback). A disabled account → 401.
    - Changing a role's permissions bumps `policy_version`; the next request is evaluated with new permissions (§12-11).
  - Verify: integration test: editor loses `update` → next PUT 403 with the old token.
  - Files: `apps/cms-api/src/modules/access/{version-cache.ts,jwt-auth.guard.ts}`

- [ ] **T16: Field projection, masking serializer, write allowlist** · M · Deps: T14
  - Acceptance:
    - `RecordSerializer.serialize(record, fields)` emits the sentinel or `null` plus `_maskedFields`, recursing into components. It is the only path that turns records into responses (lint rule or architecture test).
    - `WriteAllowlist.apply(payload, fields)` drops masked fields that carry the sentinel and rejects other non-writable or unknown keys with 400. Client `_maskedFields` is ignored (C5).
    - `QueryGuard` rejects filter/sort/search on unreadable fields (`FIELD_NOT_READABLE`).
  - Verify: unit tests plus a property-style test asserting no raw value of an unreadable field appears anywhere in serialized output.
  - Files: `apps/cms-api/src/modules/access/{record.serializer.ts,write-allowlist.ts,query.guard.ts}`

- [ ] **T17: Accounts & roles management API + security audit** · M · Deps: T12, T15
  - Acceptance:
    - Accounts: invite (sends `INVITE_SET_PASSWORD` OTP), update, disable, revoke sessions. Roles: CRUD custom roles (rank 11–39) and set permissions. Every operation enforces target rank < actor rank (§12-7).
    - `SecurityAuditService` writes in-transaction for every D15 event, and for login/2FA/password events from Phase 2 (§12-18).
  - Verify: integration tests: the escalation matrix (admin vs admin, admin edits the admin role, assign owner) all 403; an audit row exists per event.
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,roles.controller.ts,roles.service.ts,security-audit.service.ts}`

- [ ] **T18: Accounts/roles/permissions admin UI** · M · Deps: T11, T17
  - Acceptance:
    - Accounts list + invite dialog + disable; Roles list + permission matrix editor with readable/writable field pickers per content type.
    - Actions not allowed for the current actor are hidden and are also rejected server-side (verified by test).
  - Verify: Vitest for the matrix editor; Playwright: owner invites an editor, sets field permissions.
  - Files: `apps/cms-admin/src/features/access/{AccountsPage,InviteDialog,RolesPage,PermissionMatrix}.tsx`, form-commons `SelectInput`/`CheckboxInput`/`Dialog` (add to the package with tests)

- [ ] **T19: API tokens (API + UI)** · M · Deps: T15, T17
  - Acceptance:
    - Create/update/revoke only from a JWT session; scope subset check on create **and** update; admins see only their own tokens (§12-6, §12-7).
    - Token auth guard: `ak_live_` prefix lookup by SHA-256; effective permissions = scope ∩ creator's current permissions; disabled creator → 401.
    - UI: token list, create dialog showing the raw token once.
  - Verify: integration tests for each rule; Vitest for the dialog.
  - Files: `apps/cms-api/src/modules/access/{api-tokens.controller.ts,api-tokens.service.ts,api-token.guard.ts}`, `apps/cms-admin/src/features/access/ApiTokensPage.tsx`

### Checkpoint 3
- [ ] §12-5, 6, 7, 11, 18 green
- [ ] Review with user

---

## Phase 4: Documents

- [ ] **T20: Document read API** · M · Deps: T07, T16
  - Acceptance:
    - `GET /documents/:slug` and `/:documentId` with `status`, pagination, filter and sort. Slug resolved via the registry; ABAC conditions applied as SQL; projection excludes unreadable columns.
    - `public` role reads published only; `status=draft` requires a read permission that includes drafts (reviewer/public → 403).
  - Verify: integration tests: masking per role, filter on a masked field → 400, unknown slug → 404 (§12-4 read part).
  - Files: `apps/cms-api/src/modules/documents/{documents.controller.ts,documents.query.service.ts,dto/*.ts}`

- [ ] **T21: Create/update with OCC + masked 409** · M · Deps: T20
  - Acceptance:
    - `POST` creates the draft (version 1). `PUT` with `version` does `UPDATE … WHERE version = $v` plus `replaceTree` in one transaction; a mismatch → 409 with `{currentVersion, server, submitted, diff}` where `server` is serialized for the actor (§12-4 conflict part).
    - Write allowlist applied (§12-5). Richtext fields pass through `sanitizeRichtext` (stub until T24).
  - Verify: integration tests: concurrent updates, conflict body contains no unreadable raw values.
  - Files: `apps/cms-api/src/modules/documents/{documents.command.service.ts,diff.ts}`, tests

- [ ] **T22: Publish/unpublish with deep clone + delete** · M · Deps: T21
  - Acceptance:
    - Publish requires `expectedVersion`; deep-clones the root + tree into the published row (replacing the existing published row) in one transaction; partial unique indexes prevent duplicates (§12-12).
    - Unpublish deletes the published row (cascade). Delete removes both rows. Every action emits activity tracking (pluggable).
  - Verify: integration tests: editing the draft doesn't change the published tree; concurrent publish → one row; stale version → 409.
  - Files: `apps/cms-api/src/modules/documents/{publish.service.ts,tree-cloner.ts}`, activity adapter in `src/infrastructure/activity/*`

- [ ] **T23: Dynamic form renderer (scalar inputs)** · M · Deps: T18, T21
  - Acceptance:
    - `DynamicFormRenderer` maps field types → form-commons components through a registry. Masked fields render read-only "Protected (***)" and are excluded from the payload.
    - Repeatable components up to depth 3 with add/remove/reorder, keeping `component_uid`.
    - Adds to form-commons: `NumberInput` (bigint-safe), `TextAreaInput`, `SwitchInput`, `DatePicker`/`DateTimePicker`, `JsonInput` (each with tests).
  - Verify: Vitest render tests from the cv-page definition; Playwright create + save a cv-page draft.
  - Files: `apps/cms-admin/src/features/content/{DynamicFormRenderer,field-registry,ComponentList}.tsx`, form-commons components

- [ ] **T24: Richtext with server-side sanitize** · M · Deps: T23
  - Acceptance:
    - form-commons `RichtextInput` (Tiptap). The server `sanitizeRichtext` uses a `sanitize-html` allowlist on write.
    - `<script>`, `on*` attributes and `javascript:` URLs stripped (§12-14 storage part).
  - Verify: unit tests with an XSS payload corpus; Vitest for the editor.
  - Files: `packages/form-commons/src/components/forms/RichtextInput/*`, `apps/cms-api/src/common/sanitize/richtext.sanitizer.ts`

- [ ] **T25: Conflict diff/merge modal** · M · Deps: T21, T23
  - Acceptance:
    - On 409 the modal shows a field-level diff; components are matched by `component_uid` (added/removed/changed). The user picks server or client per field or component, then resubmits with `currentVersion`.
    - Masked fields aren't shown or offered.
  - Verify: unit tests for the merge reducer; Playwright two-context conflict scenario.
  - Files: `apps/cms-admin/src/features/content/{ConflictMergeModal.tsx,merge.reducer.ts}`, form-commons `DiffViewerBlock`

- [ ] **T26: Presence API + banner** · S · Deps: T21
  - Acceptance:
    - `POST …/presence` requires `update` on the document and returns `{accountId, displayName, state, lastSeenAt}` only; TTL 45 s; heartbeat every 20 s via React Query; stops on unmount (D16).
  - Verify: integration test (reviewer/public → 403, expiry); Vitest for the banner.
  - Files: `apps/cms-api/src/modules/documents/{presence.service.ts,presence.controller.ts}`, `apps/cms-admin/src/features/content/PresenceBanner.tsx`

### Checkpoint 4
- [ ] Create → edit → conflict → merge → publish in cms-admin (Playwright)
- [ ] §12-4, 5, 12, 14 (storage) green; review with user

---

## Phase 5: Media

- [ ] **T27: Upload pipeline + Cloudinary adapter + list** · M · Deps: T16
  - Acceptance:
    - Streaming multipart with per-type limits; `file-type` magic bytes against the allowlist; SVG/HTML → 415; sharp re-encode strips EXIF; UUIDv7 storage key; SHA-256 stored (§12-13).
    - `GET /media` paginated; reviewers only get `is_reviewer_preset = true` rows via policy (not a role string check).
  - Verify: integration tests with fixture files (polyglot, renamed html, EXIF jpeg) using a fake storage adapter.
  - Files: `apps/cms-api/src/modules/media/{media.controller.ts,upload.pipeline.ts}`, `apps/cms-api/src/infrastructure/media/{storage.port.ts,cloudinary.adapter.ts,fake.adapter.ts}`

- [ ] **T28: Safe delete + purge job** · S · Deps: T27, T22
  - Acceptance:
    - `DELETE /media/:id` → 409 `MEDIA_IN_USE` if referenced by any draft or published document; otherwise soft delete plus a security audit event. A scheduled job purges soft-deleted cloud objects older than 24 h.
  - Verify: integration tests for referenced/unreferenced cases and the purge job with the fake adapter.
  - Files: `apps/cms-api/src/modules/media/{media-delete.service.ts,media-purge.job.ts}`

- [ ] **T29: MediaInput + media library UI** · M · Deps: T23, T27
  - Acceptance:
    - form-commons `MediaInput` (preview, name, size, provider badge, date; `onChange/onRemove/onDelete/onOpenLibrary`).
    - cms-admin media library page with upload, alt edit and delete (shows the in-use error); field registry wires `media` fields.
  - Verify: Vitest; Playwright upload + attach to a document.
  - Files: `packages/form-commons/src/components/forms/MediaInput/*`, `apps/cms-admin/src/features/media/{MediaLibraryPage,MediaPickerDialog}.tsx`

### Checkpoint 5
- [ ] §12-13 green; review with user

---

## Phase 6: Public web & reviewer

- [ ] **T30: Web CV showcase** · M · Deps: T20, T24, T03 · **Needs Q5**
  - Acceptance:
    - The web renders published cv-page via the `public` role; masked fields show a "Sign in to view" placeholder; richtext rendered through DOMPurify (§12-14 render part).
    - Seed: default `public`/`reviewer` field profiles mask the fields from Q5.
  - Verify: Vitest for sections; Playwright: anonymous view shows placeholders, no raw sensitive values in network responses.
  - Files: `apps/web/src/features/cv/{CvPage,sections/*}.tsx`, `apps/web/src/lib/render-richtext.ts`, `apps/cms-api/prisma/seed-profiles.ts`

- [ ] **T31: Reviewer backend** · M · Deps: T17, T27 · **Needs Q4**
  - Acceptance:
    - `PUT /reviewer/settings` (owner) stored in `app_settings`, and toggling bumps the reviewer role's `policy_version` (off → existing sessions 401 on the next request).
    - `POST /reviewer/sessions`: Turnstile verified server-side, 1 per IP per 10 min, global cap 200, ip stored as HMAC, notes ≤ 500 chars as plain text. Creates an ephemeral `reviewer` account + tokens (24 h).
    - Cleanup job deletes expired reviewer accounts (FKs SET NULL); `GET /reviewer/sessions` is owner-only.
  - Verify: integration tests (§12-3 API part, toggle-off revocation, caps).
  - Files: `apps/cms-api/src/modules/reviewer/{reviewer.controller.ts,reviewer.service.ts,reviewer-cleanup.job.ts}`, `apps/cms-api/src/infrastructure/turnstile/turnstile.client.ts`

- [ ] **T32: Reviewer UX (web + admin) + owner log** · M · Deps: T31, T30, T18 · **Needs Q6**
  - Acceptance:
    - The web "Reviewer access" multi-step dialog (role → purposes → notes + Turnstile, no PII) starts a session; reviewer view re-fetches with reviewer permissions.
    - cms-admin in reviewer mode: read-only banner, write actions hidden (and 403 server-side); owner "Reviewer sessions" page with notes rendered as text.
  - Verify: Playwright full reviewer flow (§12-3 end to end), including draft → 403 and write → 403.
  - Files: `apps/web/src/features/reviewer/ReviewerAccessDialog.tsx`, `apps/cms-admin/src/features/reviewer/{ReviewerBanner,ReviewerSessionsPage}.tsx`

- [ ] **T33: Web login + session sharing with admin** · S · Deps: T13, T30
  - Acceptance:
    - The web login dialog (with 2FA step) reuses form-commons. After login the web refetches with the actor's permissions. The "Open CMS" link goes to the admin subdomain, where silent refresh works because the cookie is host-only on `domain.com` with Path `/api/v1/auth`.
  - Verify: Playwright: log in on web, open admin without re-login.
  - Files: `apps/web/src/features/auth/{WebLoginDialog.tsx,useWebSession.ts}`

### Checkpoint 6
- [ ] §12-3 green end to end; public site masks correctly; review with user

---

## Phase 7: Collections bulk

- [ ] **T34: Bulk API** · M · Deps: T22
  - Acceptance:
    - `bulk/create|publish|unpublish|delete` for `kind = collection` only (single → 400); ≤ 50 items, ≤ 200 component rows per item, body ≤ 1 MB.
    - Policy, ABAC and write allowlist per item; `atomic: true` = one transaction, `false` = savepoint per item with per-item results.
    - Batched inserts per level (root, then each component table) using `RETURNING id`.
  - Verify: integration tests: limits, partial vs atomic, per-item 403, query count.
  - Files: `apps/cms-api/src/modules/documents/{bulk.controller.ts,bulk.service.ts}`

- [ ] **T35: Bulk UI** · M · Deps: T34, T23
  - Acceptance:
    - form-commons `SortableSheet`, `TablePagination`, `BulkActionBar`; the collection list page selects rows → bulk publish/unpublish/delete with a result summary; bulk create via `JsonInput` import with validation errors per item.
  - Verify: Vitest; Playwright select 5 → publish.
  - Files: `packages/form-commons/src/components/forms/{Sheet,Pagination,Blocks/BulkActionBar}/*`, `apps/cms-admin/src/features/content/{CollectionListPage,BulkCreateDialog}.tsx`

### Checkpoint 7
- [ ] Bulk flows green; review with user

---

## Phase 8: Hardening & deploy docs

- [ ] **T36: Security headers + prod config audit** · S · Deps: T04, T33
  - Acceptance:
    - Each SPA's nginx sends CSP (`script-src 'self'`; `connect-src` from env; `img-src` includes Cloudinary), HSTS, nosniff and Referrer-Policy. The API sends `default-src 'none'`; no duplicate CSP from Traefik.
    - A checklist script asserts prod config refinements and headers against the smoke stack.
  - Verify: `pnpm smoke` extended with header assertions.
  - Files: `apps/{web,cms-admin}/nginx.conf`, `apps/cms-api/src/main.ts`, `scripts/smoke.sh`

- [ ] **T37: Playwright suite consolidation + CI** · M · Deps: T35, T36
  - Acceptance:
    - CI workflow runs build, lint, typecheck, unit/integration (Testcontainers) and Playwright on the compose stack, plus `pnpm audit --prod` with no high/critical findings.
    - Every §12 criterion is mapped to a test id in `docs/modules/success-criteria.md`.
  - Verify: CI green on a branch.
  - Files: `.github/workflows/ci.yml`, `apps/e2e/playwright.config.ts`, docs file

- [ ] **T38: Deployment guide for the deploy repo** · S · Deps: T36
  - Acceptance:
    - `docs/deployment/k3s-traefik.md` covers:
      - IngressRoutes (web + `/api` on `domain.com`, admin on `admin.domain.com`; never StripPrefix)
      - Traefik service `externalTrafficPolicy: Local` and the `TRUST_PROXY_HOPS` value
      - migration Job order (`db:migrate` → `content:migrate`) before rollout
      - env contract table, secrets via SOPS/sealed-secrets
      - nightly `pg_dump` off-site plus a restore drill, single-replica note
  - Verify: user review; commands in the guide are run against the smoke stack.
  - Files: `docs/deployment/k3s-traefik.md`

### Checkpoint 8 (release)
- [ ] All §12 criteria green in CI
- [ ] Deploy guide reviewed by user
- [ ] v2 backlog untouched
