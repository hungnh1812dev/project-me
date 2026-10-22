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
    - `tsconfig.base.json` has compilerOptions only; each project has its own tsconfig, ESLint, Oxlint and `.prettierrc.cjs` extending `@abyss/prettier-config` (renamed to `@abyss/base-config` in D2)
    - root scripts: `build`, `test`, `lint`, `typecheck`, `format`
  - Verify: `pnpm install && pnpm turbo run build --dry-run` shows form-commons before apps; `pnpm format` runs.
  - Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `abyss.code-workspace`, `packages/prettier-config/*` (now `packages/base-config`, D2)

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

- [ ] **T37: Playwright suite consolidation + CI** · split 2026-10-22 (REPLAN) into T37a-T37g below; T37b/T37e re-scoped and T37f added the same day after the user's "T37 correction" (handoff.md): docker-compose is local-test only and never runs in CI; production and CI use one image per service. REPLAN 2026-10-22 (second, user decision in handoff.md): e2e does NOT run in GitHub CI; it stays local only (`SMOKE_E2E=1 pnpm smoke`, `pnpm e2e:spec`). T37f is removed from the plan (it was already built @ a2897da, so T37g undoes its CI wiring); T37e publish is gated on the app's CI checks only (lint, typecheck, unit tests, build), not on e2e. Q-T37-8 and Q-T37-10 are resolved by this decision (Q-T37-9: one cms-api image, answered). User answers: handoff.md "T37 answers" (CI from `.github_template/`; cms-api = init container + main container; verified locally, the user pushes; core-builder owns `.github/`). Template map: `.github_template/workflows/*.yml` -> `.github/workflows/`, `.github_template/scripts/*.sh` -> `.github/scripts/` (the template workflows call `.github/scripts/...`); template app `frontend` = our `apps/web`; `tooling.test.sh` belongs to another repo (Storybook, eslint-config, `.vscode`) and is not carried over.

- [ ] **T37a: cms-api init container command (deploy migrate)** · S · Deps: T36 · core-builder · **Needs Q-T37-1, Q-T37-2** · Security gate: yes (every deploy and T37b/T37e/T38 build on it) · SPEC §4, D10, D17
  - Acceptance:
    - One command for the init container, run from the existing cms-api runtime image (same image, different command; no second Dockerfile): `npm run deploy:migrate` runs `db:migrate` (Prisma `migrate deploy` + role seed) then `content:migrate` (apply committed `content/migrations/*.sql`), in that order, stops at the first failure with a non-zero exit, and is idempotent (second run: "No pending migrations" + "No pending content migrations", exit 0). It never runs `content:generate` (no schema parsing/merging at deploy time, per Q-T37-1 recommended answer) and never runs `owner:bootstrap`.
    - Main container command stays `node dist/main.js` and runs no migrations.
    - `apps/cms-api/Dockerfile` runtime stage uses a numeric non-root user (`USER 1000:1000`, the `node` user of the base image) so `.github/scripts/image-user.sh` passes.
    - Smoke compose: a `cms-api-init` service (cms-api image, command `npm run --silent deploy:migrate`, same DB env) and `cms-api` `depends_on: cms-api-init: condition: service_completed_successfully`; `scripts/smoke.sh` asserts the init service exited 0 and its log holds the applied/seeded lines, and keeps the "again has nothing pending" assertions (run inside the image).
    - `apps/cms-api/README.md` documents the two-container contract (init command, order, idempotency, exit codes, required env).
  - Verify: `pnpm --filter @abyss/cms-api test:unit`; `docker build -f apps/cms-api/Dockerfile -t cms-api:ci . && bash .github_template/scripts/image-user.sh cms-api:ci`; `SMOKE_E2E=1 pnpm smoke` passes.
  - Files: `apps/cms-api/package.json`, `apps/cms-api/Dockerfile`, `apps/cms-api/README.md`, `docker-compose.smoke.yml`, `scripts/smoke.sh` (root files outside core-builder scope; assigned to core-builder for this task)

- [ ] **T37b: CI checks + build from the template (no compose, no e2e)** · M · Deps: T37a · core-builder · Q-T37-3, Q-T37-4, Q-T37-5 answered (handoff.md) · REPLAN 2026-10-22 per "T37 correction" (compose is local-only; e2e moved to T37f, later removed from CI entirely: see T37g) · SPEC §11, §12
  - Acceptance:
    - `.github/workflows/` is generated from `.github_template/workflows/` now: `ci.yml` (entrypoint), `cms-api.yml`, `cms-admin.yml`, `web.yml` (from the template `frontend.yml`). The untracked `.github/workflows/ci.yml` is overwritten with the template-based entrypoint (Q-T37-4); nothing from the old file is kept. `_publish.yml` is not added yet (T37e): the `publish` jobs of the app flows are left out (or commented with a pointer to T37e) so the workflows validate without it.
    - `.github/scripts/affected.sh` + `.github/scripts/affected.test.sh` copied from the template and adapted: turbo package names `@abyss/cms-api @abyss/cms-admin @abyss/web`; outputs keep the short keys (`cms_api_*`, `cms_admin_*`, `web_*`, `apps`, `image_apps`, `any`); template `frontend` renamed to `web` everywhere (outputs, workflow routing `.github/workflows/web.yml`, test fixtures). `tooling.test.sh` is not carried over; `bundle-check.sh` and `image-user.sh` come with T37e.
    - `ci.yml`: `TURBO_VERSION` = root `package.json` turbo (2.11.9); `IMAGE_PREFIX` per Q-T37-7 (`ghcr.io/hungnh1812dev/project-me`); triggers and branch case table kept from the template (develop/staging/main, Q-T37-3); no step assumes those branches exist. Jobs: `changes`, `cms-api`, `cms-admin`, `web` (each `if: <app>_affected`), plus a repo-wide `repo` job (always runs: `pnpm format:check`, `pnpm audit --prod --audit-level high`).
    - Per-app flows keep the template shape `Checks` -> `Build` with `--filter=@abyss/<app>`. Checks: typecheck, lint, unit tests per app; cms-api also `test:integration` (Testcontainers on the runner's Docker), `content:generate --check` and `graphql:print-schema -- --check`. Build: `pnpm turbo run build --filter=@abyss/<app>` (no Docker build here; images are built by T37e for publish only).
    - No workflow, script or step runs `docker compose` or references `docker-compose.smoke.yml` (compose is local-test only, user 2026-10-22).
    - The `--check` flag of `content:generate` (already in the working tree, uncommitted) is finished here with a unit test (exit non-zero and a clear message when the committed migrations are behind the schema).
    - `turbo.json` `build.inputs` excludes docs and tests (`$TURBO_DEFAULT$`, `!**/*.md`, `!docs/**`, `!**/*.spec.*`, `!**/*.test.*`, `!test/**`) so `affected.sh` routes docs/test-only changes to checks without a new image.
    - `docs/ci-cd.md` (the template workflows point to it) describes the flow (changes -> per-app Checks/Build -> publish (T37e); no e2e in CI, see T37g), the jobs per app, how to run each check locally, and states that compose is local-only and never used in CI.
  - Verify: `bash .github/scripts/affected.test.sh` passes; `grep -rn "compose" .github` finds nothing; every command the workflows run passes locally (`pnpm install --frozen-lockfile`, `pnpm turbo run typecheck lint test --filter=@abyss/<app>` for the three apps, `pnpm --filter @abyss/cms-api test:integration`, the two `--check` commands, `pnpm format:check`, `pnpm audit --prod --audit-level high`); workflow YAML validates with `actionlint` (via `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`). CI green on a branch is checked by the user after they push.
  - Files: `.github/workflows/{ci,cms-api,cms-admin,web}.yml`, `.github/scripts/{affected.sh,affected.test.sh}`, `turbo.json`, `apps/cms-api/src/modules/content-engine/cli/generate.ts` (+ spec), `docs/ci-cd.md`

- [ ] **T37c: web image numeric non-root user** · XS · Deps: none · ui-builder · SPEC D17
  - Acceptance: `apps/web/Dockerfile` runtime uses `USER 1000:1000` (was `USER node`); `apps/cms-admin` runtime still runs as the nginx-unprivileged numeric UID; both pass `image-user.sh`.
  - Verify: `docker build` each image, then `bash .github_template/scripts/image-user.sh <image>` for web and cms-admin; `SMOKE_E2E=1 pnpm smoke` passes.
  - Files: `apps/web/Dockerfile` (cms-admin only if the guard fails)

- [ ] **T37d: Playwright suite consolidation + success-criteria map** · M · Deps: T35, T36 · qc · SPEC §11, §12
  - Acceptance:
    - Every §12 criterion maps to a test id (Playwright spec + title, or Jest file + test) in `docs/modules/success-criteria.md`; gaps are listed, not hidden.
    - Known flakes fixed or quarantined with a reason: `media-attach.spec.ts` 'uploading in the field attaches...'; `web-session.spec` made independent of `two-factor.spec` state.
    - T35 'select 5 -> publish' spec added; `apps/e2e/README.md` lists the content specs.
    - CI reporter (`github` reporter when `CI` is set; already in the working tree) kept.
  - Verify: `SMOKE_E2E=1 pnpm smoke` passes twice in a row with no retries needed.
  - Files: `apps/e2e/**`, `docs/modules/success-criteria.md`

- [ ] **T37e: Image publish + deploy bump from the template** · M · Deps: T37a, T37b, T37c · core-builder · Q-T37-5, Q-T37-6, Q-T37-7, Q-T37-9 answered; Q-T37-8 resolved by the user decision "no e2e in CI" (publish is not gated on e2e) · Security gate: yes (registry credentials, deploy-repo token, `packages: write`) · REPLAN 2026-10-22: no compose anywhere; second REPLAN 2026-10-22: no e2e gate (built @ 612da2b with the e2e gate; T37g changes the gate) · SPEC D17
  - Acceptance:
    - `.github/workflows/_publish.yml` + `.github/scripts/{image-user.sh,bundle-check.sh}` adapted from the template (`frontend` -> `web`, Dockerfile `apps/<app>/Dockerfile`): per-platform image (build -> load -> non-root guard -> push by digest) -> manifest (`<branch>-<sha7>` + `<branch>`) -> deploy bump, for `cms-api`, `cms-admin`, `web`; only on a push to a publishing branch (template table) and only for apps whose build inputs changed (`<app>_image`). The `publish` jobs left out by T37b are restored.
    - One production image per service, built straight from its Dockerfile by `docker/build-push-action` (never compose; `docker-compose.smoke.yml` is not read).
    - cms-api (Q-T37-9, answered: one image): publishes one image used by both the init container (`npm run deploy:migrate`) and the main container (`node dist/main.js`); the deploy bump updates the tag both containers use.
    - Publish gating (user decision 2026-10-22, replaces the Q-T37-8 e2e gate): `ci.yml` jobs `publish-<app>` with `needs: [changes, <app>]` run only when the app flow (`Checks` + `Build`: lint, typecheck, unit tests, build; cms-api also its integration tests and `--check` commands) succeeded (`if: always() && ...<app>.result == 'success'`). No e2e job exists in CI, so e2e is never a gate. The code change from the built e2e gate is done in T37g.
    - Build args come from GitHub Environment variables (never secrets): cms-admin `VITE_API_BASE_URL`; web `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (names per Q-T37-7).
    - cms-admin bundle check kept and adapted to `VITE_API_BASE_URL` (Q-T37-6), run on the loaded image before the push.
    - Least privilege: workflow default `contents: read`; `packages: write` only on image/manifest jobs; deploy job uses only `DEPLOYMENT_REPO_TOKEN`.
    - `docs/ci-cd.md` lists every secret, variable and Environment the user must create, and the image list (one per service).
  - Verify: `actionlint` (docker) passes on `.github/workflows`; `grep -rn "compose" .github` finds nothing; locally `docker build -f apps/<app>/Dockerfile` for the three apps with production-shaped build args, then `bash .github/scripts/image-user.sh <image>` passes for each and `bash .github/scripts/bundle-check.sh` passes on the admin image; `bash .github/scripts/affected.test.sh` still passes. First real publish checked by the user after push.
  - Files: `.github/workflows/{_publish,ci,cms-api,cms-admin,web}.yml`, `.github/scripts/{image-user.sh,bundle-check.sh}`, `docs/ci-cd.md`

- [x] ~~**T37f: e2e in CI on a docker-run stack (no compose)**~~ · REMOVED from the plan 2026-10-22 (user decision: e2e does NOT run in GitHub CI; Q-T37-10 resolved by it). It was already built and committed @ a2897da; T37g removes its CI wiring. Nothing depends on T37f any more (T37e's dep on it is dropped). What stays from it, because local smoke uses it: `scripts/lib/stack-seed.sh` and `scripts/stack/cms-api.env` (+ the compose `env_file:`). The original acceptance is in git history (tasks/todo.md before this replan); do not build or check it.

- [ ] **T37g: Remove e2e from CI; publish gated on the app's CI checks only** · S · Deps: none (T37e @ 612da2b and T37f @ a2897da are committed) · core-builder · Security gate: yes (changes the condition that lets `publish-<app>` push images with `packages: write` and bump the deploy repo) · **Needs Q-T37-12** (delete `scripts/e2e-stack.sh`?; builder follows the recommended answer, deletions wait for user approval) · REPLAN 2026-10-22, user decision in handoff.md · SPEC §11, §13 (CI/deploy changes), D17
  - Acceptance:
    - `.github/workflows/ci.yml`: the `e2e` job and the `e2e` output of `changes` are removed. `publish-cms-api`, `publish-cms-admin`, `publish-web` have `needs: [changes, <app>]` and `if: always() && needs.changes.outputs.publish == 'true' && needs.changes.outputs.<app>_image == 'true' && needs.<app>.result == 'success'` (the `always()` stays so a failing sibling app never blocks another app's publish). Permissions, secrets, inputs and every other job are unchanged. The header comment says e2e does not run in CI and publish follows the app flow.
    - `.github/workflows/e2e.yml` is deleted (user approval first). No workflow references it.
    - `.github/workflows/_publish.yml`: header comment says it runs after the app flow passed (no e2e). No logic change.
    - `.github/scripts/affected.sh`: output `e2e`, `E2E_PATHS` and the e2e-files logic are removed, header comment updated; every other output is byte-for-byte the same for the same input. `.github/scripts/affected.test.sh`: only the `e2e=` expectations, the e2e-path loop and the fixtures used only by it are removed; all other cases stay.
    - Per Q-T37-12 recommended answer: `scripts/e2e-stack.sh` and `scripts/stack/web-build.env` (used only by it and by `e2e.yml`) are deleted (user approval first). `scripts/lib/stack-seed.sh`, `scripts/stack/cms-api.env` and the compose `env_file:` stay (local smoke uses them); their comments and the comment in `scripts/smoke.sh` no longer mention `e2e-stack.sh` or a CI e2e stack. If the user keeps `e2e-stack.sh`: keep both files, change only comments to "local only, not run in CI", and keep its docs section renamed "Local docker-run stack (optional)".
    - `docs/ci-cd.md`: flow diagram and jobs table have no `e2e`; the `affected.sh` outputs paragraph drops `e2e`; the "e2e in CI" section is replaced by a short "e2e (local only)" section: GitHub CI never runs Playwright; run `SMOKE_E2E=1 pnpm smoke` before pushing to `staging`/`main`, `pnpm e2e:spec <spec>` for single specs against a kept stack, link to `apps/e2e/README.md`. The Publish section states the gate: push to `staging`/`main` + `<app>_image` + the app flow (`Checks` and `Build`) succeeded.
    - `apps/e2e/README.md`: the `e2e-stack.sh` / `#e2e-in-ci` line is replaced by one line "e2e runs locally only; CI does not run it" (qc scope; assigned to core-builder for this line only).
    - Left as is: the `github` Playwright reporter when `CI` is set in `apps/e2e/playwright.config.ts` (harmless, qc scope).
  - Verify: `bash .github/scripts/affected.test.sh` passes; `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest` is clean; `grep -rnE "e2e\.yml|e2e-stack|needs\.e2e|outputs\.e2e|E2E_PATHS" .github` finds nothing; `grep -rn "e2e-stack\|e2e-in-ci\|web-build.env" scripts docs apps/e2e/README.md docker-compose.smoke.yml` finds nothing (recommended answer); `bash -n` on every edited shell script; `SMOKE_E2E=1 pnpm smoke` still passes (`SMOKE_NO_BUILD=1` allowed, no product code changes); `pnpm format:check` passes.
  - Files: `.github/workflows/{ci,_publish}.yml`, `.github/workflows/e2e.yml` (delete), `.github/scripts/{affected.sh,affected.test.sh}`, `scripts/e2e-stack.sh` (delete), `scripts/stack/web-build.env` (delete), `scripts/{smoke.sh,lib/stack-seed.sh,stack/cms-api.env}` (comments only), `docs/ci-cd.md`, `apps/e2e/README.md` (one line)

- [ ] **T38: Deployment guide for the deploy repo** · S · Deps: T36, T37a
  - Acceptance:
    - `docs/deployment/k3s-traefik.md` covers:
      - IngressRoutes (web + `/api` on `domain.com`, admin on `admin.domain.com`; never StripPrefix; `/api` matched before the web catch-all)
      - web is a Node service (Next.js standalone on `WEB_PORT`, non-root, readiness probe on `/`), not nginx; build arg `NEXT_PUBLIC_API_BASE_URL` vs runtime env `API_INTERNAL_URL` (in-cluster cms-api Service URL) and `WEB_REVALIDATE_SECONDS`; resource requests for the Node process
      - Traefik service `externalTrafficPolicy: Local` and the `TRUST_PROXY_HOPS` value
      - cms-api as two containers in one pod (replaces the migration Job, user 2026-10-22): init container = same cms-api image, command `npm run deploy:migrate` (`db:migrate` → `content:migrate`, T37a); main container = `node dist/main.js`. The pod only starts serving after the init container exits 0; a failed migration leaves the old ReplicaSet serving (rolling update). Concurrent init runs are safe (Prisma migrate lock; content runner takes `pg_advisory_xact_lock`), still single replica in v1. Destructive content migrations need the expand/contract note (old pods keep running during rollout). `owner:bootstrap` stays a one-time manual `kubectl exec`.
      - env contract table, secrets via SOPS/sealed-secrets
      - nightly `pg_dump` off-site plus a restore drill, single-replica note
  - Verify: user review; commands in the guide are run against the smoke stack.
  - Files: `docs/deployment/k3s-traefik.md`

### Checkpoint 8 (release)
- [ ] All §12 criteria green: Jest/Vitest criteria in the CI app flows; Playwright criteria locally with `SMOKE_E2E=1 pnpm smoke` (e2e does not run in CI, user 2026-10-22)
- [ ] Deploy guide reviewed by user
- [ ] v2 backlog untouched

## Ad-hoc: Base config

- [x] **D2: `@abyss/base-config` (Prettier + ESLint + Oxlint) for every app and package** · **Superseded by D3** (user decision 2026-10-22: build to `dist/`, replaces Q-BC4 "TS sources loaded directly, no build step"; the contract lines below about `src/*.ts` exports and "no build step" no longer hold, everything else stands). Steps A (76d9058) and B (1018286) committed, step C qc CLI pass; the Docker builds in Verify were not run and move to D3 · M · Deps: none · core-builder (step A) -> ui-builder (step B) -> qc (step C) · User answers: handoff.md "Base config" (Q1 base + local extend, Q2 remove old files, Q3 name `@abyss/base-config`) · **Needs Q-BC1..Q-BC4** (builders follow the recommended answers until answered) · SPEC §5 (tree), §10 (code style)
  - Contract (planner decision):
    - Rename `packages/prettier-config` -> `packages/base-config`, package name `@abyss/base-config`. `exports`: `"./prettier"`, `"./eslint"`, `"./oxlint"` (no `"."` export). Sources: `packages/base-config/src/{prettier,eslint,oxlint}.ts`, loaded directly through Node 24 type stripping, no build step, so `pnpm format` / `pnpm lint` work on a fresh clone without building anything first (Q-BC4). Erasable TS syntax only (no enums, no namespaces, explicit `.ts` import extensions).
    - `./prettier`: default export, a Prettier `Config`. Values = today's `index.cjs` (printWidth 80, singleQuote, semi, trailingComma all, endOfLine lf, ...), no plugins (Q-BC1). Running `pnpm format` after the move changes no file.
    - `./eslint`: a function or array for flat config that every project spreads first, holding the rules shared by all projects: `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked` with `parserOptions.projectService: true` (each project passes its own `tsconfigRootDir`), the shared ignores (`dist/**`, `coverage/**`, `*.cjs`, `*.mjs`), and the `_`-prefix pattern for `no-unused-vars` / `@typescript-eslint/no-unused-vars`. No React, Next, Jest or Prettier plugin in the base (Q1: local extend); no rule relaxations beyond today's configs (Q-BC2). `@eslint/js`, `typescript-eslint`, `globals` become `dependencies` of base-config (same pinned versions as today: `@eslint/js` 10.0.1, `typescript-eslint` 8.71.2, `globals` 17.13.0), `eslint` a `peerDependency`.
    - `./oxlint`: an Oxlint config object (`defineConfig` from `oxlint`) with `plugins: ['typescript']`, `categories: { correctness: 'error', suspicious: 'warn' }`, the same `_`-prefix unused-vars options, `ignorePatterns: ['dist', 'coverage', 'node_modules']`. No React, Jest, Vitest or `prettier/prettier` rule in the base (Q-BC3). Each project gets `oxlint.config.ts` that extends/spreads the base and adds its own plugins, env, ignores and rules (the content of its `.oxlintrc.json` today). If Oxlint 1.88 cannot load a TS config that imports a workspace package, stop and report (fallback: base ships `oxlint.json` and projects keep `.oxlintrc.json` with `"extends"`).
    - Each project's lint result after the change is the same as before: same rules on, same severities, plus the shared `_` unused-vars pattern. The local extends per project are:
      - cms-api: ESLint `globals.node`, ignore `src/generated/**`; Oxlint plugins `jest`, `node`, env node + jest, ignore `src/generated`, rule `typescript/no-extraneous-class` (allowWithDecorator, allowStaticOnly).
      - e2e: ESLint `globals.node`, ignore `playwright-report/**`, `test-results/**`, `blob-report/**`; Oxlint env node, same three ignores.
      - cms-admin, form-commons: ESLint `globals.browser` + `eslint-plugin-react-hooks` `flat['recommended-latest']`; Oxlint plugins `react`, `jsx-a11y`, `vitest`, env browser, `react/react-in-jsx-scope: off`.
      - web: as cms-admin plus `@next/eslint-plugin-next` `core-web-vitals`, ESLint ignores `.next/**`, `next-env.d.ts`, `dist/**`; Oxlint ignore `.next`.
      - base-config itself and the repo root: lint with the base (`eslint.config.ts` + `oxlint.config.ts` at the package root that import `./src/*.ts`, node globals).
    - Prettier consumption: every `.prettierrc.cjs` (root, 5 projects) becomes a one-line re-export of `@abyss/base-config/prettier` (builder picks the loadable form: `prettier.config.mjs` with `export { default } from '@abyss/base-config/prettier'`, or the `.cjs` with `require(...).default`); replacing a `.prettierrc.cjs` by another file name is a deletion (approval below).
  - Acceptance:
    - `packages/base-config` exists with `package.json` (name, exports, deps above, scripts `test` / `lint` / `typecheck`), `src/{prettier,eslint,oxlint}.ts`, `tsconfig.json` (includes `src/**/*.ts`, `test/**`, root config files), `README.md` (what each export holds, how a project extends it, one example per project type: Nest, React/Vite, Next, Playwright) and tests.
    - Tests (`node --test`): each export loads; `prettier` formats `const a = {b: "c", d: [1,2]}` to `const a = { b: 'c', d: [1, 2] };\n`; `prettier.resolveConfig` for a file in each project resolves to the shared config; the ESLint export is a valid flat config (ESLint `Linter` / `ESLint` API calculates a config for a `.ts` file with `@typescript-eslint/no-floating-promises` on); the Oxlint export has the base categories.
    - No `@abyss/prettier-config` reference left in the repo outside history files: root `package.json`, every app/package `package.json`, all prettier config files, `abyss.code-workspace` (folder entry name + path), `pnpm-lock.yaml` (via `pnpm install`), package README and tests. (SPEC.md §5/§10 and tasks/todo.md T01 are already updated by the planner; `.claude/state/project.md` scope and `conventions.md` "Per-project tooling" are updated by the manager.)
    - Every app and package lints through the base: `eslint.config.mjs` in cms-api, cms-admin, web, e2e, form-commons imports `@abyss/base-config/eslint` and keeps only its local extend; each has `oxlint.config.ts` importing `@abyss/base-config/oxlint`; each `package.json` has `"@abyss/base-config": "workspace:*"` in devDependencies and drops `@eslint/js` / `typescript-eslint` / `globals` only if nothing else in the project imports them (keep them otherwise).
    - `pnpm lint` reports no new errors and no more warnings than before the change (record the per-project counts before step A in the unit record).
    - Docker images still build (turbo prune picks up the renamed package).
  - Steps and scope:
    - **Step A, core-builder** (scope: `packages/base-config` + root files and apps/e2e config, assigned for this task):
      - Create `packages/base-config` (move `README.md`, `test/`, `tsconfig.json`; turn the untracked drafts `packages/prettier-config/{prettier,eslint,oxlint}.config.ts` into `src/{prettier,eslint,oxlint}.ts` per the contract; the drafts' extra plugins, `@repo/`/`apps/frontend` paths and rule relaxations are not carried over unless Q-BC1..Q-BC3 say so).
      - Rename every `@abyss/prettier-config` reference repo-wide in one go so the workspace never breaks between steps: root `package.json`, `.prettierrc.cjs` (root + all 5 projects, mechanical one-line change also in ui-builder's projects), every `package.json` devDependency (mechanical rename also in cms-admin, web, form-commons), `abyss.code-workspace`, then `pnpm install` (lockfile).
      - Adopt the ESLint and Oxlint base in `apps/cms-api` and `apps/e2e`.
      - apps/e2e decision: its lint/format config files (`apps/e2e/{package.json,eslint.config.mjs,.oxlintrc.json -> oxlint.config.ts,.prettierrc.cjs}`) are assigned to core-builder for this task only (config, no spec or `src/` change). Reason: they are tooling config identical in shape to cms-api's, qc is the checker of this task and should not build what it checks, and a separate qc build step would add a hop for four files. qc keeps ownership of everything else in apps/e2e.
      - Files: `packages/base-config/**`, `package.json`, `.prettierrc.cjs`, `abyss.code-workspace`, `pnpm-lock.yaml`, `apps/cms-api/{package.json,eslint.config.mjs,oxlint.config.ts,.prettierrc.cjs}`, `apps/e2e/{package.json,eslint.config.mjs,oxlint.config.ts,.prettierrc.cjs}`, the one-line rename in `apps/cms-admin/{package.json,.prettierrc.cjs}`, `apps/web/{package.json,.prettierrc.cjs}`, `packages/form-commons/{package.json,.prettierrc.cjs}`.
    - **Step B, ui-builder** (after A is green): adopt the ESLint and Oxlint base in cms-admin, web, form-commons with the local extends above. Files: `apps/cms-admin/{package.json,eslint.config.mjs,oxlint.config.ts}`, `apps/web/{package.json,eslint.config.mjs,oxlint.config.ts}`, `packages/form-commons/{package.json,eslint.config.mjs,oxlint.config.ts}`, `pnpm-lock.yaml` if deps change.
    - **Step C, qc (CLI)**: runs the Verify list on the whole repo; no file changes.
  - Deletions (each needs user approval before it runs; the builder lists them in the report and asks through the manager):
    - Step A: the folder `packages/prettier-config` after its content is moved, incl. `index.cjs`, `.prettierrc.cjs`, `.oxlintrc.json`, `eslint.config.mjs`, and the drafts `eslint.config.ts`, `oxlint.config.ts`, `prettier.config.ts` (their content lives on in `packages/base-config/src/`); `apps/cms-api/.oxlintrc.json`, `apps/e2e/.oxlintrc.json`; any `.prettierrc.cjs` replaced by a differently named file.
    - Step B: `apps/cms-admin/.oxlintrc.json`, `apps/web/.oxlintrc.json`, `packages/form-commons/.oxlintrc.json`.
    - Until approval, the old files stay; a stale `.oxlintrc.json` next to `oxlint.config.ts` must not change the lint result (check which one Oxlint picks; if both are read, wait for approval before finishing the step).
  - Verify:
    - `pnpm install` (lockfile updated); `grep -rn "prettier-config" . --exclude-dir={node_modules,.git,.turbo,dist,.next,.claude,tasks}` finds nothing (tasks/ keeps the history references).
    - `pnpm --filter @abyss/base-config test`, `pnpm --filter @abyss/base-config lint`, `pnpm --filter @abyss/base-config typecheck`.
    - `pnpm lint` and `pnpm typecheck` pass; lint counts per project not worse than the before-counts.
    - `pnpm format` then `git status --porcelain` shows no file changed by formatting; `pnpm format:check` passes.
    - Base applied in every project: `pnpm --filter <pkg> exec eslint --print-config <a src .ts file>` shows `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'` for all 6 workspace packages; a scratch file with an unused `_x` argument gives no warning and one with an unused `x` gives a warning (remove the scratch file after).
    - `pnpm turbo run typecheck lint --filter=@abyss/cms-api --filter=@abyss/cms-admin --filter=@abyss/web` (the CI checks command) passes.
    - `docker build -f apps/cms-api/Dockerfile .`, `apps/web/Dockerfile`, `apps/cms-admin/Dockerfile` build (turbo prune + frozen lockfile with the renamed package).

- [ ] **D3: Build `@abyss/base-config` to `dist/` and export from dist** · S · Deps: D2 (done) · core-builder · Supersedes D2's Q-BC4 contract (user decision 2026-10-22, handoff.md "Base config" last line) · **Needs Q-D3-1, Q-D3-2** (builder follows the recommended answers until answered) · SPEC §5 (tree), §10 (code style)
  - Contract (planner decision):
    - Build tool: `tsc` with a new `packages/base-config/tsconfig.build.json` (extends `./tsconfig.json`; `rootDir: src`, `outDir: dist`, `noEmit: false`, `declaration: true`, `declarationMap: true`, `include: ["src/**/*.ts"]`). No bundler: the three files are small, have no inter-file imports, and their deps (`@eslint/js`, `typescript-eslint`, `globals`, `oxlint`, `prettier` types) stay external `dependencies` / `peerDependencies`. If `allowImportingTsExtensions` blocks emit, drop it from the build config (src has no relative imports today).
    - Output: ESM only (`"type": "module"` stays), `dist/{prettier,eslint,oxlint}.js` + `.d.ts` (+ `.d.ts.map`). Script `"build": "tsc -p tsconfig.build.json"`; `"files": ["dist"]`. `dist/` is already gitignored and prettier-ignored (root `.gitignore`, `.prettierignore`).
    - Exports map (no `"."` export, as in D2):
      ```json
      "./prettier": { "types": "./dist/prettier.d.ts", "import": "./dist/prettier.js", "default": "./dist/prettier.js" },
      "./eslint":   { "types": "./dist/eslint.d.ts",   "import": "./dist/eslint.js",   "default": "./dist/eslint.js" },
      "./oxlint":   { "types": "./dist/oxlint.d.ts",   "import": "./dist/oxlint.js",   "default": "./dist/oxlint.js" }
      ```
      `default` is there because every `.prettierrc.cjs` file load the config with `require('@abyss/base-config/prettier').default`; `require` does not match the `import` condition, and Node 24 `require(esm)` loads the ESM file through `default` (Q-D3-1).
    - The package's own `eslint.config.ts` / `oxlint.config.ts` keep importing `./src/*.ts` (lint the sources, no build needed for self-lint). `tsconfig.json` stays the typecheck config (noEmit) for `src`, `test`, root config files.
    - Tests keep importing through the package exports (`@abyss/base-config/*`), so they now exercise `dist/`. Add `packages/base-config/turbo.json` (`{"extends": ["//"], "tasks": {"test": {"dependsOn": ["build"]}}}`) so `turbo run test` builds first; the `test` script itself stays `node --test`.
  - Consumers (lint, format, tsconfig):
    - ESLint: every `eslint.config.mjs` (cms-api, cms-admin, web, e2e, form-commons) already imports `@abyss/base-config/eslint`; no source change, it now resolves to `dist/eslint.js`.
    - Oxlint: every `oxlint.config.ts` imports `@abyss/base-config/oxlint`; no source change, it now resolves to `dist/oxlint.js`. Check that Oxlint 1.88 loads it.
    - Prettier: the seven `.prettierrc.cjs` (root, cms-api, cms-admin, web, e2e, form-commons, base-config) stay as they are and resolve through the `default` condition.
    - tsconfig: consumers that typecheck their `oxlint.config.ts` / `eslint.config.*` get types from `dist/*.d.ts` via the `types` condition. No `paths` alias to `src`. If a consumer tsconfig uses a `moduleResolution` that ignores `exports` (`node10`), report it rather than adding a `typesVersions` shim.
  - Build ordering (turbo, Docker, CI):
    - turbo: `lint`, `typecheck`, `test`, `build` already have `dependsOn: ["^build"]`, and every consumer lists `@abyss/base-config` in devDependencies, so turbo builds base-config before any consumer task. No root `turbo.json` change expected; if the graph shows otherwise (`pnpm turbo run lint --dry=json` lacks `@abyss/base-config#build` before a consumer's `lint`), fix it in root `turbo.json`.
    - Root `package.json`: `format` and `format:check` run Prettier directly, not through turbo, so they become `turbo run build --filter=@abyss/base-config && prettier --write .` / `... && prettier --check .` (Q-D3-2). This also covers the CI "Repo checks" job (`pnpm format:check` right after `pnpm install`), so `.github/workflows/ci.yml` needs no change.
    - Docker: the three Dockerfiles run `pnpm turbo run build --filter=@abyss/<app>`; turbo prune keeps base-config (devDependency) and `^build` builds it first. No Dockerfile change expected; no install-time hook may be added that runs in the `out/json` install stage (sources are not there yet). `pnpm deploy --prod` (cms-api) drops devDependencies, so base-config does not reach the runtime image.
  - Acceptance:
    - `pnpm --filter @abyss/base-config build` writes `dist/{prettier,eslint,oxlint}.{js,d.ts}`; `package.json` exports point only at `dist/` (no `src/` path left in `exports`, `main`, `types` or `files`).
    - With `packages/base-config/dist` absent, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` each pass (turbo or the root script builds base-config first).
    - Lint results per project are the same as after D2 (same counts); `pnpm format` changes no file.
    - README (`packages/base-config/README.md`) states the package is built to `dist/`, that turbo builds it before consumers, and that editor integrations (ESLint / Prettier extensions) need one `pnpm --filter @abyss/base-config build` after a fresh clone (Q-D3-2). Remove the "loaded directly, no build step" wording. `SPEC.md` §5 / §10 wording about base-config and `conventions.md` are owned by planner / manager: the builder lists any stale lines in the report instead of editing them.
    - The three Docker images build.
  - Files: `packages/base-config/{package.json,tsconfig.build.json,turbo.json,README.md,test/config.test.ts}` (test only if a path changes), root `package.json` (format scripts), root `turbo.json` (only if the graph check fails), `pnpm-lock.yaml` (only if deps change). No change expected in apps or form-commons; if one is needed, stop and report (ui-builder scope).
  - Verify:
    - Fresh-clone check: `git clone <repo> <scratchpad dir>` (or `git worktree add` in the scratchpad), then in it: `pnpm install --frozen-lockfile`; confirm `packages/base-config/dist` does not exist; run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, each passes without a manual build. Remove the clone/worktree after (worktree: `git worktree remove`; ask before deleting anything else).
    - `pnpm turbo run lint --filter=@abyss/cms-api --dry=json` lists `@abyss/base-config#build` as a dependency of `@abyss/cms-api#lint` (same for one ui project, e.g. `@abyss/web`).
    - `pnpm --filter @abyss/base-config build && pnpm turbo run test lint typecheck --filter=@abyss/base-config`.
    - `node -e "console.log(require('@abyss/base-config/prettier').default.singleQuote)"` from the repo root prints `true`; `pnpm exec prettier --find-config-path apps/web/src` resolves and `pnpm exec prettier --check apps/web/src` passes.
    - `pnpm turbo run typecheck lint --filter=@abyss/cms-api --filter=@abyss/cms-admin --filter=@abyss/web` (CI checks command) passes.
    - `docker build -f apps/cms-api/Dockerfile .`, `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=<smoke value> .`, `docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=<smoke value> .` succeed (values as in `docker-compose.smoke.yml`); the build log shows `@abyss/base-config:build` before the app build. If the Docker daemon is down, report it as not run.
    - `pnpm exec prettier --write` on the changed files; `git status --porcelain` shows only the files listed above.
