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

- [ ] **T17a: Re-enable account + resend invite + invite rate limit (API)** · M · Deps: T17 · Q7-Q9 answered
  - Acceptance:
    - `POST /accounts/:id/enable` (`accounts:update`, D6 rank rule, never self): a `disabled` account goes back to `active` when it has a password, else to `invited` (Q7). Any other status → `409 ACCOUNT_NOT_DISABLED`. In one transaction with audit `account.enabled` (metadata: resulting status only); VersionCache invalidated; `204`. No `token_version` change (disable already bumped it).
    - `POST /accounts/:id/invite/resend` (`accounts:create` (Q8), D6 rank rule, never self): only `invited` accounts, else `409 ACCOUNT_NOT_INVITED`. In one transaction: new `INVITE_SET_PASSWORD` code (older invite codes stop working; the 5-codes/hour DB cap answers 429 and rolls back) + audit `account.invite_resent`; then mails it. `200 { invitationSent }` with the same meaning as invite.
    - Invite throttle (Q9): 10 / hour per actor + 20 / hour per IP, in memory; new key source `actor` (the caller's account; method-level `@Throttle` runs after the controller's `JwtAuthGuard` + `PermissionGuard`), policy `ACCOUNT_INVITE` shared by invite and resend, per actor and per IP. Over the limit: `429 TOO_MANY_REQUESTS` + `Retry-After`, nothing written or mailed.
    - Docs: SPEC §9 Accounts row, `apps/cms-api/README.md` ("Accounts and roles", "Rate limits", "Security audit" action list), `docs/modules/access-control.md` if it lists account actions.
  - Verify: integration tests: enable (disabled active editor → active and can log in; invited-then-disabled → invited; non-disabled 409; admin vs admin 403; self 403; audit row); resend (new code sets the password, old code → `AUTH_INVALID_OTP`; active account 409; 6th code in the hour 429 with no audit row); throttle (limit + 1 → 429 + `Retry-After`; two actors keep separate counters; resend and invite share one counter).
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,access-management.constants.ts,security-audit.constants.ts}`, `apps/cms-api/src/common/{constants/limits.constants.ts,guards/throttle.guard.ts}`, `apps/cms-api/test/integration/`, `apps/cms-api/README.md`, `SPEC.md` §9

- [ ] **T17c: Pagination for GET /accounts + custom role cap** · S · Deps: T17 · Q10-Q12 answered
  - Acceptance:
    - `GET /accounts?page=&pageSize=` (Q10: offset, `page` ≥ 1 default 1, `pageSize` default 20 max 100, constants in `access-management.constants.ts`) → `200 { data: Account[], meta: { page, pageSize, total } }`, ordered by id ascending, no filters or search (Q12), deleted accounts excluded from `data` and `total`. Invalid or out-of-range params → `400 ACCESS_INVALID_REQUEST`. A page past the end → empty `data`, correct `total`.
    - `GET /roles` stays a full, unpaginated list (Q11). Custom roles are capped at 50 (constant in `access-management.constants.ts`): `POST /roles` past the cap → `409 ROLE_LIMIT_REACHED`. System roles do not count.
    - The page/meta shape is written down as the project list convention (README "HTTP pipeline" or `conventions.md`) so T20 documents, T27 media and the audit-log list reuse it.
  - Verify: integration tests: 25 accounts → page 2 of size 20 holds 5 with `total` 25; `pageSize=101` and `page=0` → 400; deleted accounts not counted; the 51st custom role → 409 `ROLE_LIMIT_REACHED`.
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,access-management.requests.ts,access-management.constants.ts}` (+ `roles.service.ts` for the cap), `apps/cms-api/test/integration/`, `apps/cms-api/README.md`, `SPEC.md` §9

- [ ] **T18: Accounts/roles/permissions admin UI** · M · Deps: T11, T17
  - Acceptance:
    - Accounts list + invite dialog + disable; Roles list + permission matrix editor with readable/writable field pickers per content type.
    - Actions not allowed for the current actor are hidden and are also rejected server-side (verified by test).
  - Verify: Vitest for the matrix editor; Playwright: owner invites an editor, sets field permissions.
  - Files: `apps/cms-admin/src/features/access/{AccountsPage,InviteDialog,RolesPage,PermissionMatrix}.tsx`, form-commons `SelectInput`/`CheckboxInput`/`Dialog` (add to the package with tests)

- [ ] **T18a: Admin UI for enable, resend invite and accounts pagination** · M · Deps: T17a, T17c, T18 · Q13 answered
  - Acceptance:
    - Accounts page: "Enable" on disabled rows and "Resend invite" on invited rows, shown only when the row is `manageable` and the caller holds the needed permission (same `caller-access` hint as T18); server rejections still surface as errors.
    - Resend shows a result message; `invitationSent: false` says the mail failed and the invitee can request a code. 429 shows a wait message using `Retry-After`.
    - Pagination controls (previous / next, "x–y of total") driven by `meta`; the page survives a refetch after an action; the page clamps back when the last row of a page goes away.
    - No confirm dialog for Enable or Resend invite (Q13); Disable keeps its confirm.
  - Verify: Vitest (`AccessPages.test.tsx`): action visibility per status/manageable, resend success + mail-failure message, 429 message, page navigation. Playwright (e2e-tester, `apps/e2e`): owner disables then enables an editor who can log in again; owner resends an invite and the new Mailpit code sets the password.
  - Files: `apps/cms-admin/src/features/access/{AccountsPage.tsx,access.api.ts,access-queries.ts,AccessPages.test.tsx}`, `apps/cms-admin/src/config/access.constants.ts`; e2e in `apps/e2e`

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

> **Replanned 2026-10-21: apps/web moves from React 19 + Vite to Next.js (App Router), and cms-api gets a read-only GraphQL API (SPEC D18, `docs/modules/graphql.md`).** Order: GQ1 → GQ2 → GQ3 (api-builder) in parallel with T30a → T30b (ui-builder); T30 needs GQ2 + T30b. T30, T32 (web part), T33, T36 and T38 are revised for it. Q-W1..Q-W10 are answered (handoff "Web on Next.js"); Q-W4 `style-src` and Q-G1..Q-G7 (SPEC §14) are open, and tasks follow the recommendation until answered. The web stack rules for every web task:
> - Next.js 16 App Router, exact version pinned at or above 16.2.5 (CVE-2026-44581 fix), `output: 'standalone'`, run by Node (non-root) in its container. No nginx for web. (Q-W1, Q-W2)
> - Server Components by default. A file becomes `'use client'` only for state, effects, event handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import (form-commons has no `'use client'` directive, so it is imported only from web client components). (Q-W9)
> - Public content is fetched on the server **through GraphQL** (`POST ${API_INTERNAL_URL}/graphql`), anonymously (`public` role), from `API_INTERNAL_URL` (server-only runtime env), with a data cache of `WEB_REVALIDATE_SECONDS` (60 s production, 0 smoke). Browser refetches for a signed-in or reviewer actor send the same query documents to `NEXT_PUBLIC_API_BASE_URL` + `/graphql` with the Bearer token. No GraphQL client library (Q-G6). The server never sends, receives or stores a user token: the refresh cookie (Path `/api/v1/auth`) never reaches Next routes, and all authenticated calls go from the browser to `NEXT_PUBLIC_API_BASE_URL` with a Bearer token from memory (D14). No Server Actions or Route Handlers for auth. (Q-W3)
> - Web security headers (CSP with a per-request nonce) come from Next.js (`src/proxy.ts` + `next.config.ts`), not nginx (Q-W4, T36).
> - `src/config/env.ts` stays the only env reader, split into `env.server.ts` (`import 'server-only'`) and `env.client.ts` (`NEXT_PUBLIC_*` only, baked at build).
> - Tests: Vitest + Testing Library (jsdom) for client components, sync Server Components and pure modules; async Server Components and SSR output are covered by Playwright in `apps/e2e` against the standalone container in the smoke stack.

### GraphQL read API (cms-api, SPEC D18)

- [ ] **GQ1: GraphQL schema builder + SDL print** · M · Deps: T20 · **Needs Q-G1, Q-G2, Q-G3** · api-builder · D18, §9, `docs/modules/graphql.md` "Schema"
  - Acceptance:
    - New dep `graphql` (exact pin, approved via Q-G1). `buildGraphqlSchema(definitions)` is a pure function (no Nest, no DB) producing the types, root fields, shared types, scalars (`Date`, `DateTime`, `Decimal`, `JSON`), `<Root>Page`, `<Root>Sort`/`<Root>SortField` and `<Root>Filter` inputs exactly as in the design doc; resolvers are attached later (GQ2), here fields read `values`/`components` of a `SerializedRecord`.
    - Naming per the design doc; any clash (slug vs slug, `<x>List` vs another item field, generated vs shared type name) throws a typed error naming both sources; nothing is renamed.
    - Filter inputs: one input per REST operator set; which field kinds are filterable/sortable and which operators each kind takes are read from the REST constants/table in `document-filter.ts` / `documents.constants.ts` (export them if needed), not re-declared.
    - `pnpm --filter @abyss/cms-api graphql:print-schema` writes `apps/cms-api/content/schema.graphql` from `content/schemas/*.json` (no DB); `-- --check` exits 1 when the file is stale. The committed SDL is generated, never hand-edited.
  - Verify: unit tests: SDL for `cv-page` + `profile` equals the committed `content/schema.graphql`; every field type maps as in the table; masked-capable content fields are nullable; repeatable component = nullable list; clash cases throw; `single` type gets only the item field. `graphql:print-schema -- --check` passes.
  - Files: `apps/cms-api/src/modules/graphql/{graphql.constants.ts,schema/schema.builder.ts,schema/type-names.ts,schema/scalars.ts,schema/filter-inputs.ts,cli/print-schema.ts}`, specs, `apps/cms-api/content/schema.graphql`, `apps/cms-api/package.json` (dep + script)

- [ ] **GQ2: GraphQL endpoint + resolvers over the document read path** · M · Deps: GQ1 · api-builder · D18, D3, D5, §12-19
  - Acceptance:
    - `POST /api/v1/graphql` (`API_ROUTES.GRAPHQL`) in `GraphqlModule`: `DocumentAuthGuard` + `DOCUMENT_READ_ANONYMOUS` throttle; JSON body `{ query, variables?, operationName? }` only (array/batch, missing query → 400; non-JSON → 415); parse → validate → execute with graphql-js; `Cache-Control: no-store`.
    - Root resolvers convert args to `ListDocumentsQuery` (`FilterClause` per operator, values stringified, `SortKey`) or `(documentId, status)` and call `DocumentsQueryService.list`/`get` unchanged (`DocumentsModule` exports it). Item not found/hidden → `null`, no error. `single` types resolve through `list` with `pageSize` 1.
    - `ContentTypeVisibilityRule(actor)`: a root field for a type the actor cannot `read` (incl. token scope) fails validation with the same message and code as an unknown field.
    - Error format per the design doc (`extensions { code, details?, requestId }`; 400 for parse/validation, 200 after execution; Nest `HttpException`s from the service map to their `errorCode`; unknown errors → generic `INTERNAL_SERVER_ERROR`, logged with request id). New codes in `ERROR_CODES`. Variables are never logged or echoed.
    - Architecture test: `src/modules/graphql/**` imports none of `content.repository`, `tree-loader`, `field-projection`, `kysely`.
  - Verify: integration tests (`test/integration/graphql.spec.ts`, Testcontainers): for anonymous, an editor JWT and an API token, `cvPageList`/`cvPage` data equals the REST `GET /documents/cv-page` record re-shaped (same masked values and `_maskedFields`); filter on a masked field → `FIELD_NOT_READABLE`; `status: DRAFT` anonymous → `FORBIDDEN`; hidden type error equals unknown-field error; row conditions hide rows (null item, `total` excludes them); invalid Bearer → 401 REST shape; anonymous 121st request → 429; token creator lost `read` → hidden.
  - Files: `apps/cms-api/src/modules/graphql/{graphql.module.ts,graphql.controller.ts,graphql.executor.ts,document.resolvers.ts,rules/visibility.rule.ts,error-format.ts}`, `apps/cms-api/src/modules/documents/documents.module.ts` (export), `apps/cms-api/src/app.module.ts`, `apps/cms-api/src/common/constants/*` (route, error codes), test file

- [ ] **GQ3: GraphQL limits + production hardening + docs** · S · Deps: GQ2 · **Needs Q-G4, Q-G5** · api-builder · D18, D17
  - Acceptance:
    - `GRAPHQL_LIMITS` (named constants, values per Q-G4): body bytes (413 REST shape), parser `maxTokens`, `MaxDepthRule`, `MaxRootFieldsRule` (aliases count), `MaxFieldNodesRule` (after fragment expansion); over-limit → 400 `GRAPHQL_LIMIT_EXCEEDED` before any SQL runs.
    - `NODE_ENV=production`: `NoSchemaIntrospectionCustomRule` on, "Did you mean" suggestions stripped from every message; no playground in any environment.
    - Docs: `apps/cms-api/README.md` gains "GraphQL (D18)" (endpoint, auth, limits, errors, SDL script); `docs/modules/graphql.md` status → accepted with the final values; `apps/cms-api/.env.example` unchanged (no new env).
  - Verify: unit tests per rule (at limit passes, limit + 1 fails, fragments and aliases counted); integration: the full cv-page web query passes all limits; introspection refused and suggestions absent with production config, allowed in test config; a query that exceeds a limit issues no SQL (Kysely query log count 0).
  - Files: `apps/cms-api/src/modules/graphql/{rules/limits.rules.ts,graphql.executor.ts,graphql.constants.ts}`, specs, `apps/cms-api/README.md`, `docs/modules/graphql.md`

- [ ] **T30a: Migrate apps/web to Next.js (skeleton parity)** · M · Deps: T04 · Q-W1..Q-W9 answered · ui-builder · §3, §5, D14, D17
  - Acceptance:
    - `@abyss/web` builds with `next build` (`output: 'standalone'`) and runs with `next start`/the standalone server; `pnpm --filter @abyss/web dev` serves on 5174 (`DEV_SERVER_PORT`) and forwards `/api` to `DEV_API_PROXY_TARGET` via a dev-only `rewrites()` (no rewrite in production builds).
    - Parity with the T04 skeleton: `app/layout.tsx` (imports form-commons `styles.css` + app CSS, Tailwind v4 via `@tailwindcss/postcss`), `app/page.tsx` renders the status card; the status card is a client component that calls `/health/live` through `src/config/endpoints.ts` and the Axios client (trailing slashes stripped). `app/not-found.tsx` returns a real 404.
    - Env: `env.client.ts` reads `NEXT_PUBLIC_API_BASE_URL` (required, fails the build when unset); `env.server.ts` (`server-only`) reads `API_INTERNAL_URL` and `WEB_REVALIDATE_SECONDS` at runtime with validation (invalid = fail start). `.env.example` lists every key; no `VITE_*` key remains.
    - Lint: Oxlint + ESLint with the Next plugin (`@next/eslint-plugin-next`) and react-hooks; typecheck covers `next-env.d.ts`. Vitest config moves to `vitest.config.ts` (`@vitejs/plugin-react`, jsdom); existing tests (`App`, `api-client`, `strip-trailing-slashes`) pass, ported where they referenced `import.meta.env`.
    - `apps/web/Dockerfile`: turbo prune + frozen install + `turbo run build --filter=@abyss/web`; build arg `NEXT_PUBLIC_API_BASE_URL` required; runtime stage copies `.next/standalone`, `.next/static` and `public/`, runs as a non-root user, `NEXT_TELEMETRY_DISABLED=1`, `HOSTNAME=0.0.0.0`, listens on `WEB_PORT` (named in `.env.example`), and has a `HEALTHCHECK` on `/`.
    - Docs: `apps/web/README.md` rewritten for Next (scripts, env, Docker, server/client rule); ADR `docs/adr/0004-web-nextjs-app-router.md` records Q-W1..Q-W10 answers. SPEC §3/§5/D17 are already updated (planner, 2026-10-21); the builder reports any mismatch, never edits SPEC.
  - Verify: `pnpm --filter @abyss/web build test lint typecheck` green; `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=/api/v1 .` succeeds and the container answers `/` with 200 as a non-root user; `pnpm format:check`.
  - Files: `apps/web/{package.json,next.config.ts,postcss.config.mjs,vitest.config.ts,tsconfig.json,eslint.config.mjs,.oxlintrc.json,Dockerfile,.env.example,README.md}`, `apps/web/src/app/{layout,page,not-found}.tsx`, `apps/web/src/config/{env.client,env.server}.ts`, `apps/web/src/features/status/*`, `docs/adr/*`
  - Deletions needing approval: `apps/web/{index.html,vite.config.ts,nginx.conf,src/main.tsx,src/vite-env.d.ts,src/config/env.ts}`, `apps/web/src/app/App.tsx` (+ test, if replaced by `page.tsx`); deps `vite`, `@tailwindcss/vite` from apps/web.
  - New deps needing approval (§13): `next`, `server-only`, `@tailwindcss/postcss`, `@next/eslint-plugin-next` (Q-W7).

- [ ] **T30b: Smoke stack + script for the Next.js web** · S · Deps: T30a · ui-builder, root files approved at dispatch (Q-W10) · §12-17, D17
  - Acceptance:
    - `docker-compose.smoke.yml` `web` service: build arg `NEXT_PUBLIC_API_BASE_URL: /api/v1`; runtime env `API_INTERNAL_URL: http://cms-api:3000/api/v1`, `WEB_REVALIDATE_SECONDS` (smoke value per Q-W3), `WEB_PORT`; healthcheck on `/`; `depends_on` cms-api healthy; Traefik `loadbalancer.server.port` = `WEB_PORT`. The `/api` router keeps priority over the web router (no StripPrefix).
    - `scripts/smoke.sh`: replace the SPA-fallback assertion with: `/` → 200 HTML; an unknown path → 404 (never 3xx); a page path with a trailing slash → 308 with a relative `Location` (never an absolute `http://<container>` URL); `/_next/static/*` asset → `Cache-Control` immutable; the existing `/api` assertions (trailing-slash POST not 3xx, CORS) still pass.
  - Verify: `pnpm smoke` green (one agent at a time on the shared stack).
  - Files: `docker-compose.smoke.yml`, `scripts/smoke.sh`

- [ ] **T30: Web CV showcase (Server Components, GraphQL)** · M · Deps: T30b, GQ2, T24, T03 · **Needs Q-G6, Q-G7** (Q5, Q-W3, Q-W6 answered) · ui-builder (+ e2e-tester for Playwright) · §3, §5, D13, D18, §12-4, §12-14
  - Acceptance:
    - `features/cv/cv.query.ts` holds the GraphQL query document (plain string, `operationName` set) and hand-written result types; it selects the cv-page via `cvPageList(filter: { isMain: { eq: true } }, sort: [{ field: updatedAt, direction: DESC }], pageSize: 1)` (per Q-G7) with every section the page renders and `_maskedFields`. `API_ENDPOINTS.GRAPHQL = '/graphql'` in `src/config/endpoints.ts`.
    - `lib/graphql/graphql-fetch.server.ts` (`server-only`): `POST ${API_INTERNAL_URL}/graphql`, JSON body, no `Authorization`, no forwarded cookies or client IP headers, cached for `WEB_REVALIDATE_SECONDS`. The cache mechanism (fetch `next.revalidate` keyed by body, or `'use cache'` + `cacheLife`) is chosen from the Next 16 docs and recorded in `apps/web/README.md`. Non-200, a body without `data`, or any `errors` entry throws a typed error.
    - `app/page.tsx` is an async Server Component: fetch through the module above and render the sections as Server Components. A fetch failure renders the error state (`app/error.tsx`; the HTTP status Next 16 gives a streamed error is documented in the README), never stale data from another actor; no cv-page → an empty state.
    - Masked fields (`***`/`null` + `_maskedFields`) render a "Sign in to view" placeholder; the server HTML and the RSC payload never contain a raw masked value (only what the `public` role receives).
    - Richtext is sanitized with DOMPurify before render on the server (`lib/render-richtext.ts`, server-only, Q-W6) and on the client when the authenticated view re-renders it (§12-14 render part). Allowlist mirrors cms-api `sanitize-html` config.
    - A client `CvView` boundary takes the server data as `initialData` for a TanStack Query keyed by actor (`anonymous` vs account id); its query function is `lib/graphql/graphql-request.ts` (Axios client, `NEXT_PUBLIC_API_BASE_URL` + `/graphql`, Bearer from the session holder, same query document) so T33/T32 refetch with the actor's permissions without a reload.
    - Contract test: `graphql` web devDependency (Q-G6); a Vitest test validates every `*.query.ts` document against `apps/cms-api/content/schema.graphql` (read by path; no cms-api import).
    - Seed: default `public`/`reviewer` field profiles mask the Q5 fields (`reference.phone`, `company` root + `experience.company`, `github`, `email`); `cv-page.json` gains those fields only if the user confirms they are missing (report, do not guess).
  - Verify: Vitest for section components, `render-richtext` (script/onerror stripped), `graphql-fetch.server` (errors entry → throws; no Authorization header sent) and the SDL contract test; Playwright (e2e-tester, `apps/e2e` gains `webUrl` in its env): anonymous view shows placeholders, the HTML response and all network responses contain no raw sensitive value, an injected `<img onerror>` does not execute.
  - Files: `apps/web/src/app/{page,error}.tsx`, `apps/web/src/features/cv/{cv.query.ts,CvView.tsx,cv.server.ts,sections/*}`, `apps/web/src/lib/{graphql/graphql-fetch.server.ts,graphql/graphql-request.ts,render-richtext.ts}`, `apps/web/src/config/endpoints.ts`, `apps/web/test/graphql-contract.test.ts`, `apps/cms-api/prisma/seed-profiles.ts` (api-builder part, or split at dispatch); e2e: `apps/e2e/{src/env.ts,tests/web-cv.spec.ts}`

- [ ] **T31: Reviewer backend** · M · Deps: T17, T27 · **Needs Q4**
  - Acceptance:
    - `PUT /reviewer/settings` (owner) stored in `app_settings`, and toggling bumps the reviewer role's `policy_version` (off → existing sessions 401 on the next request).
    - `POST /reviewer/sessions`: Turnstile verified server-side, 1 per IP per 10 min, global cap 200, ip stored as HMAC, notes ≤ 500 chars as plain text. Creates an ephemeral `reviewer` account + tokens (24 h).
    - Cleanup job deletes expired reviewer accounts (FKs SET NULL); `GET /reviewer/sessions` is owner-only.
  - Verify: integration tests (§12-3 API part, toggle-off revocation, caps).
  - Files: `apps/cms-api/src/modules/reviewer/{reviewer.controller.ts,reviewer.service.ts,reviewer-cleanup.job.ts}`, `apps/cms-api/src/infrastructure/turnstile/turnstile.client.ts`

- [ ] **T32: Reviewer UX (web + admin) + owner log** · M · Deps: T31, T30, T33, T18 · **Needs Q6** · ui-builder (+ e2e-tester) · §12-3
  - Acceptance:
    - The web "Reviewer access" multi-step dialog (role → purposes → notes + Turnstile, no PII) is a client component (form-commons + react-hook-form) that starts a session from the browser; the reviewer access token stays in browser memory (same session holder as T33), and the reviewer view re-fetches the `CvView` GraphQL query (browser, Bearer reviewer token) with reviewer permissions. The Next server never sees the reviewer token.
    - The Turnstile widget loads only inside the dialog, via `next/script` with the request nonce; the T36 web CSP allows the Turnstile origin in `script-src`/`frame-src` (named constant, not a literal).
    - cms-admin in reviewer mode: read-only banner, write actions hidden (and 403 server-side); owner "Reviewer sessions" page with notes rendered as text.
  - Verify: Playwright full reviewer flow (§12-3 end to end) starting on web, including draft → 403 and write → 403; no CSP violation in the console during the dialog.
  - Files: `apps/web/src/features/reviewer/{ReviewerAccessDialog.tsx,reviewer.api.ts}`, `apps/cms-admin/src/features/reviewer/{ReviewerBanner,ReviewerSessionsPage}.tsx`

- [ ] **T33: Web login + session sharing with admin** · S · Deps: T13, T30, GQ2 · ui-builder (+ e2e-tester) · §6 (refresh cookie, origins), D14
  - Acceptance:
    - The web login dialog (with 2FA step) is a client component reusing form-commons; it calls `/auth/login` and `/auth/2fa/verify` from the browser at `NEXT_PUBLIC_API_BASE_URL` (same origin `domain.com`), so the API sets the host-only `__Secure-abyss_rt` cookie (Path `/api/v1/auth`). No Server Action, Route Handler or `cookies()` call touches auth.
    - `useWebSession` (client context provider mounted in `app/layout.tsx` as a client island) keeps the access token in memory only, attempts one silent `/auth/refresh` on mount, and exposes the actor; after login/refresh the `CvView` query refetches through GraphQL from the browser (`graphql-request.ts`, Bearer token) with the actor's permissions; logout calls `/auth/logout` and falls back to the server-rendered public data. Session state uses React context + TanStack Query, no Redux (Q-W5).
    - The "Open CMS" link goes to the admin subdomain, where silent refresh works because the cookie is host-only on `domain.com` with Path `/api/v1/auth`.
  - Verify: Vitest for `useWebSession` (refresh-on-mount, logout reset) and the dialog's 2FA step; Playwright: log in on web, the masked fields resolve for the actor, open admin without re-login; a reload keeps the session via silent refresh.
  - Files: `apps/web/src/features/auth/{WebLoginDialog.tsx,useWebSession.tsx,auth.api.ts}`, `apps/web/src/app/layout.tsx`

### Checkpoint 6
- [ ] §12-3 and §12-19 green end to end; public site masks correctly in both the SSR HTML and client GraphQL refetches; web runs as the Next.js standalone container in the smoke stack; review with user

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

- [ ] **T36: Security headers + prod config audit** · M · Deps: T04, T33, T32, GQ3 · **Needs Q-W4** (style-src) · ui-builder (web, admin) + api-builder (cms-api) · D17, D18
  - Acceptance:
    - cms-admin nginx sends CSP (`script-src 'self'`; `connect-src` from env; `img-src` includes Cloudinary), HSTS, nosniff and Referrer-Policy.
    - Web (Next.js): `src/proxy.ts` generates a per-request nonce and sends CSP `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ Turnstile origin), `style-src` per Q-W4, `connect-src` from env, `img-src` includes Cloudinary, `frame-ancestors 'none'`; HSTS, nosniff, Referrer-Policy and `poweredByHeader: false` from `next.config.ts` `headers()`. Every page is dynamically rendered (nonce needs a request); the data cache from T30 still limits calls to cms-api. `/_next/static` is excluded from the proxy matcher.
    - The API sends `default-src 'none'` and no `X-Powered-By` on every route including `POST /graphql`; no duplicate CSP from Traefik. Web `connect-src` covers the browser GraphQL calls (same origin `/api/v1/graphql`).
    - A checklist script asserts prod config refinements and headers against the smoke stack (web: a fresh nonce per response and no `X-Powered-By`).
  - Verify: `pnpm smoke` extended with header assertions; Playwright: web CV, login and reviewer dialog show no CSP violations in the console.
  - Files: `apps/web/{src/proxy.ts,next.config.ts}`, `apps/cms-admin/nginx.conf`, `apps/cms-api/src/main.ts`, `scripts/smoke.sh`

- [ ] **T37: Playwright suite consolidation + CI** · M · Deps: T35, T36
  - Acceptance:
    - CI workflow runs build, lint, typecheck, unit/integration (Testcontainers) and Playwright on the compose stack, `content:generate --check` and `graphql:print-schema -- --check`, plus `pnpm audit --prod` with no high/critical findings.
    - Every §12 criterion is mapped to a test id in `docs/modules/success-criteria.md`.
  - Verify: CI green on a branch.
  - Files: `.github/workflows/ci.yml`, `apps/e2e/playwright.config.ts`, docs file

- [ ] **T38: Deployment guide for the deploy repo** · S · Deps: T36
  - Acceptance:
    - `docs/deployment/k3s-traefik.md` covers:
      - IngressRoutes (web + `/api` on `domain.com`, admin on `admin.domain.com`; never StripPrefix; `/api` matched before the web catch-all)
      - web is a Node service (Next.js standalone on `WEB_PORT`, non-root, readiness probe on `/`), not nginx; build arg `NEXT_PUBLIC_API_BASE_URL` vs runtime env `API_INTERNAL_URL` (in-cluster cms-api Service URL) and `WEB_REVALIDATE_SECONDS`; resource requests for the Node process
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
