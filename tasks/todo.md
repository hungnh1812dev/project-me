# Task List: Abyss CMS v1

Spec: [../SPEC.md](../SPEC.md) · Plan: [plan.md](plan.md)

Conventions for every task:
- **Definition of Done:** tests pass (`pnpm turbo run test --filter=<pkg>`), `pnpm turbo run lint typecheck` clean, `pnpm format` run, docs/`.env.example` updated, no literals (see `code-standards`).
- "§" refers to SPEC.md sections. "C#" refers to the review findings fixed by SPEC §7.
- Size: S = 1–2 files · M = 3–5 files.

---

## Phase 0: Walking skeleton

- [x] **T01: Monorepo + tooling isolation** · M · Deps: none
  - Acceptance:
    - pnpm workspace + `turbo.json` (`build` dependsOn `^build`, outputs `dist/**`); `abyss.code-workspace` with one folder per app/package
    - `tsconfig.base.json` has compilerOptions only; each project has its own tsconfig, ESLint, Oxlint and `.prettierrc.cjs` extending `@abyss/prettier-config` (renamed to `@abyss/base-config` in D2)
    - root scripts: `build`, `test`, `lint`, `typecheck`, `format`
  - Verify: `pnpm install && pnpm turbo run build --dry-run` shows form-commons before apps; `pnpm format` runs.
  - Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `abyss.code-workspace`, `packages/prettier-config/*` (now `packages/base-config`, D2)

- [x] **T02: cms-api skeleton (config, pipeline, health)** · M · Deps: T01
  - Acceptance:
    - Zod env schema → frozen `IAppConfig`. Production refinements fail on console mail, missing secrets or short secrets (§12-15). Boot summary redacts secrets.
    - Express adapter, prefix `/api/v1`, strict routing off, `trust proxy` = `TRUST_PROXY_HOPS`, unified error filter `{statusCode,errorCode,message,requestId}`.
    - `GET /health/live` and `/health/ready` (DB ping) return `{status}` only.
  - Verify: integration tests for config failures, the trailing-slash route and health; `.env.example` lists every key.
  - Files: `apps/cms-api/src/{main.ts,config/env.schema.ts,config/app-config.ts,common/filters/http-exception.filter.ts,modules/health/*}`, `apps/cms-api/.env.example`

- [x] **T03: @abyss/form-commons package (dist-only) + first components** · M · Deps: T01
  - Acceptance:
    - tsup builds ESM+CJS+d.ts+`styles.css` into `dist/`. `exports` point only into `dist`. `sideEffects` set so unused components tree-shake.
    - `components/ui/{button,input,label}` from the shadcn CLI. `components/forms/{Field,TextInput}` support RHF + native rules + Zod and set `aria-invalid`/`aria-describedby`.
  - Verify: Vitest component tests; `pnpm --filter @abyss/form-commons build` produces `dist/index.d.ts`.
  - Files: `packages/form-commons/{package.json,tsup.config.ts,components.json,src/index.ts,src/components/forms/Field/*,src/components/forms/TextInput/*}`

- [x] **T04: cms-admin & web skeletons + Dockerfiles + proxy smoke test** · M · Deps: T02, T03 · Needs Q4 (placeholders OK)
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

- [x] **T05: JSON schema format + definition validator** · M · Deps: T02
  - Acceptance:
    - Documented format (`docs/modules/content-schema.md`): kind, draftAndPublish, field types (string, text, richtext, integer, decimal, boolean, date, datetime, json, media, component, repeatable component), `sensitive` hint.
    - The validator rejects: depth > 3, identifiers that fail `^[a-z][a-z0-9_]*$`, composed table/column names > 63 bytes, collisions after normalisation, reserved names.
    - `content/schemas/cv-page.json` is ported from the old ERD (fix the `responsitoryLink` → `repositoryLink` typo).
  - Verify: unit tests for every rejection rule plus cv-page acceptance.
  - Files: `apps/cms-api/src/modules/content-engine/{definition.schema.ts,definition.validator.ts,naming.ts}`, `apps/cms-api/content/schemas/cv-page.json`, docs file

- [x] **T06: SQL migration generator + content:migrate** · M · Deps: T05 · **Needs Q1**
  - Acceptance:
    - `content:generate` diffs the definitions against `content_types.definition_hash` and writes an SQL migration into `content/migrations/` (schema `content`, root partial unique indexes, component tables with `parent_id … ON DELETE CASCADE`, `component_uid`, `order_index`, indexes). Additive only unless `--allow-destructive`.
    - `content:migrate` applies pending migrations in a transaction with an advisory lock and upserts `content_types`.
  - Verify: Testcontainers test: cv-page → exactly 8 tables (§12-16); re-run is a no-op; a destructive change without the flag fails.
  - Files: `apps/cms-api/src/modules/content-engine/{sql-generator.ts,migration-runner.ts,cli/generate.ts,cli/migrate.ts}`, `package.json` scripts

- [x] **T07: Content tree repository** · M · Deps: T06
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

- [x] **T08: Core Prisma schema, system roles seed, owner:bootstrap** · M · Deps: T02
  - Acceptance:
    - Prisma models for every §8.1 table (schema `public`). `created_by` uses ON DELETE SET NULL. Partial unique index for the single owner (raw SQL in the migration).
    - Seed system roles (`public, guest, reviewer, editor, admin, owner`) with immutable slug/rank.
    - `owner:bootstrap` CLI: advisory lock, refuses if an owner exists, Argon2id hash (§12-1).
  - Verify: integration tests: first run ok, second run fails, concurrent runs → exactly one owner.
  - Files: `apps/cms-api/prisma/{schema.prisma,migrations/*,seed.ts}`, `apps/cms-api/src/modules/identity/cli/owner-bootstrap.ts`

- [x] **T09: Login, JWT, refresh rotation, logout** · M · Deps: T08 · **Needs Q2**
  - Acceptance:
    - `POST /auth/login` (Argon2id verify, identical error for unknown email and wrong password) returns an access token in the body; refresh cookie as in §6.
    - `/auth/refresh` rotates with `family_id`; reuse revokes the family and bumps `token_version` (§12-10). `/auth/refresh` and `/logout` require an allowlisted `Origin`.
    - JWT HS256 pinned with `sub,tv,pv,kid`. No register route exists (§12-2).
  - Verify: integration tests for each criterion, including the cookie attributes.
  - Files: `apps/cms-api/src/modules/identity/{auth.controller.ts,auth.service.ts,refresh-token.service.ts,jwt.strategy.ts}`, `common/constants/auth.constants.ts`

- [x] **T10: Rate limiting + client IP resolution** · S · Deps: T09
  - Acceptance:
    - `ClientIpResolver` uses `TRUST_PROXY_HOPS` / `CLIENT_IP_HEADER`; spoofed XFF ignored (§12-8).
    - Throttles: login per IP + per email, OTP request, 2FA verify, refresh, using named constants.
  - Verify: integration tests with forged headers; 429 bodies use the unified error shape.
  - Files: `apps/cms-api/src/common/{client-ip.resolver.ts,guards/throttle.guard.ts,constants/limits.constants.ts}`

- [x] **T11: Admin login slice** · M · Deps: T04, T09
  - Acceptance:
    - cms-admin: `LoginPage` built from `Field`/`TextInput`/`Button`; RTK `authSlice` keeps the access token in memory only; the Axios interceptor refreshes once on 401 with a queued retry.
    - Protected route shell; logout clears the store and calls `/auth/logout`.
  - Verify: Vitest for slice + interceptor; Playwright: owner logs in, reloads (silent refresh), logs out.
  - Files: `apps/cms-admin/src/{store/auth.slice.ts,lib/api-client.ts,features/auth/LoginPage.tsx,app/ProtectedRoute.tsx}`, `apps/e2e/tests/login.spec.ts`

- [x] **T12: OTP service + password lifecycle** · M · Deps: T09, T10
  - Acceptance:
    - `OtpService`: HMAC with `OTP_PEPPER`, purpose-bound, 5 attempts per code, 5 issued per account per hour, single-use atomic consume (§12-9).
    - Endpoints `request-otp` (always 202), `reset` (requires TOTP when enabled), `set` (invite), `change`. Each bumps `token_version` (§12-10). Mail port with Console (dev only) and Gmail adapters.
    - UI: Reset + Set-password pages in cms-admin.
  - Verify: integration tests (enumeration timing/body parity, attempt limits, old access token → 401); Playwright reset flow using the console mail capture in test mode.
  - Files: `apps/cms-api/src/modules/identity/{otp.service.ts,password.controller.ts,password.service.ts}`, `apps/cms-api/src/infrastructure/mail/*`, `apps/cms-admin/src/features/auth/{ResetPasswordPage,SetPasswordPage}.tsx`

- [x] **T13: Two-factor authentication** · M · Deps: T12 · **Needs Q3**
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

- [x] **T14: Roles/permissions model + policy evaluator + conditions DSL** · M · Deps: T08
  - Acceptance:
    - `PolicyEvaluator.can(actor, action, subject)` and `fieldsFor(actor, subject)` → `{ readable, writable }`. Unknown subject → deny.
    - Conditions DSL compiler (§8.3) → parameterized SQL fragments; invalid operators or variables rejected at save time.
    - `ActorContext` covers account, reviewer and api token (token scope ∩ creator's current permissions).
  - Verify: unit tests (matrix per role, DSL injection attempts rejected).
  - Files: `apps/cms-api/src/modules/access/{policy-evaluator.ts,conditions.compiler.ts,actor-context.ts,permission.decorator.ts}`

- [x] **T15: Revocation versions in the JWT guard** · S · Deps: T09, T14
  - Acceptance:
    - The guard compares `tv`/`pv` with DB values through `VersionCache` (invalidated on write; 5 s TTL fallback). A disabled account → 401.
    - Changing a role's permissions bumps `policy_version`; the next request is evaluated with new permissions (§12-11).
  - Verify: integration test: editor loses `update` → next PUT 403 with the old token.
  - Files: `apps/cms-api/src/modules/access/{version-cache.ts,jwt-auth.guard.ts}`

- [x] **T16: Field projection, masking serializer, write allowlist** · M · Deps: T14
  - Acceptance:
    - `RecordSerializer.serialize(record, fields)` emits the sentinel or `null` plus `_maskedFields`, recursing into components. It is the only path that turns records into responses (lint rule or architecture test).
    - `WriteAllowlist.apply(payload, fields)` drops masked fields that carry the sentinel and rejects other non-writable or unknown keys with 400. Client `_maskedFields` is ignored (C5).
    - `QueryGuard` rejects filter/sort/search on unreadable fields (`FIELD_NOT_READABLE`).
  - Verify: unit tests plus a property-style test asserting no raw value of an unreadable field appears anywhere in serialized output.
  - Files: `apps/cms-api/src/modules/access/{record.serializer.ts,write-allowlist.ts,query.guard.ts}`

- [x] **T17: Accounts & roles management API + security audit** · M · Deps: T12, T15
  - Acceptance:
    - Accounts: invite (sends `INVITE_SET_PASSWORD` OTP), update, disable, revoke sessions. Roles: CRUD custom roles (rank 11–39) and set permissions. Every operation enforces target rank < actor rank (§12-7).
    - `SecurityAuditService` writes in-transaction for every D15 event, and for login/2FA/password events from Phase 2 (§12-18).
  - Verify: integration tests: the escalation matrix (admin vs admin, admin edits the admin role, assign owner) all 403; an audit row exists per event.
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,roles.controller.ts,roles.service.ts,security-audit.service.ts}`

- [x] **T17a: Re-enable account + resend invite + invite rate limit (API)** · M · Deps: T17 · Q7-Q9 answered
  - Acceptance:
    - `POST /accounts/:id/enable` (`accounts:update`, D6 rank rule, never self): a `disabled` account goes back to `active` when it has a password, else to `invited` (Q7). Any other status → `409 ACCOUNT_NOT_DISABLED`. In one transaction with audit `account.enabled` (metadata: resulting status only); VersionCache invalidated; `204`. No `token_version` change (disable already bumped it).
    - `POST /accounts/:id/invite/resend` (`accounts:create` (Q8), D6 rank rule, never self): only `invited` accounts, else `409 ACCOUNT_NOT_INVITED`. In one transaction: new `INVITE_SET_PASSWORD` code (older invite codes stop working; the 5-codes/hour DB cap answers 429 and rolls back) + audit `account.invite_resent`; then mails it. `200 { invitationSent }` with the same meaning as invite.
    - Invite throttle (Q9): 10 / hour per actor + 20 / hour per IP, in memory; new key source `actor` (the caller's account; method-level `@Throttle` runs after the controller's `JwtAuthGuard` + `PermissionGuard`), policy `ACCOUNT_INVITE` shared by invite and resend, per actor and per IP. Over the limit: `429 TOO_MANY_REQUESTS` + `Retry-After`, nothing written or mailed.
    - Docs: SPEC §9 Accounts row, `apps/cms-api/README.md` ("Accounts and roles", "Rate limits", "Security audit" action list), `docs/modules/access-control.md` if it lists account actions.
  - Verify: integration tests: enable (disabled active editor → active and can log in; invited-then-disabled → invited; non-disabled 409; admin vs admin 403; self 403; audit row); resend (new code sets the password, old code → `AUTH_INVALID_OTP`; active account 409; 6th code in the hour 429 with no audit row); throttle (limit + 1 → 429 + `Retry-After`; two actors keep separate counters; resend and invite share one counter).
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,access-management.constants.ts,security-audit.constants.ts}`, `apps/cms-api/src/common/{constants/limits.constants.ts,guards/throttle.guard.ts}`, `apps/cms-api/test/integration/`, `apps/cms-api/README.md`, `SPEC.md` §9

- [x] **T17c: Pagination for GET /accounts + custom role cap** · S · Deps: T17 · Q10-Q12 answered
  - Acceptance:
    - `GET /accounts?page=&pageSize=` (Q10: offset, `page` ≥ 1 default 1, `pageSize` default 20 max 100, constants in `access-management.constants.ts`) → `200 { data: Account[], meta: { page, pageSize, total } }`, ordered by id ascending, no filters or search (Q12), deleted accounts excluded from `data` and `total`. Invalid or out-of-range params → `400 ACCESS_INVALID_REQUEST`. A page past the end → empty `data`, correct `total`.
    - `GET /roles` stays a full, unpaginated list (Q11). Custom roles are capped at 50 (constant in `access-management.constants.ts`): `POST /roles` past the cap → `409 ROLE_LIMIT_REACHED`. System roles do not count.
    - The page/meta shape is written down as the project list convention (README "HTTP pipeline" or `conventions.md`) so T20 documents, T27 media and the audit-log list reuse it.
  - Verify: integration tests: 25 accounts → page 2 of size 20 holds 5 with `total` 25; `pageSize=101` and `page=0` → 400; deleted accounts not counted; the 51st custom role → 409 `ROLE_LIMIT_REACHED`.
  - Files: `apps/cms-api/src/modules/access/{accounts.controller.ts,accounts.service.ts,access-management.requests.ts,access-management.constants.ts}` (+ `roles.service.ts` for the cap), `apps/cms-api/test/integration/`, `apps/cms-api/README.md`, `SPEC.md` §9

- [x] **T18: Accounts/roles/permissions admin UI** · M · Deps: T11, T17
  - Acceptance:
    - Accounts list + invite dialog + disable; Roles list + permission matrix editor with readable/writable field pickers per content type.
    - Actions not allowed for the current actor are hidden and are also rejected server-side (verified by test).
  - Verify: Vitest for the matrix editor; Playwright: owner invites an editor, sets field permissions.
  - Files: `apps/cms-admin/src/features/access/{AccountsPage,InviteDialog,RolesPage,PermissionMatrix}.tsx`, form-commons `SelectInput`/`CheckboxInput`/`Dialog` (add to the package with tests)

- [x] **T18a: Admin UI for enable, resend invite and accounts pagination** · M · Deps: T17a, T17c, T18 · Q13 answered
  - Acceptance:
    - Accounts page: "Enable" on disabled rows and "Resend invite" on invited rows, shown only when the row is `manageable` and the caller holds the needed permission (same `caller-access` hint as T18); server rejections still surface as errors.
    - Resend shows a result message; `invitationSent: false` says the mail failed and the invitee can request a code. 429 shows a wait message using `Retry-After`.
    - Pagination controls (previous / next, "x–y of total") driven by `meta`; the page survives a refetch after an action; the page clamps back when the last row of a page goes away.
    - No confirm dialog for Enable or Resend invite (Q13); Disable keeps its confirm.
  - Verify: Vitest (`AccessPages.test.tsx`): action visibility per status/manageable, resend success + mail-failure message, 429 message, page navigation. Playwright (e2e-tester, `apps/e2e`): owner disables then enables an editor who can log in again; owner resends an invite and the new Mailpit code sets the password.
  - Files: `apps/cms-admin/src/features/access/{AccountsPage.tsx,access.api.ts,access-queries.ts,AccessPages.test.tsx}`, `apps/cms-admin/src/config/access.constants.ts`; e2e in `apps/e2e`

- [x] **T19: API tokens (API + UI)** · M · Deps: T15, T17
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

- [x] **T20: Document read API** · M · Deps: T07, T16
  - Acceptance:
    - `GET /documents/:slug` and `/:documentId` with `status`, pagination, filter and sort. Slug resolved via the registry; ABAC conditions applied as SQL; projection excludes unreadable columns.
    - `public` role reads published only; `status=draft` requires a read permission that includes drafts (reviewer/public → 403).
  - Verify: integration tests: masking per role, filter on a masked field → 400, unknown slug → 404 (§12-4 read part).
  - Files: `apps/cms-api/src/modules/documents/{documents.controller.ts,documents.query.service.ts,dto/*.ts}`

- [x] **T21: Create/update with OCC + masked 409** · M · Deps: T20
  - Acceptance:
    - `POST` creates the draft (version 1). `PUT` with `version` does `UPDATE … WHERE version = $v` plus `replaceTree` in one transaction; a mismatch → 409 with `{currentVersion, server, submitted, diff}` where `server` is serialized for the actor (§12-4 conflict part).
    - Write allowlist applied (§12-5). Richtext fields pass through `sanitizeRichtext` (stub until T24).
  - Verify: integration tests: concurrent updates, conflict body contains no unreadable raw values.
  - Files: `apps/cms-api/src/modules/documents/{documents.command.service.ts,diff.ts}`, tests

- [x] **T22: Publish/unpublish with deep clone + delete** · M · Deps: T21
  - Acceptance:
    - Publish requires `expectedVersion`; deep-clones the root + tree into the published row (replacing the existing published row) in one transaction; partial unique indexes prevent duplicates (§12-12).
    - Unpublish deletes the published row (cascade). Delete removes both rows. Every action emits activity tracking (pluggable).
  - Verify: integration tests: editing the draft doesn't change the published tree; concurrent publish → one row; stale version → 409.
  - Files: `apps/cms-api/src/modules/documents/{publish.service.ts,tree-cloner.ts}`, activity adapter in `src/infrastructure/activity/*`

- [x] **T23: Dynamic form renderer (scalar inputs)** · M · Deps: T18, T21
  - Acceptance:
    - `DynamicFormRenderer` maps field types → form-commons components through a registry. Masked fields render read-only "Protected (***)" and are excluded from the payload.
    - Repeatable components up to depth 3 with add/remove/reorder, keeping `component_uid`.
    - Adds to form-commons: `NumberInput` (bigint-safe), `TextAreaInput`, `SwitchInput`, `DatePicker`/`DateTimePicker`, `JsonInput` (each with tests).
  - Verify: Vitest render tests from the cv-page definition; Playwright create + save a cv-page draft.
  - Files: `apps/cms-admin/src/features/content/{DynamicFormRenderer,field-registry,ComponentList}.tsx`, form-commons components

- [x] **T24: Richtext with server-side sanitize** · M · Deps: T23
  - Acceptance:
    - form-commons `RichtextInput` (Tiptap). The server `sanitizeRichtext` uses a `sanitize-html` allowlist on write.
    - `<script>`, `on*` attributes and `javascript:` URLs stripped (§12-14 storage part).
  - Verify: unit tests with an XSS payload corpus; Vitest for the editor.
  - Files: `packages/form-commons/src/components/forms/RichtextInput/*`, `apps/cms-api/src/common/sanitize/richtext.sanitizer.ts`

- [x] **T25: Conflict diff/merge modal** · M · Deps: T21, T23
  - Acceptance:
    - On 409 the modal shows a field-level diff; components are matched by `component_uid` (added/removed/changed). The user picks server or client per field or component, then resubmits with `currentVersion`.
    - Masked fields aren't shown or offered.
  - Verify: unit tests for the merge reducer; Playwright two-context conflict scenario.
  - Files: `apps/cms-admin/src/features/content/{ConflictMergeModal.tsx,merge.reducer.ts}`, form-commons `DiffViewerBlock`

- [x] **T26: Presence API + banner** · S · Deps: T21
  - Acceptance:
    - `POST …/presence` requires `update` on the document and returns `{accountId, displayName, state, lastSeenAt}` only; TTL 45 s; heartbeat every 20 s via React Query; stops on unmount (D16).
  - Verify: integration test (reviewer/public → 403, expiry); Vitest for the banner.
  - Files: `apps/cms-api/src/modules/documents/{presence.service.ts,presence.controller.ts}`, `apps/cms-admin/src/features/content/PresenceBanner.tsx`

### Checkpoint 4
- [ ] Create → edit → conflict → merge → publish in cms-admin (Playwright)
- [ ] §12-4, 5, 12, 14 (storage) green; review with user

---

## Phase 5: Media

- [x] **T27: Upload pipeline + Cloudinary adapter + list** · M · Deps: T16
  - Acceptance:
    - Streaming multipart with per-type limits; `file-type` magic bytes against the allowlist; SVG/HTML → 415; sharp re-encode strips EXIF; UUIDv7 storage key; SHA-256 stored (§12-13).
    - `GET /media` paginated; reviewers only get `is_reviewer_preset = true` rows via policy (not a role string check).
  - Verify: integration tests with fixture files (polyglot, renamed html, EXIF jpeg) using a fake storage adapter.
  - Files: `apps/cms-api/src/modules/media/{media.controller.ts,upload.pipeline.ts}`, `apps/cms-api/src/infrastructure/media/{storage.port.ts,cloudinary.adapter.ts,fake.adapter.ts}`

- [x] **T28: Safe delete + purge job** · S · Deps: T27, T22
  - Acceptance:
    - `DELETE /media/:id` → 409 `MEDIA_IN_USE` if referenced by any draft or published document; otherwise soft delete plus a security audit event. A scheduled job purges soft-deleted cloud objects older than 24 h.
  - Verify: integration tests for referenced/unreferenced cases and the purge job with the fake adapter.
  - Files: `apps/cms-api/src/modules/media/{media-delete.service.ts,media-purge.job.ts}`

- [x] **T29: MediaInput + media library UI** · M · Deps: T23, T27
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

- [x] **GQ1: GraphQL schema builder + SDL print** · M · Deps: T20 · **Needs Q-G1, Q-G2, Q-G3** · api-builder · D18, §9, `docs/modules/graphql.md` "Schema"
  - Acceptance:
    - New dep `graphql` (exact pin, approved via Q-G1). `buildGraphqlSchema(definitions)` is a pure function (no Nest, no DB) producing the types, root fields, shared types, scalars (`Date`, `DateTime`, `Decimal`, `JSON`), `<Root>Page`, `<Root>Sort`/`<Root>SortField` and `<Root>Filter` inputs exactly as in the design doc; resolvers are attached later (GQ2), here fields read `values`/`components` of a `SerializedRecord`.
    - Naming per the design doc; any clash (slug vs slug, `<x>List` vs another item field, generated vs shared type name) throws a typed error naming both sources; nothing is renamed.
    - Filter inputs: one input per REST operator set; which field kinds are filterable/sortable and which operators each kind takes are read from the REST constants/table in `document-filter.ts` / `documents.constants.ts` (export them if needed), not re-declared.
    - `pnpm --filter @abyss/cms-api graphql:print-schema` writes `apps/cms-api/content/schema.graphql` from `content/schemas/*.json` (no DB); `-- --check` exits 1 when the file is stale. The committed SDL is generated, never hand-edited.
  - Verify: unit tests: SDL for `cv-page` + `profile` equals the committed `content/schema.graphql`; every field type maps as in the table; masked-capable content fields are nullable; repeatable component = nullable list; clash cases throw; `single` type gets only the item field. `graphql:print-schema -- --check` passes.
  - Files: `apps/cms-api/src/modules/graphql/{graphql.constants.ts,schema/schema.builder.ts,schema/type-names.ts,schema/scalars.ts,schema/filter-inputs.ts,cli/print-schema.ts}`, specs, `apps/cms-api/content/schema.graphql`, `apps/cms-api/package.json` (dep + script)

- [x] **GQ2: GraphQL endpoint + resolvers over the document read path** · M · Deps: GQ1 · api-builder · D18, D3, D5, §12-19
  - Acceptance:
    - `POST /api/v1/graphql` (`API_ROUTES.GRAPHQL`) in `GraphqlModule`: `DocumentAuthGuard` + `DOCUMENT_READ_ANONYMOUS` throttle; JSON body `{ query, variables?, operationName? }` only (array/batch, missing query → 400; non-JSON → 415); parse → validate → execute with graphql-js; `Cache-Control: no-store`.
    - Root resolvers convert args to `ListDocumentsQuery` (`FilterClause` per operator, values stringified, `SortKey`) or `(documentId, status)` and call `DocumentsQueryService.list`/`get` unchanged (`DocumentsModule` exports it). Item not found/hidden → `null`, no error. `single` types resolve through `list` with `pageSize` 1.
    - `ContentTypeVisibilityRule(actor)`: a root field for a type the actor cannot `read` (incl. token scope) fails validation with the same message and code as an unknown field.
    - Error format per the design doc (`extensions { code, details?, requestId }`; 400 for parse/validation, 200 after execution; Nest `HttpException`s from the service map to their `errorCode`; unknown errors → generic `INTERNAL_SERVER_ERROR`, logged with request id). New codes in `ERROR_CODES`. Variables are never logged or echoed.
    - Architecture test: `src/modules/graphql/**` imports none of `content.repository`, `tree-loader`, `field-projection`, `kysely`.
  - Verify: integration tests (`test/integration/graphql.spec.ts`, Testcontainers): for anonymous, an editor JWT and an API token, `cvPageList`/`cvPage` data equals the REST `GET /documents/cv-page` record re-shaped (same masked values and `_maskedFields`); filter on a masked field → `FIELD_NOT_READABLE`; `status: DRAFT` anonymous → `FORBIDDEN`; hidden type error equals unknown-field error; row conditions hide rows (null item, `total` excludes them); invalid Bearer → 401 REST shape; anonymous 121st request → 429; token creator lost `read` → hidden.
  - Files: `apps/cms-api/src/modules/graphql/{graphql.module.ts,graphql.controller.ts,graphql.executor.ts,document.resolvers.ts,rules/visibility.rule.ts,error-format.ts}`, `apps/cms-api/src/modules/documents/documents.module.ts` (export), `apps/cms-api/src/app.module.ts`, `apps/cms-api/src/common/constants/*` (route, error codes), test file

- [x] **GQ3: GraphQL limits + production hardening + docs** · S · Deps: GQ2 · **Needs Q-G4, Q-G5** · api-builder · D18, D17
  - Acceptance:
    - `GRAPHQL_LIMITS` (named constants, values per Q-G4): body bytes (413 REST shape), parser `maxTokens`, `MaxDepthRule`, `MaxRootFieldsRule` (aliases count), `MaxFieldNodesRule` (after fragment expansion); over-limit → 400 `GRAPHQL_LIMIT_EXCEEDED` before any SQL runs.
    - `NODE_ENV=production`: `NoSchemaIntrospectionCustomRule` on, "Did you mean" suggestions stripped from every message; no playground in any environment.
    - Docs: `apps/cms-api/README.md` gains "GraphQL (D18)" (endpoint, auth, limits, errors, SDL script); `docs/modules/graphql.md` status → accepted with the final values; `apps/cms-api/.env.example` unchanged (no new env).
  - Verify: unit tests per rule (at limit passes, limit + 1 fails, fragments and aliases counted); integration: the full cv-page web query passes all limits; introspection refused and suggestions absent with production config, allowed in test config; a query that exceeds a limit issues no SQL (Kysely query log count 0).
  - Files: `apps/cms-api/src/modules/graphql/{rules/limits.rules.ts,graphql.executor.ts,graphql.constants.ts}`, specs, `apps/cms-api/README.md`, `docs/modules/graphql.md`

- [x] **T30a: Migrate apps/web to Next.js (skeleton parity)** · M · Deps: T04 · Q-W1..Q-W9 answered · ui-builder · §3, §5, D14, D17
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

- [x] **T30b: Smoke stack + script for the Next.js web** · S · Deps: T30a · ui-builder, root files approved at dispatch (Q-W10) · §12-17, D17
  - Acceptance:
    - `docker-compose.smoke.yml` `web` service: build arg `NEXT_PUBLIC_API_BASE_URL: /api/v1`; runtime env `API_INTERNAL_URL: http://cms-api:3000/api/v1`, `WEB_REVALIDATE_SECONDS` (smoke value per Q-W3), `WEB_PORT`; healthcheck on `/`; `depends_on` cms-api healthy; Traefik `loadbalancer.server.port` = `WEB_PORT`. The `/api` router keeps priority over the web router (no StripPrefix).
    - `scripts/smoke.sh`: replace the SPA-fallback assertion with: `/` → 200 HTML; an unknown path → 404 (never 3xx); a page path with a trailing slash → 308 with a relative `Location` (never an absolute `http://<container>` URL); `/_next/static/*` asset → `Cache-Control` immutable; the existing `/api` assertions (trailing-slash POST not 3xx, CORS) still pass.
  - Verify: `pnpm smoke` green (one agent at a time on the shared stack).
  - Files: `docker-compose.smoke.yml`, `scripts/smoke.sh`

- [ ] **T30: Web CV showcase (Server Components, GraphQL)** — skipped by user (archive) · M · Deps: T30b, GQ2, T24, T03 · **Needs Q-G6, Q-G7** (Q5, Q-W3, Q-W6 answered) · ui-builder (+ e2e-tester for Playwright) · §3, §5, D13, D18, §12-4, §12-14
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

- [x] **T31: Reviewer backend** · M · Deps: T17, T27 · **Needs Q4**
  - Acceptance:
    - `PUT /reviewer/settings` (owner) stored in `app_settings`, and toggling bumps the reviewer role's `policy_version` (off → existing sessions 401 on the next request).
    - `POST /reviewer/sessions`: Turnstile verified server-side, 1 per IP per 10 min, global cap 200, ip stored as HMAC, notes ≤ 500 chars as plain text. Creates an ephemeral `reviewer` account + tokens (24 h).
    - Cleanup job deletes expired reviewer accounts (FKs SET NULL); `GET /reviewer/sessions` is owner-only.
  - Verify: integration tests (§12-3 API part, toggle-off revocation, caps).
  - Files: `apps/cms-api/src/modules/reviewer/{reviewer.controller.ts,reviewer.service.ts,reviewer-cleanup.job.ts}`, `apps/cms-api/src/infrastructure/turnstile/turnstile.client.ts`

- [x] **T32: Reviewer UX (web + admin) + owner log** · M · Deps: T31, T30, T33, T18 · **Needs Q6** · ui-builder (+ e2e-tester) · §12-3
  - Acceptance:
    - The web "Reviewer access" multi-step dialog (role → purposes → notes + Turnstile, no PII) is a client component (form-commons + react-hook-form) that starts a session from the browser; the reviewer access token stays in browser memory (same session holder as T33), and the reviewer view re-fetches the `CvView` GraphQL query (browser, Bearer reviewer token) with reviewer permissions. The Next server never sees the reviewer token.
    - The Turnstile widget loads only inside the dialog, via `next/script` with the request nonce; the T36 web CSP allows the Turnstile origin in `script-src`/`frame-src` (named constant, not a literal).
    - cms-admin in reviewer mode: read-only banner, write actions hidden (and 403 server-side); owner "Reviewer sessions" page with notes rendered as text.
  - Verify: Playwright full reviewer flow (§12-3 end to end) starting on web, including draft → 403 and write → 403; no CSP violation in the console during the dialog.
  - Files: `apps/web/src/features/reviewer/{ReviewerAccessDialog.tsx,reviewer.api.ts}`, `apps/cms-admin/src/features/reviewer/{ReviewerBanner,ReviewerSessionsPage}.tsx`

- [x] **T33: Web login + session sharing with admin** · S · Deps: T13, T30, GQ2 · ui-builder (+ e2e-tester) · §6 (refresh cookie, origins), D14
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

- [x] **T34: Bulk API** · M · Deps: T22
  - Acceptance:
    - `bulk/create|publish|unpublish|delete` for `kind = collection` only (single → 400); ≤ 50 items, ≤ 200 component rows per item, body ≤ 1 MB.
    - Policy, ABAC and write allowlist per item; `atomic: true` = one transaction, `false` = savepoint per item with per-item results.
    - Batched inserts per level (root, then each component table) using `RETURNING id`.
  - Verify: integration tests: limits, partial vs atomic, per-item 403, query count.
  - Files: `apps/cms-api/src/modules/documents/{bulk.controller.ts,bulk.service.ts}`

- [x] **T35: Bulk UI** · M · Deps: T34, T23
  - Acceptance:
    - form-commons `SortableSheet`, `TablePagination`, `BulkActionBar`; the collection list page selects rows → bulk publish/unpublish/delete with a result summary; bulk create via `JsonInput` import with validation errors per item.
  - Verify: Vitest; Playwright select 5 → publish.
  - Files: `packages/form-commons/src/components/forms/{Sheet,Pagination,Blocks/BulkActionBar}/*`, `apps/cms-admin/src/features/content/{CollectionListPage,BulkCreateDialog}.tsx`

### Checkpoint 7
- [ ] Bulk flows green; review with user

---

## Phase 8: Hardening & deploy docs

- [x] **T36: Security headers + prod config audit** · M · Deps: T04, T33, T32, GQ3 · **Needs Q-W4** (style-src) · ui-builder (web, admin) + api-builder (cms-api) · D17, D18
  - Acceptance:
    - cms-admin nginx sends CSP (`script-src 'self'`; `connect-src` from env; `img-src` includes Cloudinary), HSTS, nosniff and Referrer-Policy.
    - Web (Next.js): `src/proxy.ts` generates a per-request nonce and sends CSP `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ Turnstile origin), `style-src` per Q-W4, `connect-src` from env, `img-src` includes Cloudinary, `frame-ancestors 'none'`; HSTS, nosniff, Referrer-Policy and `poweredByHeader: false` from `next.config.ts` `headers()`. Every page is dynamically rendered (nonce needs a request); the data cache from T30 still limits calls to cms-api. `/_next/static` is excluded from the proxy matcher.
    - The API sends `default-src 'none'` and no `X-Powered-By` on every route including `POST /graphql`; no duplicate CSP from Traefik. Web `connect-src` covers the browser GraphQL calls (same origin `/api/v1/graphql`).
    - A checklist script asserts prod config refinements and headers against the smoke stack (web: a fresh nonce per response and no `X-Powered-By`).
  - Verify: `pnpm smoke` extended with header assertions; Playwright: web CV, login and reviewer dialog show no CSP violations in the console.
  - Files: `apps/web/{src/proxy.ts,next.config.ts}`, `apps/cms-admin/nginx.conf`, `apps/cms-api/src/main.ts`, `scripts/smoke.sh`

- [x] **T37: Playwright suite consolidation + CI** · split 2026-10-22 (REPLAN) into T37a-T37g below; T37b/T37e re-scoped and T37f added the same day after the user's "T37 correction" (handoff.md): docker-compose is local-test only and never runs in CI; production and CI use one image per service. REPLAN 2026-10-22 (second, user decision in handoff.md): e2e does NOT run in GitHub CI; it stays local only (`SMOKE_E2E=1 pnpm smoke`, `pnpm e2e:spec`). T37f is removed from the plan (it was already built @ a2897da, so T37g undoes its CI wiring); T37e publish is gated on the app's CI checks only (lint, typecheck, unit tests, build), not on e2e. Q-T37-8 and Q-T37-10 are resolved by this decision (Q-T37-9: one cms-api image, answered). User answers: handoff.md "T37 answers" (CI from `.github_template/`; cms-api = init container + main container; verified locally, the user pushes; core-builder owns `.github/`). Template map: `.github_template/workflows/*.yml` -> `.github/workflows/`, `.github_template/scripts/*.sh` -> `.github/scripts/` (the template workflows call `.github/scripts/...`); template app `frontend` = our `apps/web`; `tooling.test.sh` belongs to another repo (Storybook, eslint-config, `.vscode`) and is not carried over.

- [x] **T37a: cms-api init container command (deploy migrate)** · S · Deps: T36 · core-builder · **Needs Q-T37-1, Q-T37-2** · Security gate: yes (every deploy and T37b/T37e/T38 build on it) · SPEC §4, D10, D17
  - Acceptance:
    - One command for the init container, run from the existing cms-api runtime image (same image, different command; no second Dockerfile): `npm run deploy:migrate` runs `db:migrate` (Prisma `migrate deploy` + role seed) then `content:migrate` (apply committed `content/migrations/*.sql`), in that order, stops at the first failure with a non-zero exit, and is idempotent (second run: "No pending migrations" + "No pending content migrations", exit 0). It never runs `content:generate` (no schema parsing/merging at deploy time, per Q-T37-1 recommended answer) and never runs `owner:bootstrap`.
    - Main container command stays `node dist/main.js` and runs no migrations.
    - `apps/cms-api/Dockerfile` runtime stage uses a numeric non-root user (`USER 1000:1000`, the `node` user of the base image) so `.github/scripts/image-user.sh` passes.
    - Smoke compose: a `cms-api-init` service (cms-api image, command `npm run --silent deploy:migrate`, same DB env) and `cms-api` `depends_on: cms-api-init: condition: service_completed_successfully`; `scripts/smoke.sh` asserts the init service exited 0 and its log holds the applied/seeded lines, and keeps the "again has nothing pending" assertions (run inside the image).
    - `apps/cms-api/README.md` documents the two-container contract (init command, order, idempotency, exit codes, required env).
  - Verify: `pnpm --filter @abyss/cms-api test:unit`; `docker build -f apps/cms-api/Dockerfile -t cms-api:ci . && bash .github_template/scripts/image-user.sh cms-api:ci`; `SMOKE_E2E=1 pnpm smoke` passes.
  - Files: `apps/cms-api/package.json`, `apps/cms-api/Dockerfile`, `apps/cms-api/README.md`, `docker-compose.smoke.yml`, `scripts/smoke.sh` (root files outside core-builder scope; assigned to core-builder for this task)

- [x] **T37b: CI checks + build from the template (no compose, no e2e)** · M · Deps: T37a · core-builder · Q-T37-3, Q-T37-4, Q-T37-5 answered (handoff.md) · REPLAN 2026-10-22 per "T37 correction" (compose is local-only; e2e moved to T37f, later removed from CI entirely: see T37g) · SPEC §11, §12
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

- [x] **T37c: web image numeric non-root user** · XS · Deps: none · ui-builder · SPEC D17
  - Acceptance: `apps/web/Dockerfile` runtime uses `USER 1000:1000` (was `USER node`); `apps/cms-admin` runtime still runs as the nginx-unprivileged numeric UID; both pass `image-user.sh`.
  - Verify: `docker build` each image, then `bash .github_template/scripts/image-user.sh <image>` for web and cms-admin; `SMOKE_E2E=1 pnpm smoke` passes.
  - Files: `apps/web/Dockerfile` (cms-admin only if the guard fails)

- [x] **T37d: Playwright suite consolidation + success-criteria map** · M · Deps: T35, T36 · qc · SPEC §11, §12
  - Acceptance:
    - Every §12 criterion maps to a test id (Playwright spec + title, or Jest file + test) in `docs/modules/success-criteria.md`; gaps are listed, not hidden.
    - Known flakes fixed or quarantined with a reason: `media-attach.spec.ts` 'uploading in the field attaches...'; `web-session.spec` made independent of `two-factor.spec` state.
    - T35 'select 5 -> publish' spec added; `apps/e2e/README.md` lists the content specs.
    - CI reporter (`github` reporter when `CI` is set; already in the working tree) kept.
  - Verify: `SMOKE_E2E=1 pnpm smoke` passes twice in a row with no retries needed.
  - Files: `apps/e2e/**`, `docs/modules/success-criteria.md`

- [x] **T37e: Image publish + deploy bump from the template** · M · Deps: T37a, T37b, T37c · core-builder · Q-T37-5, Q-T37-6, Q-T37-7, Q-T37-9 answered; Q-T37-8 resolved by the user decision "no e2e in CI" (publish is not gated on e2e) · Security gate: yes (registry credentials, deploy-repo token, `packages: write`) · REPLAN 2026-10-22: no compose anywhere; second REPLAN 2026-10-22: no e2e gate (built @ 612da2b with the e2e gate; T37g changes the gate) · SPEC D17
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

- [x] **T37g: Remove e2e from CI; publish gated on the app's CI checks only** · S · Deps: none (T37e @ 612da2b and T37f @ a2897da are committed) · core-builder · Security gate: yes (changes the condition that lets `publish-<app>` push images with `packages: write` and bump the deploy repo) · **Needs Q-T37-12** (delete `scripts/e2e-stack.sh`?; builder follows the recommended answer, deletions wait for user approval) · REPLAN 2026-10-22, user decision in handoff.md · SPEC §11, §13 (CI/deploy changes), D17
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

- [x] **T38: Deployment guide for the deploy repo** · S · Deps: T36, T37a
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

- [x] **D3: Build `@abyss/base-config` to `dist/` and export from dist** · S · Deps: D2 (done) · core-builder · Supersedes D2's Q-BC4 contract (user decision 2026-10-22, handoff.md "Base config" last line) · **Needs Q-D3-1, Q-D3-2** (builder follows the recommended answers until answered) · SPEC §5 (tree), §10 (code style)
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

## Ad-hoc: Owner setup

User decision 2026-10-22 (handoff.md, "Owner creation on k3s"): a one-time setup page, open only while no owner exists, guarded by a setup token from the k8s Secret; `owner:bootstrap` stays as the fallback. Design: `docs/modules/owner-setup.md`; decision: `docs/adr/0005-one-time-owner-setup-route.md`; spec: SPEC §1, D1, D15, D17, §9, §12-1, Q2 (amended 2026-10-22). Build order: OS1 -> OS2 and OS3 (parallel) -> OS4. **Needs Q-OS1..Q-OS4** (SPEC §14; builders follow the recommended answers until answered).

- [x] **OS1: Owner setup API (`/setup/status`, `/setup/owner`) + shared bootstrap audit** · M · Deps: none · core-builder · **Risk high (identity module) · Security gate: yes** (security-qc before OS2/OS3 build on it) · **Needs Q-OS1, Q-OS2, Q-OS3** · SPEC D1, D15, D17, §9, §12-1 · Design: `docs/modules/owner-setup.md` (API, Setup token, Rate limits, Audit, Code changes)
  - Acceptance:
    - Config: optional `OWNER_SETUP_TOKEN` in `env.schema.ts` / `app-config.ts`; with `NODE_ENV=production` and the key set, a value under `MIN_SECRET_BYTES` fails boot; empty string = unset; boot summary shows `[redacted]` when set. Not added to `SECRET_ENV_KEYS` (not required). `.env.example` documents it (how to generate, remove after setup).
    - `bootstrapOwner(prisma, input, options?)` writes `owner.created` (`{ channel: 'setup_page' | 'cli' }`, actor = the new owner) inside its transaction; the `owner:bootstrap` CLI passes `channel: 'cli'`. Existing error codes and CLI behaviour unchanged.
    - `GET /api/v1/setup/status` -> `200 { open }`, `Cache-Control: no-store`; `open` is true only while the token is configured and no live owner exists. Throttle `SETUP_STATUS` (`setup-status:ip`, 30/min).
    - `POST /api/v1/setup/owner` in the documented order: throttle `SETUP_SUBMIT` (`setup-submit:ip`, 5 / 15 min) -> closed (no token configured, latch set, or owner exists) -> `404 NOT_FOUND` with the same body as an unknown route -> token check (string <= `SETUP_TOKEN_MAX_LENGTH`, SHA-256 digests compared with `crypto.timingSafeEqual`) -> `401 SETUP_TOKEN_INVALID` -> body validation (same rules as `parseOwnerInput`) -> `400` naming fields only -> `bootstrapOwner(..., { channel: 'setup_page' })` -> `201 { email }`. `OWNER_EXISTS` -> 404 and latch; `EMAIL_TAKEN` -> `409 OWNER_EMAIL_TAKEN`; `ROLE_MISSING` -> 503. No cookie, no access token in any answer.
    - Wrong token never runs Argon2 (unit test with a spy on the hasher) and never parses the rest of the body.
    - In-process latch: after an owner is seen or created, no further owner `SELECT` per request (unit test).
    - `owner.setup_rejected` (`recordStandalone`, anonymous, `{ reason: 'bad_token' | 'closed' }`) on a wrong token, and on a closed submit that carries a non-empty `setupToken`; no row for a closed submit without one. No audit row, log line or error body contains the token, the password or the submitted email.
    - Boot (and post-setup) warning `OWNER_SETUP_TOKEN is set but an owner exists; remove it from the secret.` when both hold; never prints the value.
    - New constants only (no literals): `API_ROUTES.SETUP`, `ERROR_CODES.SETUP_TOKEN_INVALID` / `OWNER_EMAIL_TAKEN`, `RATE_LIMIT_POLICIES.SETUP_STATUS` / `SETUP_SUBMIT`, `AUDIT_ACTIONS.OWNER_CREATED` / `OWNER_SETUP_REJECTED`, `SETUP_TOKEN_MAX_LENGTH`, setup channels.
    - Docs: `apps/cms-api/README.md` gets an "Owner setup" section (route, token, close + rotate, CLI fallback); `docs/modules/success-criteria.md` row for §12-1 updated if it lists one.
  - Verify:
    - Unit: `setup-token.ts` (equal, different, different length, non-string, over-length), service latch and error mapping, config (production short token fails, unset ok, redaction).
    - Integration (Testcontainers): status open/closed (no token configured; token + no owner; owner exists); submit with no token configured -> 404; wrong token -> 401 + `owner.setup_rejected` row; valid -> 201, account active with role owner, `owner.created` row with `channel: 'setup_page'`; second valid submit -> 404; CLI after setup -> `owner.exists`; setup after CLI -> 404; concurrent: 5 parallel valid submits + 1 `bootstrapOwner` CLI call -> exactly one owner, the rest 404 / `owner.exists`; existing non-owner email -> 409 and the account is not promoted; 6th submit from one IP in the window -> 429; no `Set-Cookie` and no `accessToken` on 201; X-Forwarded-For spoof does not change the throttle key (D7).
    - Existing `owner-bootstrap.spec.ts` and CLI tests still pass; the CLI writes `owner.created` with `channel: 'cli'`.
    - `pnpm --filter @abyss/cms-api test:unit`, `test:integration`, `pnpm --filter @abyss/cms-api lint`, `typecheck`; Prettier on changed files.
  - Files: `apps/cms-api/src/modules/identity/{owner-setup.controller.ts,owner-setup.service.ts,owner-setup.requests.ts,setup-token.ts,owner-bootstrap.ts,identity.constants.ts,identity.module.ts,cli/owner-bootstrap.ts}` + specs, `apps/cms-api/src/modules/access/security-audit.constants.ts`, `apps/cms-api/src/common/constants/{api.constants.ts,error.constants.ts,limits.constants.ts}`, `apps/cms-api/src/config/{env.schema.ts,app-config.ts,config.constants.ts}` + spec, `apps/cms-api/test/integration/owner-setup.*`, `apps/cms-api/.env.example`, `apps/cms-api/README.md`, `docs/modules/success-criteria.md`.

- [x] **OS2: Admin owner setup page + login notice** · M · Deps: OS1 (security pass) · ui-builder · **Risk high (`apps/cms-admin/src/features/auth`) · Security gate: yes** · **Needs Q-OS1, Q-OS2** · SPEC D1, §9 · Design: `docs/modules/owner-setup.md` (Admin console)
  - Acceptance:
    - `APP_ROUTES.SETUP = '/setup'`, public route outside `ProtectedRoute`, `AuthPageLayout`.
    - `setup.api.ts`: `getSetupStatus()`, `createOwner()`; query key `['setup','status']`.
    - Login page: when status `open`, an info notice "This console has no owner yet." with a primary link-button "Set up the owner account" to `/setup`; nothing extra when closed or when the status call fails.
    - `OwnerSetupPage`: status closed -> redirect to `/login` (replace); fields Setup token (password type, `autocomplete="off"`), Email, Display name (optional), Password (min 12 hint), Repeat password (client-side match only, not sent); submit "Create owner account" with loading state.
    - Error mapping: 401 -> token field error; 400 -> field errors from `details`; 409 -> email field error; 404 -> `/login` with "Setup is already complete. Sign in."; 429 -> form alert; other -> generic alert.
    - Success: form state cleared, status query invalidated, navigate to `/login` with the notice "Owner account created. Sign in, then turn on two-factor in Security settings." and the email prefilled.
    - The token is never read from or written to the URL, local/session storage or the Redux store.
    - Copy and styling follow the `ui-direction` skill; labels tied to inputs, errors announced (`aria-describedby` / `role="alert"` as in the other auth pages).
    - `apps/cms-admin/README.md` lists the `/setup` route.
  - Verify:
    - Vitest: status open shows the login notice, closed hides it, error hides it; setup page redirects when closed; mismatch of repeat password blocks submit; each error mapping above; success navigates with notice and email; the request body has no `repeatPassword`; the token is not in `window.location` after submit.
    - `pnpm --filter @abyss/cms-admin test`, `lint`, `typecheck`, `build`; Prettier on changed files.
    - Browser (qc, in OS4).
  - Files: `apps/cms-admin/src/config/routes.ts`, `apps/cms-admin/src/app/App.tsx`, `apps/cms-admin/src/features/auth/{setup.api.ts,OwnerSetupPage.tsx,OwnerSetupPage.test.tsx,setup-error.ts,setup-error.test.ts,LoginPage.tsx,LoginPage.test.tsx,login-notice.ts}`, `apps/cms-admin/README.md`.

- [x] **OS3: Smoke stack creates the owner through the setup route; deploy and local docs** · S · Deps: OS1 (security pass) · core-builder (also assigned `docs/deployment/*.md` and `docs/local-run.md` for this task) · **Needs Q-OS4** · SPEC D1, §12-1
  - Acceptance:
    - `scripts/stack/cms-api.env` sets a test `OWNER_SETUP_TOKEN` (clearly a test value, >= 32 bytes so a production-mode boot would also accept it).
    - `scripts/smoke.sh` (and `scripts/lib/stack-seed.sh` if it creates the owner) creates the owner with curl against `POST /api/v1/setup/owner`, asserting first: status `open: true`; wrong token -> 401; then valid -> 201; then status `open: false`; second submit -> 404; then `owner:bootstrap` refuses (existing "refuses a second owner" check). Same email/password as today, so the e2e owner login is unchanged. The token never appears in smoke output.
    - `docs/deployment/k3s-traefik.md` "First install: the owner": setup page as the primary path (generate token, add to the SOPS Secret, roll out, open `admin.<domain>/setup`, create owner, remove the token, restart), CLI as fallback; `docs/deployment/k3s-secrets-sops.md` lists `OWNER_SETUP_TOKEN` (secret, optional, remove after setup, rotate by replacing + restart); `docs/local-run.md` mentions both ways.
  - Verify:
    - `SMOKE_E2E=1 pnpm smoke` passes (all existing e2e green; the new setup assertions print pass).
    - `grep -rn "<the test token>" scripts/ docker-compose.smoke.yml` shows it only in `scripts/stack/cms-api.env`; smoke log has no token value.
    - Prettier on changed docs.
  - Files: `scripts/stack/cms-api.env`, `scripts/smoke.sh`, `scripts/lib/stack-seed.sh`, `docs/deployment/k3s-traefik.md`, `docs/deployment/k3s-secrets-sops.md`, `docs/local-run.md`.

- [x] **OS4: e2e and browser check of the owner setup** · S · Deps: OS2, OS3 · qc · SPEC §12-1
  - Acceptance:
    - `apps/e2e/tests/owner-setup.spec.ts` (closed state on the smoke stack, where the owner exists): `/setup` redirects to `/login`; the login page shows no setup notice; `POST /api/v1/setup/owner` with any token -> 404.
    - Browser check of the open state on a fresh database (cms-api `start` per `docs/local-run.md` with `OWNER_SETUP_TOKEN` set and no owner, cms-admin dev): login notice visible; wrong token shows the token error; valid submit lands on `/login` with the notice and prefilled email; owner signs in; `/setup` then redirects; no console errors or CSP violations; the token is not in the URL or storage (DevTools Application tab).
  - Verify: `pnpm e2e:spec tests/owner-setup.spec.ts` on a kept smoke stack; full `SMOKE_E2E=1 pnpm smoke` green; browser check notes in the unit record.
  - Files: `apps/e2e/tests/owner-setup.spec.ts`.

## Ad-hoc: Audit

User request 2026-10-23: audit the whole repo against `code-standards` §4. Criteria: C1 isolated modules (one owner per responsibility, no feature spread over several modules), C2 readable names over comments, C3 extensible with minimal impact. User answers (2026-10-23):
- Q1: findings become behavior-preserving refactors only through approved tasks, one module per task.
- Q2: qc runs the audit; security-qc reviews proposed fixes on high-risk paths.
- Q3: no new dependency; boundaries are guarded by architecture spec tests plus ESLint `no-restricted-imports`.
- Q4: comments keep SPEC IDs (`Dxx`, `§n`); task IDs (`Txx`, `OSx`, ...) are findings.
- Q5: state files fixed first (AU0, done by the manager); the SPEC §2 capability-map update (G6) is decided in AU6.

Build order: AU1a -> AU1b -> AU1c -> AU2 -> AU3 -> AU4 -> AU5 -> AU6. AU1a-AU5 have no deps on each other. The order lets later areas reuse earlier findings.

### Audit run rules (every AU1a-AU5 task)
- Read-only. No edits to product code, tests, configs, lockfile or dependencies. Probes are grep / `tsc` / node scripts kept in the session scratchpad, never in the repo. No dependency-cruiser, madge or similar (Q3).
- Output: one file, `.claude/state/findings/AUDIT-<area>.md` (area = `AU1a`, `AU1b`, ...). Each finding:
  - `ID` (`AUD-<area>-<n>`) · `Check` (C1.x / C2.x / C3.x) · `Evidence` (path:line, several allowed)
  - `Impact`: which future change it makes expensive, or which rule it breaks
  - `Proposed fix`: behavior-preserving, owned by one module
  - `Guard`: the architecture spec or `no-restricted-imports` rule that would stop it coming back (required for C1 findings)
  - `Size` S/M/L · `Owning module` · `Builder scope` · `High-risk path` y/n
- Also list counts per check (including zero) so AU6 can tell "checked, nothing found" from "not checked".
- security-qc (where the task says so): reviews only the proposed fixes on high-risk paths. The question is whether the refactor would move or weaken a guard, the serializer, masking, an audit write, a token or session check. It appends `Security note:` lines under each such finding in the same file. It does not run a new security review.
- Out of scope: behavior changes, new security findings outside the proposed fixes, visual/UI review, performance.
- Early signals from the planning probes (starting points to confirm, not findings): identity <-> access cycle in cms-api; auth <-> access cycle in cms-admin features; auth <-> reviewer cycle in web features; no module facades (about 130 cross-module deep imports in cms-api, e.g. media and reviewer import `identity/auth.controller`, media imports `content-engine/sql-generator`); field-kind handling spread over content-engine, access, documents, media and graphql; `apps/cms-admin/src/config/copy.constants.ts` 962 lines; 21 source files over 300 lines.

### Audit checks
C1 Isolation:
- C1.1 Import graph between modules or features; list every cycle.
- C1.2 Deep imports into another module's internal files. For each pair, list the exports the owner would expose as its public interface.
- C1.3 Dependencies against SPEC §2 capability map direction (e.g. access -> content-engine; `content-types` missing from the map).
- C1.4 One capability spread over several modules (field types, audit-event writes, session/token handling, auth/access splits).
- C1.5 The same rule written twice (API vs frontend validation where SPEC §10 says Zod schemas are shared; constants; env parsing).
- C1.6 Code in the wrong place: one module's code in `common/` / shared folders, or shared code inside one module.

C2 Readability:
- C2.1 Vague names (`data`, `tmp`, `res`, `result`, `item`, `info`, `handle`, `helper`, `utils`), in identifiers and file names.
- C2.2 Booleans read as questions (`is/has/can/should`); functions start with a verb; units in names where they matter (`Ms`, `Seconds`, `Bytes`).
- C2.3 Comments that say *what* the code does (fix: rename or extract); task IDs in comments (Q4). Keep *why* comments and public doc comments.
- C2.4 Files over 300 lines, functions over about 40 lines, or mixed abstraction levels. Propose an extract only where a clear sub-responsibility exists.
- C2.5 File naming per SPEC §5 (kebab-case, `.constants.ts`, PascalCase components, framework route names).

C3 Extensibility:
- C3.1 Change-impact drills. For each drill: files and modules touched today, and the target after the fix.
  - a: new content field type
  - b: new content type (target: JSON schema + generated output only)
  - c: new permission action or role
  - d: new security-audit event
  - e: new provider (mail, media, activity, turnstile)
  - f: new admin feature page (route, nav, endpoints, copy)
  - g: new env key (config, `.env.example`, smoke, docs)
  - h: new form-commons input
- C3.2 `if`/`switch` chains on a kind or type spread across modules, instead of one registry in the owning module.
- C3.3 Consumers depending on a concrete adapter where a second implementation is realistic, instead of a port / injection token.
- C3.4 Central files every feature must edit (`copy.constants.ts`, `endpoints.ts`, `API_ROUTES`, `routes.ts`): split per feature or keep, with the reason.
- C3.5 Contracts consumed by the frontends (DTOs, shared types) can change additively.

- [x] **AU1a: Audit cms-api identity, access, reviewer, media** · M · Deps: AU0 (manager, done) · qc, then security-qc · **High-risk paths (read-only) · Security gate: yes** (security-qc notes before AU6 plans fixes) · code-standards §4 · SPEC §2, §7, §10
  - Scope: `apps/cms-api/src/modules/{identity,access,reviewer,media}` (not specs except to understand intent).
  - Checks: C1.1-C1.6, C2.1-C2.5, C3.1 a/c/d, C3.2, C3.3 (media adapter), C3.5.
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU1a.md` follows the audit run rules, including counts per check.
    - The identity <-> access cycle is confirmed or refuted, with every edge listed (file -> file) and a proposed public interface for each side.
    - Each C3.1 drill (a, c, d) lists the files touched today.
    - security-qc has added `Security note:` lines under every finding that touches these paths.
    - No file outside `.claude/state/findings/` changed.
  - Verify: `git status --short` shows only the findings file; the findings file has an entry or a zero count for every check listed.
  - Files: `.claude/state/findings/AUDIT-AU1a.md` (write); the scope above (read-only).

- [x] **AU1b: Audit cms-api content-engine, content-types, documents, graphql** · M · Deps: AU0 · qc · code-standards §4 · SPEC §2, §8, D10, D18
  - Scope: `apps/cms-api/src/modules/{content-engine,content-types,documents,graphql}`, `apps/cms-api/content/` layout (read-only).
  - Checks: C1.1-C1.6, C2.1-C2.5, C3.1 a/b, C3.2, C3.5.
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU1b.md` follows the audit run rules.
    - Drill a (new field type) lists every file in every module that knows about field kinds, and proposes one owner (expected: content-engine) and a registry shape.
    - Drill b confirms whether a new content type needs any hand-written code.
    - C1.3 states whether `content-types` is its own module or belongs to another one (input for the G6 SPEC decision).
    - The existing `graphql.architecture.spec.ts` guard is noted as the pattern for new guards.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU1b.md` (write); the scope above (read-only).

- [x] **AU1c: Audit cms-api common, config, infrastructure** · S · Deps: AU0 · qc, security-qc for `infrastructure/media` and `infrastructure/turnstile` · **High-risk paths (read-only) · Security gate: yes** · code-standards §2, §4 · SPEC §5, §10
  - Scope: `apps/cms-api/src/{common,config,infrastructure}`, `apps/cms-api/src/app.module.ts` and `main.ts` (read-only). Not `src/generated/`.
  - Checks: C1.5, C1.6, C2.1-C2.5, C3.1 e/g, C3.3, C3.4 (`API_ROUTES`, `common/constants/*`).
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU1c.md` follows the audit run rules.
    - Each adapter (mail, media, activity, turnstile) shows whether consumers depend on a port/token or the concrete class.
    - C1.6 lists every `common/` file that only one module uses, and every module constant that `common/` imports.
    - security-qc notes are added for proposed fixes under `infrastructure/media` and `infrastructure/turnstile`.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU1c.md` (write); the scope above (read-only).

- [x] **AU2: Audit cms-admin** · M · Deps: AU0 · qc, security-qc for `features/auth` and `features/security` · **High-risk paths (read-only) · Security gate: yes** · code-standards §4 · SPEC §5, §10
  - Scope: `apps/cms-admin/src` (app, components, config, features, lib) (read-only).
  - Checks: C1.1-C1.6, C2.1-C2.5, C3.1 f, C3.2, C3.4 (`copy.constants.ts`, `endpoints.ts`, `routes.ts`).
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU2.md` follows the audit run rules.
    - The `features/auth` <-> `features/access` cycle is confirmed or refuted with the edges, plus a proposed owner for each shared piece (e.g. session, permission checks).
    - Drill f lists every file a new feature page touches today.
    - C3.4 gives a keep-or-split proposal for `copy.constants.ts` and `src/config`, with the reason.
    - C1.5 compares admin form validation with the API DTO schemas.
    - `features/content/field-registry.tsx` is checked as the C3.2 reference.
    - security-qc notes are added for fixes under `features/auth` and `features/security`.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU2.md` (write); the scope above (read-only).

- [x] **AU3: Audit web** · S · Deps: AU0 · qc, security-qc for `features/auth` · **High-risk path (read-only) · Security gate: yes** · code-standards §4 · SPEC §5 (web rules), D14
  - Scope: `apps/web/src` (app, config, features, lib, `proxy.ts`, `instrumentation.ts`) (read-only).
  - Checks: C1.1-C1.6, C2.1-C2.5, C3.4 (`endpoints.ts`, copy/constants files).
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU3.md` follows the audit run rules.
    - The `features/auth` <-> `features/reviewer` cycle is confirmed or refuted with the edges and a proposed owner.
    - C1.5 compares web and admin code for logic written twice (session sharing, API client, endpoint maps). Proposals respect the SPEC §5 web rules: server-only files, no `store/`.
    - security-qc notes are added for fixes under `features/auth`.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU3.md` (write); the scope above (read-only).

- [x] **AU4: Audit form-commons** · S · Deps: AU0 · qc · code-standards §4 · SPEC §5, §11
  - Scope: `packages/form-commons/src` (read-only).
  - Checks: C1.5, C1.6, C2.1-C2.5, C3.1 h, C3.5 (exported props and types used by the apps).
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU4.md` follows the audit run rules.
    - Drill h lists the files a new input touches today (component folder, `index.ts` exports, styles, constants).
    - C1.6 lists app-specific logic inside the kit and kit-worthy components copied into an app.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU4.md` (write); the scope above (read-only).

- [x] **AU5: Audit tooling and test code** · S · Deps: AU0 · qc · code-standards §2, §4
  - Scope: `packages/base-config`, `scripts/`, `.github/` (not `.github_template/`), `turbo.json`, `docker-compose.smoke.yml`, `apps/e2e` (read-only).
  - Checks: C1.1, C1.5, C1.6, C2.1-C2.5, C3.1 g.
  - Acceptance:
    - `.claude/state/findings/AUDIT-AU5.md` follows the audit run rules.
    - Drill g lists every file a new cms-api env key touches today: config, `.env.example`, `scripts/stack/cms-api.env`, compose, docs, CI.
    - C1.5 covers values copied between `scripts/`, compose and `apps/e2e`, including the hardcoded smoke DB container name from the handoff follow-up.
  - Verify: `git status --short` shows only the findings file; every listed check has an entry or a zero count.
  - Files: `.claude/state/findings/AUDIT-AU5.md` (write); the scope above (read-only).

- [x] **AU6: Consolidate audit findings and propose fix tasks** · M · Deps: AU1a, AU1b, AU1c, AU2, AU3, AU4, AU5 · planner (`PLAN`), then user approval · code-standards §4 · SPEC §2
  - Acceptance:
    - Every finding in `.claude/state/findings/AUDIT-*.md` is marked accept / drop (with reason) / question; duplicates across areas are merged under one owning module.
    - G6 is decided: a proposed SPEC §2 capability-map change (`content-types`, access -> content-engine) is put to the user as a question.
    - Proposed fix phases R1 (cms-api boundaries + guards), R2 (cms-api extensibility: field-type registry, ports), R3 (frontends: cycles, per-feature copy/config), R4 (readability sweep per module). Each has the phase format of `tasks/plan.md`.
    - Every proposed fix task: one module and one theme (Q1), about 5 files or fewer, in one builder's scope, behavior-preserving, Verify = package tests + `SMOKE_E2E=1 pnpm smoke` green + the new guard (architecture spec or `no-restricted-imports`, Q3) added in the same task and shown to fail on the old import.
    - `Security gate: yes` on fix tasks that touch high-risk paths.
    - Public API, route or DB field renames, and file deletions, are listed as questions, not tasks.
    - Decided in advance (planner, 2026-10-23): **AUD-AU1a-18** (media `provider` column always `cloudinary`) is marked **drop (deferred to v2)**. It is not a fix task.
      - Not behavior-preserving: it changes stored data for the fake adapter, and `MediaProvider` in `apps/cms-api/prisma/schema.prisma:57-62` has no `fake` value, so it needs a migration.
      - Its only benefit is a second real provider. S3 is v2 backlog (SPEC §2, out of scope), and `MEDIA_PROVIDER=fake` is refused in production (`config/env.schema.ts:275-279`), so no real data is wrong today.
      - Revisit it with the S3 adapter as a planned change with a migration: the port gets `providerName: MediaProvider`, and `media.service.ts:162` stores it.
      - The AU6 report lists it under "deferred" so the user can see it.
    - Decided in advance (planner, 2026-10-23): field-type registry (AUD-AU1b-13, with 04, 05, 15), using security notes from `.claude/state/findings/SEC-AU1b.md`. The R2 registry task(s) must state:
      - **Media split: option 1.** Each registry entry has a separate required `listQueryable: boolean` (`false` for `media` and `json`), next to `conditionKind` (the permission-DSL kind; `media` stays `integer`). No single nullable `valueKind`.
        - Why: option 2 leaves a type-specific exception in `documents/queryable-fields.ts`, the spread the audit removes (C1.4/C3.2). A future id-holding type would also be queryable unless someone remembered to edit `documents`. With a required attribute, every new type must declare it, and the compiler refuses an entry that leaves it out.
        - `queryKindOfField` keeps `COMPONENT_FIELD_TYPE` -> `undefined` and otherwise returns `conditionKind` only when `listQueryable` is true.
        - Required spec: REST `filter[<media field>]`, REST `sort=<media field>`, and the GraphQL filter input all reject a media field.
      - `referencesMedia: boolean` is required with no default. A spec checks that the set of types where it is `true` is exactly `{ 'media' }`. `media-refs.service.ts` (`mediaSlots`) and `media-references.ts` read only this marker. An integration check stays: a document read never returns a number for a media field. (13-B)
      - No switch falls through. Every kept switch ends in a `never` exhaustive check, or becomes a `satisfies Record<Kind, ...>` map. Missing kinds fail closed: `literalProblem` reports a problem, and coerce returns `undefined`. Turning on `noImplicitReturns` in `tsconfig.base.json` is a separate question for the user (repo-wide config change), not part of this task. (13-C)
      - The `richtext` coerce entry calls `sanitizeRichtext`, and no raw path exists. A unit spec covers `<img onerror>`. (13-D)
      - `fieldTypeOf` uses `Object.hasOwn`. Unknown keys and `COMPONENT_FIELD_TYPE` give `undefined`, and every consumer treats `undefined` as not queryable, no condition, mask `null`. (13-E)
      - Merged value rules (AUD-AU1b-05) parse only; they never build SQL. The stricter rule wins (filter `DATETIME` pattern). `compileConditions` still calls `validateConditions`. `QueryGuard.assert` stays in `DocumentsQueryService.list`. Before release, a read-only check of `role_permissions.conditions` lists the rows the stricter rule would drop.
      - `DocumentAuthGuard` move (AUD-AU1b-07): a small `access/document-auth.module.ts` (imports `AccessModule` + `IdentityModule`, exports only the guard; pattern `access-management.module.ts`), not provided in `AccessModule`. Branches, their order and the guard order on each controller stay unchanged. One shared `BEARER_PATTERN`. `documents-read.spec.ts:394-405` and `graphql.spec.ts:778-790` stay green and unchanged.
      - The shared UUID pattern keeps its anchors and only the `i` flag (AUD-AU1b-06). `MEDIA_REF_ERROR_CODES.INVALID === 'DOCUMENT_INVALID'` with a unit assertion; the three causes keep one status, code and message (AUD-AU1b-01).
      - All of these tasks: `Security gate: yes`.
    - Decided in advance (planner, 2026-10-23): AU1c findings, using security notes from `.claude/state/findings/SEC-AU1c.md`.
      - **AU1c-05: wire the throttle subject resolver with `RateLimitModule.forRoot({ subjectResolver })`, called only from `app.module.ts`.**
        - `common/rate-limit` owns only the `ThrottleSubjectResolver` interface and its injection token. `access` owns the implementation class (e.g. `ActorThrottleSubjectResolver`). `app.module.ts`, the one place that composes the app, joins the two. This keeps `common` free of any import from `modules/`.
        - `forRoot` takes `subjectResolver` as a required option (no `?`). It binds the token with `useClass` and stays `@Global()`. The guard injects the token without `@Optional()`, so a missing binding fails at boot. (C-06)
        - Why not make `AccessModule` (or a resolver module) `@Global()`: that makes the dependency invisible and global. `forRoot` keeps it explicit in one file.
        - Extension path: a new subject source is a new class passed to `forRoot`. No change to `common`.
        - Required: the per-kind spec from C-06. The resolver gives exactly today's subject for each `ActorContext` kind and for no actor, so no rule that is counted today is skipped (S-04 wording). There is one `ClientIpResolver` and one shared `Clock`, both `@Global()` (C-07).
      - **AU1c-08: the owner env keys are read by a CLI-only helper** (`readOwnerEnv` in `modules/identity/cli/`, with its own small Zod schema), not by the server `envSchema`.
        - Why: only the `owner:bootstrap` CLI uses these keys, so identity owns them (C1). Keeping them out of the server config also keeps `OWNER_EMAIL` (personal data) away from `IAppConfig` and the boot log, and a malformed value cannot stop the API from booting (C-08).
        - The helper is the only reader of these keys, documented in `apps/cms-api/.env.example`, and is a deliberate exception to "one typed config module" that applies to CLI processes only.
        - Blank means unset. There is never a password env key; the password stays prompt or stdin.
      - Rejected options, never to be planned:
        - S-01: body limits stay mounted with `app.use` in `app.setup.ts`, before Nest's parser. The modules only export `GRAPHQL_BODY_LIMIT_MOUNT` and `BULK_BODY_LIMIT_MOUNT`; never `NestModule.configure(consumer)`. Integration assertions: a 33 KiB GraphQL POST gets 413 in the GraphQL error shape, and a 500 KB bulk POST is accepted.
        - S-02: `summarizeConfig` is built from an explicit list of loggable fields (secrets as `secretState`), never by redacting key names with a regex. Add the sentinel spec. The output may shrink but never grow.
        - S-03: `UUID_V7_PATTERN` is not reused for the condition or content UUID patterns.
      - Ordering constraint (C-04): before any move of `REFRESH_COOKIE`, `JWT_ALGORITHM`, `TOKEN_TYPES`, the token TTLs or `REFRESH_TOKEN_BYTES`, the same task first adds a unit spec that pins their literal values.
      - Rate-limit policy moves (C-01 to C-03): a spec checks that rule names are unique; a table test pins each policy's values; the IP rule stays first; the override binding map stays exactly today's three keys; `@Throttle` stays on methods; actor-keyed policies sit behind class-level auth guards.
      - Turnstile and comment renames follow C-09 to C-11 (fail-closed branch, a typed test double, contract comments kept). Adapter renames follow C-12; the provider registry and token-length move follow C-13 to C-15.
      - Renaming `infrastructure/media` or `infrastructure/turnstile` is a user question first. If the user approves, the manager updates the high-risk path list in `.claude/state/project.md` before the task runs, so the security gate keeps applying.
      - S-04 and S-05 are corrections to the audit text; AU6 uses the corrected wording. All AU1c fix tasks: `Security gate: yes`.
    - Decided in advance (planner, 2026-10-23): AU2 findings, using security notes from `.claude/state/findings/SEC-AU2.md`.
      - **AUD-AU2-02 vs AUD-AU2-03: the narrow option wins (S-02). AUD-AU2-02's "auth-store.ts exports generic typed hooks and selectors" is replaced by:**
        - `features/auth/index.ts` exports exactly `useCurrentUser()`, `useSession()` and type `Session`, by name and never with `export *` (S-03). It adds `useSessionStatus()` only if a page outside auth needs it.
        - The generic `useAppSelector` / `useAppDispatch`, `selectAccessToken`, `authSlice`, `accessTokenReceived`, `signedIn` and `signedOut` stay internal to `features/auth`.
        - The token and store wiring go through a separate entry, `features/auth/app-wiring.ts` (`createSession`, `createAuthApi`, `authReducer`, `accessTokenOf(store)`). Only `src/app/**` may import it.
        - `app/store.ts` keeps only `createAppStore` and the `RootState` built from the reducers it composes, so features no longer import `app/`.
        - Why: the only consumer of the access token outside auth is the composition root (`app/app-services.ts`). Every feature reads only the current user. Narrow hooks keep the D14 in-memory token unreachable from feature code, and they still remove the features -> `app` dependency AUD-AU2-02 is about.
        - Extension path: a future state slice is owned by its feature. That feature's `app-wiring.ts` exports the reducer for `app/store.ts`, and its `index.ts` exports only narrow hooks.
        - Guards in the same task: `no-restricted-imports` forbids `**/features/auth/app-wiring*` outside `src/app/**`, forbids `**/app/**` in `src/features/**` and `src/lib/**`, and forbids `**/features/**` in `src/lib/**`. An architecture spec (`src/architecture.spec.ts`) asserts the exact export list of `features/auth/index.ts` and has a failing example.
        - `createAppStore` keeps `devTools: appEnv.isDev` and no persistence (S-02 condition 3).
      - Other AU2 constraints for the R3 tasks (all `Security gate: yes` where they touch `features/auth` or `features/security`):
        - S-01: only `api-failure.ts` helpers move to `lib/api-failure.ts`, with identical logic. Login's private `rateLimitedMessage` and its rule that every 4xx shows one generic message (D8) are never merged into the shared helper, including under AUD-AU2-04. The `login-error`, `password-error` and `setup-error` tests stay unchanged.
        - S-04: the constants contract test checks equality in both directions, reads only `*.constants.ts` exports (never config or secrets), and only test code imports the snapshot.
        - S-05: the session machinery (interceptor, single-flight, cross-tab refresh) moves as-is, with its tests. `REFRESH_LOCK_NAME` and `SESSION_CHANNEL_NAME` stay the same. The broadcast stays `{ type, accessToken, at }`. A rename of `skipAuthRefresh` happens in the same task as the move, together with all 10 call sites, plus a test that login sends no `Authorization` header and does not refresh on 401.
        - S-06: one exported `SETUP_STATUS_QUERY_KEY`, also used by `OwnerSetupPage.tsx`. `staleTime: 0` and `retry: false` stay.
        - S-07: in high-risk files, the task-ID cleanup touches only comment text, and replaces each ID with its SPEC decision (D9, D14, D1, D8) wherever the comment explains a security reason.
        - S-08: in the route registry, routes are protected unless listed otherwise. The public routes are one allowlist owned by `features/auth`; a spec checks it is exactly `{LOGIN, SETUP, RESET_PASSWORD, SET_PASSWORD}` and that `*` stays last. Nav visibility is only `{ subject, action }` data passed to `useCallerAccess`. `SessionProvider` stays the outermost provider.
        - S-09: the copy split is a move with identical keys and strings, with a deep-equal test of `COPY` before and after. `password` stays in `common.copy.ts`.
    - Decided in advance (planner, 2026-10-23): AU3 findings, using security notes from `.claude/state/findings/SEC-AU3.md`. Every R3 task in `apps/web/src/features/auth` (or the new `features/session`) gets `Security gate: yes` and must keep these invariants, each pinned by a test (existing or new):
      - I1: `isPrivileged` moves unchanged and fails closed. A `permissions` value that is not an array counts as privileged, and so does any action other than `read`.
      - I2: `start()` moves unchanged. It calls `me()`, then `isPrivileged`, and only then sets `tokenRef`. On error it calls `clear()` and rethrows.
      - I3: `revokeIfPrivileged` is true only on `signIn` and `completeTwoFactor`, and false on the mount refresh and `startReviewerSession`.
      - I4: the token lives only in `tokenRef`. It never goes into state, context values (other than the `getAccessToken` getter), storage, axios defaults, or an interceptor on the shared `apiClient`.
      - I5: `features/session/index.ts` never exports `start`, `tokenRef` or a token setter. Reviewer tokens enter only through `startReviewerSession`.
      - I6: on the credential step, every 4xx except 429 shows `invalidCredentials`. No branch reads `errorCode` there, and no server text is shown (D8).
      - I7: the shared failure mapper reads only `status`, `errorCode` (compared, never rendered) and `Retry-After`. Alerts stay React text children.
      - I8: `retryAfterSecondsOf` keeps strict `^\d+$` parsing and returns `undefined` for anything else. `RETRY_AFTER_HEADER` stays `'retry-after'`.
      - SEC-AU3-01: `features/session/index.ts` exports the one `PrivilegedAccessError` class (never a copy) and the sign-in types. `isPrivileged` and `createAuthApi` stay internal. Test: a privileged `signIn` shows `COPY.login.errors.privileged`.
      - SEC-AU3-02: the login alert and the 2FA alert both check `PrivilegedAccessError` first (one auth-side check), before the shared mapper. `INVALID_TEMP_TOKEN` maps to `expired` and `INVALID_2FA_CODE` to `invalidCode`; every other failure shows "unexpected". Add a privileged test for the 2FA step.
      - SEC-AU3-03: `BEARER_PREFIX = 'Bearer '`, used as `${BEARER_PREFIX}${accessToken}` only in `me()`'s per-call headers. A test asserts the exact header value and that `apiClient.defaults.headers` has no `Authorization`.
      - SEC-AU3-04: moved `AccountMenu` and session files keep `'use client'` as their first line. `adminUrl` comes only from the validated `appEnv`. The reviewer entry gate (`siteKey !== undefined && status === 'anonymous'`) stays.
      - SEC-AU3-05: test utilities are never exported from `index.ts`. A `no-restricted-imports` rule bans `**/*test-utils*` from files that are not `*.test.*`.
      - SEC-AU3-06: if AUD-AU3-04 option B (a shared `@abyss/client-core` package) is accepted, it is a user question first because it is a new workspace package. It holds only transport code with no config: `createApiClient(baseURL, options)` with no credential default, plus `apiFailureOf` / `retryAfterSecondsOf` / `formatRetryAfter` with no feature kinds and no copy. `axios` is a peer dependency at the workspace version. Run `pnpm audit`. No test files are published.
      - Comment cleanup (AUD-AU3-11) keeps the invariant sentences ("Held in memory only...", "Reader roles only...", "Fails closed").
    - Decided in advance (planner, 2026-10-23): **resend cooldown timer overflow** (SEC-AU3 observation). `use-email-code.ts` in both `apps/web` and `apps/cms-admin` passes `retryAfterSeconds * MS_PER_SECOND` to `setTimeout` without an upper limit. A `Retry-After` above about 24.8 days overflows the delay, so the resend button unblocks early. The server still enforces the limit, so the impact is UX only.
      - It becomes **its own small fix task**, not part of R1-R4 (it changes behavior) and not a board follow-up (it is small and the fix is clear).
      - The fix: clamp the delay to the platform maximum (`MAX_TIMER_DELAY_MS = 2_147_483_647`, a named constant). Add a unit test that a huge `Retry-After` keeps the button blocked.
      - The task is placed after the R3 task that removes the copied failure-mapper / email-code code (AUD-AU3-04 / AUD-AU2 equivalents), so the fix lands once in the shared owner. If that removal is dropped, the task fixes both copies.
      - ui-builder, size S, `Security gate: yes` (`features/auth` in both apps). It is listed in the AU6 proposal for the user's approval together with the R tasks.
    - Decided by the user (2026-10-23): **AUD-AU5-03, smoke seed CLI** (security conditions in `.claude/state/findings/SEC-AU5.md`).
      - The JS string in `scripts/lib/stack-seed.sh`, which requires cms-api `dist/` internals, is replaced by a cms-api CLI owned by `identity`: `seed:account`, under `modules/identity/cli/` (same pattern as `owner:bootstrap`). It is a fix task for core-builder in R1 or R2 with `Security gate: yes`. It is not behavior-preserving (it adds validation and an audit row), so AU6 lists it as a planned change. The user has already approved its direction.
      - **Role allowlist (user answer 1):** an explicit allowlist in `identity.constants.ts` of `admin` and `guest`, so the e2e 2FA account stays `admin`. Add `editor` only if a spec needs it. `owner` (D1), `reviewer` (D2) and any custom or unknown slug are always refused.
      - **SPEC and audit (user answer 2):** the planner amends SPEC §7 Q2 / D1 / D17 to name the smoke-only seed CLI. The amendment says it is not an HTTP route, never creates an owner or reviewer, refuses in production unless `ALLOW_ACCOUNT_SEED=smoke` is passed per invocation, and writes an audit row. A new audit action `account.seeded` is added to the D15 event list and to `access/security-audit.constants.ts` (written by the task). Metadata is the role slug and the channel only, never the password, and the email only as the project's audit rules allow. The SPEC edit is part of AU6's output (planner `SPEC` job) and must land before the fix task is dispatched.
      - Conditions S1-S7 apply unchanged:
        - S1: the CLI exits before opening the DB when `NODE_ENV=production`, unless `ALLOW_ACCOUNT_SEED=smoke` is set. The check is on that exact value: `=1` fails. The key is passed only on the `api_exec -e` call. It is never in `scripts/stack/cms-api.env`, compose, k3s manifests or `.env.example`, and the server never accepts it.
        - S3: the password comes from stdin only (`readPasswordFromStream`, `PASSWORD_STDIN_FLAG`), never from argv or env, and is never printed. The no-password-in-output assertion covers all three seed calls.
        - S4: the CLI uses `hashPassword` and the shared identity field schemas (email normalization, password min/max, display-name max). Status is always `active`. A taken email is refused and never upserted or promoted. `--email-2fa` sets only `is2faEnabled` and `twoFaMethod='email'`.
        - S5: the audit row is written in the same transaction, with actor type `system`.
        - S6: no Nest module imports the CLI; a guard or test asserts this.
        - S7: the CLI spec covers refusal in production without the opt-in, a wrong opt-in value, `owner` / `reviewer` / unknown roles, a taken email, and never printing the password.
      - `stack-seed.sh` then calls the CLI. `api_exec`, `pass` and `fail` are passed in explicitly, or those calls move into `smoke.sh`.
    - Decided in advance (planner, 2026-10-23): AU4 findings, using security notes from `.claude/state/findings/SEC-AU4.md`. These are constraints on the R3 tasks (ui-builder). `Security gate: yes` applies where a task touches `features/auth`, `features/security` or `features/access`.
      - AUD-AU4-6, moving the 2FA dialogs from the native `Modal` to the kit `Dialog`:
        - M1 / SEC-AU4-01: `onInteractOutside` calls `preventDefault()`. `onOpenChange(false)` maps to `onClose` only, so Esc still closes. A test per caller checks that a click on the overlay does not close the dialog and that Esc does.
        - M2 / SEC-AU4-02: dialogs open when mounted and close when unmounted. No `forceMount`, no `open={false}`, and the challenge and setup state stay in the dialog. A test checks the TOTP secret is gone after cancel.
        - M3: `ConfirmWithCodeForm` still asks for the code and the current password (D8). Esc still drops the login challenge. Focus starts on the code field.
        - If the option "keep native, move it into the kit as `NativeDialog`" is chosen instead, SEC-AU4-01 does not apply, but M2 and M3 still do.
      - AUD-AU4-7, moving the hand-written tables to `SortableSheet`:
        - T1 / SEC-AU4-04: columns are built with the same conditions (`showActions`, `showCreator`). The per-row checks stay inside `renderCell`. Every destructive action still opens its confirm dialog. Only `tokenPrefix` is shown in a cell, and `TokenReveal` stays outside the table. Existing tests for read-only actors and revoked or unmanageable rows stay, and any missing ones are added before the swap.
        - T2: cells render row text as React text only.
        - SEC-AU4-03: no `sortable` columns, `onSortChange` or `onSelectedChange` on the access, identity and reviewer lists. Server-side sorting would be a separate core-builder task with an allowlisted key and the `query.guard` check, and needs the user's approval first.
      - AUD-AU4-8, kit `Radio` and `Textarea`:
        - R1 / R2 / SEC-AU4-05: `ui/radio.tsx` is a styled native `<input type="radio">`, not a Radix group. `FieldPicker` passes `disabled` on both radios. Tests: when disabled, clicks do not call `onChange`; "All fields" emits exactly `null` and "Some fields" emits exactly `[]`.
        - `CellDetails` keeps `aria-invalid`, `aria-describedby`, `disabled` and `spellCheck={false}` on the kit `Textarea`.
      - The CSP needs no change for the Radix scroll-lock style (the nonce path is already in place).
    - Decided in advance (planner, 2026-10-23): **hand-written UUID v7 helper** (AU5 addendum; file `apps/cms-api/src/common/uuidv7.ts` is in AU1c scope, so AU6 merges it with AUD-AU1c-04). Check C1.5 (an in-repo copy of what a library provides) and C2.
      - Facts: its only caller is `media.service.ts` (the storage key). It was built in-repo on purpose ("uuidv7() as an in-repo helper (no dep)", `archive/handoff-archive.md:86`). It does not keep ordering within one millisecond, which `uuid` v7 does. Prisma's `uuid(7)` is used only for `document_id`.
      - **Planner recommendation: option 2, keep the helper**, recorded as "drop by decision". AUD-AU1c-04 still decides where it lives (move it to `media` while media is its only caller).
      - Why: the storage key needs only uniqueness, not ordering within one millisecond, and the helper is small and tested. Replacing it adds a dependency and touches a high-risk path for no behavior a user can see (code-standards §4.3: do not build for needs the spec does not have). The S-03 rule stays: `UUID_V7_PATTERN` is not reused for the other UUID patterns.
      - **User question (AU6 report)**: keep the hand-written helper (recommended), or add the `uuid` package and replace it (new dependency per SPEC §13; about 4 files; `Security gate: yes`, media path)? Trade-off: one less hand-written module and ordering within one millisecond, against a new dependency, an audit surface and a refactor on a high-risk path. Option 3 (the key from a DB default) is not offered. The key is created before the row exists and is used for the upload first: `media.service.ts:142-143` calls `uuidv7()`, then `storage.put`, and `fileLibrary.create` runs only after that. A DB default would mean reordering the upload flow, which is a behavior change.
    - Fix tasks are written into `tasks/todo.md` / `tasks/plan.md` only after the user approves the list.
  - Verify: planner report lists counts (accepted / dropped / questions) per area and the proposed task IDs; the manager confirms user approval before the tasks reach the board.
  - Files: `tasks/todo.md`, `tasks/plan.md`, `SPEC.md` §2 (only after approval).
  - Done 2026-10-23 (planner). The user approved the fix tasks below on 2026-10-23 (Q-A1..Q-A10 answered). Smoke seed CLI SPEC amendment written (D1, D15, D17, Q2), as the user decided.

## Refactor: Audit fixes (R1-R4) — APPROVED 2026-10-23

Order (user): R1-00 (SPEC) first, then the R1 guards (R1-01, R1-02, R1-07, R1-03). R3 may run alongside R1 (ui-builder). R2 starts after R1, and R4 after R1-R3.

Source: AU6 consolidation of `.claude/state/findings/AUDIT-*.md` and their security notes (`AUDIT-AU1a-security.md`, `SEC-AU1b.md` ... `SEC-AU5.md`). Each task names the findings it closes. Security conditions are cited by their IDs in those files (X1-X3, 13-A..13-E, S-xx, C-xx, I1-I8, M1-M3, T1-T2, R1-R2, S1-S7) and the AU6 decision blocks above; the builder reads the cited note before starting. Keep the findings and SEC files until R4 is done (they hold the conditions).

### AU6 triage (2026-10-23)
118 findings (AU1a 19, AU1b 16, AU1c 15, AU2 19, AU3 16, AU4 16, AU5 17) plus the cross-cutting notes X1-X3. 107 are accepted fully or in part into R tasks. 11 are dropped or deferred (listed below). There are 10 user questions, and they block only the tasks that name them.
- **Dropped or deferred, with reasons:**
  - AUD-AU1a-18: deferred to v2, with the S3 adapter (AU6 decision block).
  - AUD-AU1a-19: no change needed; the contracts are already additive.
  - AUD-AU1a-15: per-module subject registration is not built. New system subjects are rare, so this would be building for an imagined need. Only its spec part goes into R1-02.
  - AUD-AU1a-16: per-module audit-event files are not built. After R1-04, a new event touches 2 files in the security-audit module, which is acceptable.
  - AUD-AU1b-12: no rename sweep; renames happen only inside R1-14.
  - AUD-AU1b-14: the target state is already reached.
  - Kept as they are, with reasons recorded in the findings: AUD-AU1c-13 provider descriptors (only the cheap map step is in R2-14), AUD-AU1c-09 `IAppConfig` rename, AUD-AU1c-12 (no folder rename of `infrastructure/media` and no adapter-file suffix renames: low value, and the high-risk paths stay valid), AUD-AU2-19, AUD-AU3-08 (kept as the cv/ extension point), AUD-AU3-14, AUD-AU3-16, AUD-AU5-11.
  - The size and `id-denylist` lint rules proposed in several findings are not added (review-level). Only `no-restricted-imports`, `no-restricted-syntax` and architecture specs are added.
- **User answers (2026-10-23):**
  - Q-A1: update SPEC §2/§5 to match the code (R1-00). Feature constants live next to the feature.
  - Q-A2: blanket approval for `git mv` and renames inside approved R tasks, with no content change in the same commit. Whole-file deletions still need approval each time.
  - Q-A3: keep the hand-written UUID v7 helper; it moves unchanged to `media/` in R1-15.
  - Q-A4: a committed `apps/cms-api/content/public-constants.json` with a CI `--check`. No shared package (R3-24).
  - Q-A5: option A. FormAlert goes in the kit; the small helpers stay as two copies with a byte-parity test (R3-22, then R3-01).
  - Q-A6: yes to the CI changes (R3-24a `--check`, R4-29 reusable workflow and pins check).
  - Q-A7: yes. `DiffViewerBlock` moves to cms-admin `features/content`, `MediaInput` stays in the kit, and the kit exports `CSP_NONCE_META_NAME` (R3-21).
  - Q-A8: no public renames. Contracts change additively only.
  - Q-A9: yes, `noImplicitReturns` as separate tasks (R2-18, R3-26).
  - Q-A10: yes to both behavior changes: the empty-page range text (R3-18) and the cooldown cap (R3-25).

Rules for every R task:
- Behavior-preserving (Q1) unless the task says **planned change**. One owning module per task; other modules get import-path edits only.
- File moves and renames use `git mv` with no content change in the same commit (approved, Q-A2). Whole-file deletions are listed for approval each time, never done silently.
- **SV (standard verify):** `pnpm --filter <package> lint typecheck test` for every touched package (cms-api also `test:integration`); `SMOKE_E2E=1 pnpm smoke` green; Prettier on changed files. The task's **guard** (architecture spec or `no-restricted-imports`, Q3) is added in the same task, and the unit record shows it failing on the old code.
- Builders: core-builder for `apps/cms-api`, `scripts/`, `.github/`, root config; ui-builder for `apps/cms-admin`, `apps/web`, `packages/form-commons`; qc for `apps/e2e`.
- `Security gate: yes` means security-qc reviews before the next task builds on it. Exception for tasks that only edit comments: they keep `Security gate: yes` but get a diff check only.

### Phase R1: cms-api boundaries and guards (core-builder)

- [x] **R1-00: SPEC §2 / §5 update for module directions (G6)** · S · Deps: none (Q-A1 answered: the SPEC follows the code) · planner (`SPEC`) · Findings AUD-AU1a-03, AUD-AU1b-03, AUD-AU2-08, AUD-AU3-09, AUD-AU1a-13 / AUD-AU2-13 (suffixes), AUD-AU1c-12 (tree) · SPEC §2, §5
  - Acceptance: the §2 map adds `security-audit`, `content-types` and the access core / management split, and states the agreed directions. §5 trees match the code (cms-api `common/`, `infrastructure/activity`; admin `app/`, `components/`, no `store/`; web `features/session`). §5 lists the file suffixes `.requests.ts`, `.api.ts`, `.slice.ts`, `.port.ts`, `.routes.ts`. Constants placement follows the Q-A1 answer.
  - Verify: the user approves the diff. `ALLOWED_MODULE_EDGES` in R1-03 matches §2 row for row.
  - Files: `SPEC.md`.

- [x] **R1-01: Architecture specs check resolved imports, not path strings (X1)** · S · Deps: none · core-builder · **Security gate: yes** · Findings X1, AUD-AU1a-02 note, AUD-AU1b-02 guard · SPEC D3, D18
  - Acceptance: one shared helper resolves each import of a source file to its target file (relative paths, and `index.ts` facades followed to the real file). `record-serializer.architecture.spec.ts` and `graphql.architecture.spec.ts` use it. A new check fails when any module `index.ts` re-exports `content.repository`, `tree-loader` or `field-projection`. Every scan asserts a non-empty file count.
  - Verify: SV. Show both specs failing on a scratch import through a facade (`../content-engine` re-exporting the loader), then revert.
  - Files: `apps/cms-api/src/architecture/import-graph.ts` (new) + spec, `modules/access/record-serializer.architecture.spec.ts`, `modules/graphql/graphql.architecture.spec.ts`.

- [x] **R1-02: Guard: every handler has permission metadata or is on the public list (X2)** · S · Deps: none · core-builder · **Security gate: yes** · Findings X2, AUD-AU1a-15 (spec part only) · SPEC D3, D5, D6
  - Acceptance: the spec boots the Nest app's metadata. Every controller handler either has `RequirePermission` metadata or appears in an explicit `PUBLIC_HANDLERS` allowlist (auth, setup, health, GraphQL, document reads guarded by `DocumentAuthGuard`, reviewer status). Every `RequirePermission` subject exists in the subject table. One `PERMISSION_METADATA_KEY` exists in the codebase.
  - Verify: SV. Removing one `@RequirePermission` fails the spec.
  - Files: `apps/cms-api/src/architecture/permission-metadata.architecture.spec.ts`, `.../public-handlers.constants.ts`.

- [x] **R1-03: Module dependency guard with an allowed-edges table** · S · Deps: R1-01, R1-00 · core-builder · Findings AUD-AU1a-01 (guard), AUD-AU1a-03, AUD-AU1b-01 (guard), AUD-AU1b-03 · SPEC §2
  - Acceptance: `modules.architecture.spec.ts` builds the module graph at file level. It fails on any edge missing from `ALLOWED_MODULE_EDGES` (mirrors SPEC §2) and on any cycle. Today's violations go in a `KNOWN_VIOLATIONS` list. Each later R1 task removes its entries, and R1-14 ends with the list empty. `access` is three nodes (SPEC §2): core (every `access/` file except the two below), management (`access/management/**`, until R1-10 the accounts, roles and API-token files), and document auth (`access/document-auth.*`, from R1-12), which may import access core and identity. `documents` and `graphql` may import access document auth. `common/**`, `config/**` and `infrastructure/**` may not import `modules/**` (a known violation until R1-08).
  - Verify: SV. Adding a new reverse edge fails the spec.
  - Files: `apps/cms-api/src/architecture/modules.architecture.spec.ts`, `.../module-edges.constants.ts`.

- [x] **R1-04: Extract the `security-audit` module** · M · Deps: R1-01, R1-03 · core-builder · **Security gate: yes** · Findings AUD-AU1a-04 (notes 1-4), X3 · SPEC D15
  - Acceptance: `modules/security-audit/` holds the service, the audit constants and `writeAuditLog` (moved unchanged), plus `security-audit.module.ts` and `index.ts`. It depends only on Prisma, config and the `ActorContext` type. `SecurityAuditService` is provided in exactly one module. The email-HMAC derivation and `AuditMetadataValue` are byte-identical. Callers in identity, access, media and reviewer change import paths only. Its `KNOWN_VIOLATIONS` entries are removed.
  - Verify: SV, plus the existing audit integration tests unchanged, plus a spec that `SecurityAuditService` appears in exactly one `providers` list.
  - Files: `modules/security-audit/*` (moved from `modules/access/security-audit.*`), import-only edits in caller files (more than 5, all one-line path changes).

- [x] **R1-05: System roles owned by access (one roles table)** · M · Deps: R1-04 · core-builder · **Security gate: yes** · Findings AUD-AU1a-06 (notes 1-3), AUD-AU1a-07 (role literal part) · SPEC D6
  - Acceptance: `modules/access/roles/system-roles.ts` holds slugs, ranks, a required `assignable` flag, default permissions and both seeds. `UNASSIGNABLE_ROLE_SLUGS` is derived from that table, and a spec checks it is exactly `{public, reviewer}`. Slug and rank values are unchanged (DB CHECK and trigger). Access core no longer imports `identity.constants`. The roles table also owns `ROLE_SLUG_PATTERN`, with the same regex as today, and `createRoleSchema` in `access-management.requests.ts` uses it instead of the content-engine `SLUG_PATTERN` (removes the `access-management.requests -> content-engine.constants` known violation). Actor kinds (`'anonymous'`, `'reviewer'` in `ACCOUNT_REFERENCES_HIDDEN_FROM` and `actor-context`) stay as they are.
  - Verify: SV. Seed integration tests unchanged. A literal scan spec covers role slugs outside the table (actor-kind literals excluded).
  - Files: `modules/access/roles/*` (new, moved from `identity/identity.constants.ts`, `identity/system-roles.seed.ts`, `access/role-permissions.seed.ts`, `access/access.constants.ts` default permissions), `identity/cli/seed.ts`.

- [x] **R1-06: Generic request helpers in `common/http`** · S · Deps: R1-03 · core-builder · **Security gate: yes** · Findings AUD-AU1a-08 (items 1-3; notes 1 and 3) · SPEC D7
  - Acceptance:
    - `common/http/client-meta.ts` holds `ClientMeta` and `clientMetaOf`, which still resolves the IP through `ClientIpResolver`.
    - `common/http/request-parsing.ts` holds every generic helper that other modules take from `access-management.requests.ts` / `.constants.ts` today: `parseRequest`, `invalidRequest`, `queryInt`, `RequestIssue`, `documentIdSchema`, `pageQuerySchema` (`strictObject`, `MAX_PAGE_SIZE`), `PageQuery`, `PageMeta` and `PAGINATION`.
    - Access, documents, graphql, identity, media and reviewer import them from there.
    - This removes every known violation that points at `access-management.requests` or `PAGINATION` (the 20 entries marked R1-06). `setRefreshCookie` stays in identity with `REFRESH_COOKIE`. Update the SPEC §5 cms-api `common/` tree line (`http/`).
  - Verify: SV. Rate-limit spoof test (§12-8) unchanged.
  - Files: `common/http/client-meta.ts`, `common/http/page-query.ts`, `identity/auth.controller.ts`, `identity/refresh-token.service.ts`, `access/access-management.requests.ts` (+ import-only edits), `SPEC.md` §5 (one line).

- [x] **R1-07: Pin security constants by literal value** · S · Deps: none · core-builder · **Security gate: yes** · Findings C-04, AUD-AU1c-02, AUD-AU1c-06 · SPEC D9, D14
  - Acceptance: a unit spec pins `REFRESH_COOKIE` (`__Secure-abyss_rt`, path `/api/v1/auth`, HttpOnly, Secure, SameSite strict, no Domain), `JWT_ALGORITHM='HS256'`, `TOKEN_TYPES`, TTLs 900 / 604800 / 10 / 300 s and `REFRESH_TOKEN_BYTES=32` as literals. `NO_STORE_HEADER` is `Cache-Control: no-store`.
  - Verify: SV.
  - Files: `apps/cms-api/src/modules/identity/auth-constants.pin.spec.ts` (new).

- [x] **R1-08: Identity auth constants out of `common`** · S · Deps: R1-07, R1-03 · core-builder · **Security gate: yes** · Findings AUD-AU1c-02, AUD-AU1a-08 (item 4) · SPEC D9, D14
  - Acceptance: identity-only exports move from `common/constants/auth.constants.ts` to `modules/identity/identity-auth.constants.ts`. `NO_STORE_HEADER` moves to `common/constants/http.constants.ts`. `EMAIL_MAX_LENGTH` and `USER_AGENT_MAX_LENGTH` move to identity and other modules import them from the identity facade. `common` imports nothing from `modules/`, and its known violation is removed. The R1-07 pin spec stays green, unchanged except for import paths.
  - Verify: SV.
  - Files: `common/constants/auth.constants.ts` (emptied, deletion listed for approval), `common/constants/http.constants.ts`, `modules/identity/identity-auth.constants.ts` (+ import-only edits).

- [x] **R1-09: Identity owns session revocation and token issuing** · M · Deps: R1-04 · core-builder · **Security gate: yes** · Findings AUD-AU1a-05 (notes 1-4) · SPEC D9, D2
  - Acceptance:
    - `revokeAllRefreshTokens` keeps its name, or becomes `revokeAllSessions` doing both the `tokenVersion` increment and the refresh revoke in the given `tx`. It stays callable without Nest, and `versions.invalidateAccount` still runs after commit.
    - Reviewer tokens come from an identity method with `REVIEWER_SESSION_TTL_SECONDS` fixed inside identity. There is no free `ttlSeconds` parameter, and `typ`, HS256 and `tv`/`pv` are unchanged.
    - A spec checks that only `identity/` references the `RefreshToken` model and writes `tokenVersion`, with an allowlist for today's access and reviewer write sites if any remain.
  - Verify: SV, plus the §12-10 integration tests unchanged.
  - Files: `identity/refresh-token.service.ts`, `identity/access-token.service.ts`, `access/accounts.service.ts`, `reviewer/reviewer.service.ts`, new spec.

- [x] **R1-10: Split `access` into core and management folders** · M · Deps: R1-04, R1-05, R1-09 · core-builder · **Security gate: yes** · Findings AUD-AU1a-01 (notes X1-X3) · SPEC §2, D3
  - Acceptance:
    - Accounts, roles and API tokens (their controllers, services, requests and constants) move to `access/management/` and keep `AccessManagementModule`. Access core files never import `identity/*`.
    - The guards keep the same providing modules, and the `@UseGuards(JwtAuthGuard, PermissionGuard)` order is unchanged. `AccessModule` still imports `ContentEngineModule`.
    - `SERIALIZER_FILE` in the serializer spec is updated, and the identity <-> access known violations are removed.
    - Constants used by core files stay in core: `API_TOKEN` (token format, used by `api-token.guard.ts` and the document-auth guard) moves from `api-tokens.constants.ts` to an access core constants file, and the management error codes/messages used by `rank-rules.ts` move to core. This removes the `api-token.guard -> api-tokens.constants` and `rank-rules -> access-management.constants` known violations.
    - `PRE_SPLIT_MANAGEMENT_FILE` (and its use in `module-graph.ts`) is removed; management membership comes from the `access/management/` folder only.
  - Verify: SV. The R1-02 spec is green.
  - Files: `git mv` of management files (more than 5, moves only), `access-management.module.ts`, architecture spec constants.

- [x] **R1-11: Facades for identity and access** · M · Deps: R1-10 · core-builder · **Security gate: yes** · Findings AUD-AU1a-02 (identity, access), AUD-AU1a-01 (public interfaces) · SPEC §2
  - Acceptance:
    - `identity/index.ts` and `access/index.ts` export by name the interfaces listed in AUD-AU1a-01/02: guards, `RequirePermission` (re-exported, never copied), `ActorContext` builders, `VersionCache`, `AccessPolicyService`, rank rules, the serializer and `ClientMeta` types.
    - They never export raw loaders, `writeAuditLog` or `hashRefreshToken`.
    - `no-restricted-imports` in cms-api forbids `**/identity/*` and `**/access/*` deep imports from outside each module. Other modules switch to the facades.
  - Verify: SV. R1-01 and R1-02 specs are green.
  - Files: `identity/index.ts`, `access/index.ts`, `apps/cms-api/eslint.config.mjs` (+ import-only edits).

- [x] **R1-12: `DocumentAuthGuard` moves to access** · S · Deps: R1-11 · core-builder · **Security gate: yes** · Findings AUD-AU1b-07 item 1 (SEC-AU1b notes 1-5; AU6 decision block) · SPEC D3, D5, D18
  - Acceptance: `access/document-auth.module.ts` imports `AccessModule` and `IdentityModule` and exports only `DocumentAuthGuard`. The guard is moved unchanged: three branches in the same order, and an empty or malformed header gives 401. Guard order on the documents, bulk and GraphQL controllers is unchanged. There is one shared `BEARER_PATTERN`. The `documents -> identity` edge is removed.
  - Verify: SV. `documents-read.spec.ts:394-405` and `graphql.spec.ts:778-790` unchanged and green.
  - Files: `access/document-auth.guard.ts` (moved), `access/document-auth.module.ts`, `access/api-token.guard.ts`, `documents/documents.module.ts`, `graphql/graphql.module.ts`.

- [x] **R1-13: Media owns its reference error code** · S · Deps: R1-03 · core-builder · **Security gate: yes** · Findings AUD-AU1b-01 (SEC-AU1b notes 1-2) · SPEC D3, D12
  - Acceptance: `MEDIA_REF_ERROR_CODES.INVALID === 'DOCUMENT_INVALID'` in `media/media.constants.ts`, with a unit assertion. The media module no longer imports documents. All three causes give one status, code and message.
  - Verify: SV.
  - Files: `media/media.constants.ts`, `media/media-refs.service.ts`, spec.

- [x] **R1-14: Facades for content-engine, documents, media, reviewer, graphql, content-types; zero known violations** · M · Deps: R1-11, R1-12, R1-13 · core-builder · **Security gate: yes** · Findings AUD-AU1b-02, AUD-AU1b-07 items 4-5, AUD-AU1a-02 (media, reviewer) · SPEC §2
  - Acceptance:
    - Each module has an `index.ts` with the AUD-AU1b-02 export lists. `ContentRegistryProvider` moves to `content-engine/content-registry.provider.ts`. `loadDefinitions` and the content paths are exported for the graphql CLI.
    - `ContentRepository` and `loadComponentTrees` are reachable only by the modules the R1-01 spec allows.
    - `no-restricted-imports` is extended to every module, and `KNOWN_VIOLATIONS` is empty.
    - The module-edge spec also enforces the SPEC §2 sub-rules not checked by R1-03: "types only" (`security-audit -> access core` imports are `import type` only) and "auth guard only" (`content-types` and `media` import from identity only the JWT guard and `AuthenticatedRequest`).
  - Verify: SV. The R1-03 spec has no known violations.
  - Files: six `index.ts`, `content-engine/content-registry.provider.ts`, `content-engine/content-engine.module.ts`, `eslint.config.mjs` (+ import-only edits). Split into two builder sessions if needed: content-engine + documents, then the rest.

- [x] **R1-15: Module error codes and single-module files leave `common`** · S · Deps: R1-08 · core-builder · **Security gate: yes** · Findings AUD-AU1c-03 (S-05), AUD-AU1c-04 (S-03, C-05) · SPEC D1, D18
  - Acceptance:
    - The setup error codes move to identity and the GraphQL codes to `graphql.constants.ts`; wire values are unchanged. The controller's 404 mapping and its message are unchanged.
    - `health.constants.ts` moves to `health/`. `DOCUMENT_ID_PARAM` moves to documents.
    - `uuidv7.ts` moves unchanged to `media/` (per Q-A3) with its spec. The unused `UUID_V7_PATTERN` export is dropped, and the other two UUID patterns are not touched.
    - The richtext sanitizer stays put until R2-02.
    - Update the SPEC §5 cms-api `common/` tree line (`uuidv7.ts` gone).
  - Verify: SV.
  - Files: `common/constants/error.constants.ts`, `modules/identity/identity.constants.ts`, `modules/graphql/graphql.constants.ts`, `modules/health/health.constants.ts`, `modules/media/uuidv7.ts`, `SPEC.md` §5 (one line).

- [x] **R1-16: Smoke seed CLI `seed:account` (planned change)** · M · Deps: R1-04, R1-05 · core-builder · **Security gate: yes** · Findings AUD-AU5-03 (SEC-AU5 S1-S7; user decisions in the AU6 block) · SPEC D1, D15, D17 (amended 2026-10-23)
  - Acceptance:
    - `modules/identity/cli/seed-account.ts` takes `--email`, `--role`, optional `--email-2fa` and `--password-stdin`. The role allowlist is `admin` and `guest` (from `identity.constants.ts`).
    - With `NODE_ENV=production` it exits before opening the DB unless `ALLOW_ACCOUNT_SEED` equals exactly `smoke`.
    - It reuses `hashPassword` and the shared identity field schemas. Accounts are always `active`, and a taken email is refused without changes.
    - It writes `account.seeded` (channel `cli_seed`, role slug) in the same transaction. No Nest module imports it.
    - `scripts/lib/stack-seed.sh` calls it with `api_exec -e ALLOW_ACCOUNT_SEED=smoke`, and the inline JS string is gone. `api_exec`, `pass` and `fail` are passed in explicitly. The no-password-in-output check covers all three calls.
  - Verify: SV. A CLI integration spec covers each S7 refusal. `grep -rn "require('./dist" scripts/` is empty. `ALLOW_ACCOUNT_SEED` is absent from `scripts/stack/cms-api.env`, compose and `.env.example`.
  - Files: `modules/identity/cli/seed-account.ts` + spec, `modules/identity/identity.constants.ts`, `modules/security-audit/security-audit.constants.ts`, `apps/cms-api/package.json` (script), `scripts/lib/stack-seed.sh`.

### Phase R2: cms-api extensibility (core-builder)

- [x] **R2-01: Field-type registry in content-engine** · M · Deps: R1-14 · core-builder · **Security gate: yes** · Findings AUD-AU1b-13, AUD-AU1b-04, AUD-AU1a-14 (13-A, 13-B, 13-E; AU6 decision block) · SPEC D3, D10
  - Acceptance:
    - `content-engine/field-types/` declares a `FieldTypeSpec` per scalar type with `satisfies Record<ScalarFieldType, FieldTypeSpec>`. Each spec has `columnType`, `conditionKind`, a required `listQueryable: boolean` (false for `media` and `json`), `maskedValue: 'sentinel' | 'null'`, a required `referencesMedia: boolean` and `graphqlOutput`.
    - `fieldTypeOf` uses `Object.hasOwn` and returns `undefined` for `component` and unknown keys.
    - `COLUMN_TYPES` and the `json` encode read from the registry. Specs cover `referencesMedia` true only for `media` and `listQueryable` false for `media`.
  - Verify: SV. Generated SQL for `cv-page.json` is unchanged (`content:generate -- --check`).
  - Files: `content-engine/field-types/*` (new), `content-engine/content-engine.constants.ts`, `content-engine/sql-generator.ts`, `content-engine/content.repository.ts`.

- [x] **R2-02: Value coercion and value kinds move into the registry** · M · Deps: R2-01 · core-builder · **Security gate: yes** · Findings AUD-AU1b-05, AUD-AU1b-06 items 1-2, AUD-AU1b-15 (13-C, 13-D, SEC-AU1b-05, SEC-AU1b-06 item 2) · SPEC D3, D13
  - Acceptance:
    - `coerceValue` per type lives in the registry. Richtext calls the sanitizer, which moves unchanged from `common/sanitize/` to `content-engine/field-types/`, and no raw path exists.
    - The value patterns, `INT4_MAX` and one UUID pattern (anchored, `i` flag only) are exported by the registry, and `value-validator` and `document-filter` use them.
    - The stricter datetime rule wins. Every remaining switch ends in a `never` check, and missing kinds fail closed.
    - A read-only script lists the `role_permissions.conditions` rows the stricter rule would drop; it is run on the smoke DB and its output goes in the unit record.
    - Update the SPEC §5 cms-api `common/` tree line (`sanitize/` gone).
  - Verify: SV, plus a sanitizer spec for `<img onerror>` through `fieldTypeOf('richtext').coerceValue`.
  - Files: `content-engine/field-types/*`, `common/sanitize/richtext.sanitizer.ts` (moved), `documents/value-validator.ts`, `documents/document-filter.ts`, `documents/documents.constants.ts`, `SPEC.md` §5 (one line).

- [x] **R2-03: Access reads condition kinds and mask values from the registry** · M · Deps: R2-02 · core-builder · **Security gate: yes** · Findings AUD-AU1a-14, AUD-AU1a-17 (field-type part), AUD-AU1b-13 rows 10-13 (13-A, 13-C, 13-E, AU1a-14 note) · SPEC D3
  - Acceptance:
    - `conditionKindOf` and `literalProblem` use the registry. `literalProblem` is exhaustive and fails closed. `compileConditions` still calls `validateConditions`.
    - `CONDITION_FIELD_TYPES`, `MASK_SENTINEL_FIELD_TYPES` and `SENTINEL_TYPES` are derived from the registry. The registry gives only the mask shape; the decision to mask stays in access.
    - `documents/queryable-fields.ts` uses `listQueryable`.
    - New spec: REST `filter[<media>]`, REST `sort=<media>` and the GraphQL filter input all reject a media field.
  - Verify: SV, plus the §12-4 / §12-19 tests unchanged.
  - Files: `access/conditions.compiler.ts`, `access/access.constants.ts`, `access/record.serializer.ts`, `access/subject-catalog.ts`, `documents/queryable-fields.ts`.

- [x] **R2-04: GraphQL output types from the registry** · S · Deps: R2-01 · core-builder · Findings AUD-AU1b-13 row 14, AUD-AU1b-11 (shared types part) · SPEC D18
  - Acceptance: `SCALAR_OUTPUT_TYPES` maps `graphqlOutput` names. Shared types (`DocumentStatusEnum`, `PageMetaType`, `MediaType`) move to `graphql/schema/shared-types.ts`. The printed SDL is unchanged (`graphql:print-schema -- --check`).
  - Verify: SV.
  - Files: `graphql/schema/schema.builder.ts`, `graphql/schema/shared-types.ts`, `graphql/schema/scalars.ts`.

- [x] **R2-05: Media reads the media marker from the registry; field-type guard** · S · Deps: R2-03, R2-04 · core-builder · **Security gate: yes** · Findings AUD-AU1a-07, AUD-AU1b-13 row 15, AUD-AU1b-15 (13-B; AU1a-07 note) · SPEC D12, D13
  - Acceptance:
    - content-engine exports `mediaColumnsOf(registry)`, which returns structured table and column references only, never SQL.
    - `media-refs.service.ts` (`toStored`, `embed`) and `media-references.ts` both use it. The SQL stays in `media-references.ts` with `quoteIdentifier` and `$1`.
    - A test covers a media field at the root and inside a component.
    - An architecture spec checks there is no `case '<scalar type>'` or `=== '<scalar type>'` outside `content-engine/field-types/`.
  - Verify: SV, plus the §12-13 delete-referenced test unchanged.
  - Files: `content-engine/field-types/media-columns.ts`, `media/media-refs.service.ts`, `media/media-references.ts`, architecture spec.

- [x] **R2-06: One list-query normalizer for REST and GraphQL** · S · Deps: R2-02 · core-builder · **Security gate: yes** · Findings AUD-AU1b-06 item 3, AUD-AU1b-05 (SEC-AU1b-05 note 4) · SPEC D3, D18
  - Acceptance: `documents` exports `normalizeListQuery`, which checks shape and limits only. `parseListQuery` and `graphql/list-arguments.ts` call it. `QueryGuard.assert` stays in `DocumentsQueryService.list`. A table-driven spec shows REST and GraphQL reject the same out-of-range inputs.
  - Verify: SV.
  - Files: `documents/dto/list-documents.query.ts`, `documents/list-query.normalizer.ts`, `graphql/list-arguments.ts`, spec.

- [x] **R2-07: Shared HTTP error description and byte-limit helper; body-limit mount paths** · S · Deps: R1-15 · core-builder · **Security gate: yes** · Findings AUD-AU1b-06 items 4-5, AUD-AU1c-15 (`app.setup` part; S-01) · SPEC D18
  - Acceptance:
    - `common/` exports `describeHttpException`, used by the exception filter and the GraphQL error formatter.
    - `common/middleware/byte-limit.ts` holds the Content-Length check and the chunk counter, used by both body-limit middlewares.
    - Each middleware exports its mount path. `app.setup.ts` keeps `app.use` in the same order before `setGlobalPrefix`; never `configure(consumer)`.
    - New integration assertions: a 33 KiB GraphQL POST gets 413 in the GraphQL shape, and a 500 KB bulk POST is accepted.
  - Verify: SV.
  - Files: `common/filters/http-exception.filter.ts`, `common/middleware/byte-limit.ts`, `graphql/error-format.ts`, `graphql/graphql-body-limit.middleware.ts`, `documents/bulk-body-limit.middleware.ts`, `app.setup.ts`.

- [x] **R2-08: Rate-limit policies live with their modules** · M · Deps: R1-14 · core-builder · **Security gate: yes** · Findings AUD-AU1c-01 (C-01, C-02, C-03) · SPEC D7
  - Design (REPLAN 2026-10-23, after the build-R2-08 blocker): `config/` is the platform node and may not import `modules/` (SPEC §2, `ALLOWED_MODULE_EDGES.platform = []`, `KNOWN_VIOLATIONS` stays empty). So ownership is split along the existing edge identity -> platform:
    - config owns the env contract: the override env keys, their parsing and the production opt-in check. It names env keys only, never rule names.
    - identity owns the bindings: each overridable identity rule declares which env key may override its limit.
    - The throttle guard (common) joins the two by env key. Neither config nor common imports `modules/`.
    - `loadAppConfig(rawEnv)` keeps its signature. No caller outside `config/` changes (bootstrap, test-app, the five CLIs, content-engine migrate, other specs).
    - Next overridable rule, in any module: add the env key to `RATE_LIMIT_OVERRIDE_ENV_KEYS` (plus `.env.example`), then set `limitOverrideEnvKey` on the rule. The compiler links the two.
  - Acceptance:
    - Before the move, a table test pins every policy (name, keySource, limit, windowMs, order), and a spec checks rule names are unique.
    - The policies move to `<module>.rate-limits.constants.ts` (identity, access, documents, media, reviewer). `common/rate-limit` keeps only the mechanism (`RateLimitRule`, `RateLimitKeySource`, store, window helpers). `RATE_LIMIT_RULE_NAMES` moves into `identity.rate-limits.constants.ts`.
    - `config/config.constants.ts` exports `RATE_LIMIT_OVERRIDE_ENV_KEYS = ['LOGIN_RATE_LIMIT_IP', 'LOGIN_RATE_LIMIT_EMAIL', 'REFRESH_RATE_LIMIT_IP'] as const` and the type `RateLimitOverrideEnvKey`. `env.schema.ts` parses these keys from this list, and the production opt-in check iterates this same list.
    - `IAppConfig.rateLimit.limitOverrides` is keyed by env key: `Readonly<Partial<Record<RateLimitOverrideEnvKey, number>>>`. `app-config.ts` no longer imports `common/constants/limits.constants`.
    - `RateLimitRule` gets an optional `limitOverrideEnvKey?: RateLimitOverrideEnvKey`. Only the three identity rules set it (`login:ip`, `login:email`, `refresh:ip`). `ThrottleGuard.limitOf` returns `config.rateLimit.limitOverrides[rule.limitOverrideEnvKey]` when the key is set, and otherwise `rule.limit`.
    - `rateLimitOverrideBindings` (exported from identity) is the env key -> rule name table derived from identity's rules. A spec pins it to exactly today's three pairs. A second spec walks every module's policies and checks that each key in `RATE_LIMIT_OVERRIDE_ENV_KEYS` is bound exactly once and that no rule outside identity sets the field.
    - Behaviour stays the same: the existing app-config override specs (rekeyed by env key) and a guard spec show that `LOGIN_RATE_LIMIT_IP=500` raises `login:ip` to 500 and leaves every other rule unchanged. In production the opt-in refusal fires for each of the three keys.
    - A spec checks every ACTOR / ANONYMOUS_IP handler sits behind a class-level auth guard. `@Throttle` stays method-level.
    - `modules.architecture.spec.ts` is unchanged and green, and `KNOWN_VIOLATIONS` stays empty.
  - Verify: SV.
  - Files: `common/constants/limits.constants.ts`, `common/rate-limit/` (rule types), `common/guards/throttle.guard.ts` (+ spec), five `*.rate-limits.constants.ts`, `config/config.constants.ts`, `config/env.schema.ts`, `config/app-config.ts`, `config/app-config.spec.ts`, plus import-only edits in the nine controllers that use `RATE_LIMIT_POLICIES`. No `loadAppConfig` call-site edits.

- [x] **R2-09: Clock and client-IP modules; throttle subject resolver port** · M · Deps: R2-08 · core-builder · **Security gate: yes** · Findings AUD-AU1c-05 (S-04, C-06, C-07; AU6 decision block) · SPEC D7
  - Acceptance:
    - `common/time/clock.module.ts` and `common/http/client-ip.module.ts` are both `@Global()`, with exactly one provider each.
    - `RateLimitModule.forRoot({ subjectResolver })` is called only from `app.module.ts`, with the option required and no `@Optional()`. `common/rate-limit` owns the interface and token, and access owns `ActorThrottleSubjectResolver`.
    - A spec builds one request per actor kind and one with no actor, and shows the same subject as today. `anonymousFlagOf` is renamed `isAnonymousRequest`.
    - Update the SPEC §5 cms-api `common/` tree line (`time/`, `http/client-ip.module.ts`).
  - Verify: SV. Boot fails if the binding is missing (spec).
  - Files: `common/rate-limit/rate-limit.module.ts`, `common/guards/throttle.guard.ts`, `common/time/clock.module.ts`, `common/http/client-ip.module.ts`, `access/actor-throttle-subject.resolver.ts`, `app.module.ts`, `SPEC.md` §5 (one line).

- [x] **R2-10: Route groups per module; route snapshot** · M · Deps: R2-07, R1-07 · core-builder · **Security gate: yes** · Findings AUD-AU1c-15 (`API_ROUTES` part; C-17) · SPEC §9
  - Acceptance:
    - `common` keeps `API_PREFIX`, `ID_PARAM` and `SLUG_PARAM`. Each module owns `<module>.routes.ts`.
    - A spec boots the app and snapshots every method + path pair; there are no duplicates and the paths are byte-identical.
    - The bulk route stays before `:documentId`. `PASSWORD` and `TWO_FACTOR` stay under `auth/`, and the cookie path stays as pinned.
  - Verify: SV. The snapshot matches the pre-move list (generated before the move).
  - Files: `common/constants/api.constants.ts`, the module `*.routes.ts` files (one line each in controllers; more than 5, import-only).

- [x] **R2-11: Env schema helpers and named rule functions** · S · Deps: none · core-builder · Findings AUD-AU1c-07, AUD-AU1c-11 (C-15 kept: `emptyToUndefined` on `TURNSTILE_SECRET_KEY`, lowercase hostname) · SPEC D17
  - Acceptance:
    - `config/env-validators.ts` holds `optionalText`, `optionalSecret` and `portNumber`. `SECRET_ENV_KEYS` and `OPTIONAL_SECRET_ENV_KEYS` are iterated by one length rule.
    - The `superRefine` body is split into named rule functions in `config/env-rules.ts`, with the same messages in the same order.
    - A table test covers both secret lists.
  - Verify: SV. `app-config.spec.ts` messages unchanged.
  - Files: `config/env.schema.ts`, `config/env-validators.ts`, `config/env-rules.ts`, spec.

- [x] **R2-12: Boot config summary from an allowlist; `.env.example` parity spec** · S · Deps: R2-11 · core-builder · **Security gate: yes** · Findings AUD-AU1c-14, AUD-AU5-17 (S-02, C-16) · SPEC D17
  - Acceptance:
    - `config/config-summary.ts` builds the summary from explicit fields only, with secrets through `secretState`. The output is today's or smaller.
    - The sentinel spec sets every key to a unique value and checks no secret appears.
    - The parity spec compares `.env.example` keys with `envSchema` keys, with an allowlist for CLI-only keys. It reads `.env.example` only and prints key names only.
    - The docs lists in `docs/local-run.md` point to `.env.example`. The SOPS table stays.
  - Verify: SV.
  - Files: `config/app-config.ts`, `config/config-summary.ts`, `config/env-example.parity.spec.ts`, `docs/local-run.md`.

- [x] **R2-13: Owner env keys read by a CLI-only helper** · S · Deps: R1-15 · core-builder · **Security gate: yes** · Findings AUD-AU1c-08 (C-08; AU6 decision block) · SPEC D1
  - Acceptance: `identity/cli/read-owner-env.ts` (own small Zod schema, blank means unset) is the only reader of `OWNER_EMAIL` and `OWNER_DISPLAY_NAME`. Those keys are on the parity allowlist. There is no password env key.
  - Verify: SV. CLI specs unchanged.
  - Files: `identity/cli/read-owner-env.ts` + spec, `identity/cli/owner-bootstrap.ts`.

- [x] **R2-14: Provider factory maps; Turnstile token length on the port** · S · Deps: none · core-builder · **Security gate: yes** · Findings AUD-AU1c-13 (cheap step only; C-13, C-14, C-15) · SPEC D12, D17
  - Acceptance:
    - The mail and media modules select providers through `Record<Provider, factory>` lookups that throw on a missing entry (`Object.hasOwn`).
    - The production refusals are kept. The fake media factory also refuses `isProduction` (planned change, defence in depth).
    - A spec asserts the Cloudinary upload options. `TURNSTILE_TOKEN_MAX_LENGTH` moves to `turnstile.port.ts`, and reviewer keeps `.min(1).max(...)`.
    - A spec iterates `MAIL_PROVIDERS` and `MEDIA_PROVIDERS`.
  - Verify: SV.
  - Files: `infrastructure/mail/mail.module.ts`, `infrastructure/media/media-storage.module.ts`, `infrastructure/media/fake.adapter.ts`, `infrastructure/turnstile/turnstile.port.ts`, `reviewer/reviewer.requests.ts`.

- [x] **R2-15: One time-constants file** · S · Deps: R1-08 · core-builder · **Security gate: yes** · Findings AUD-AU1c-06 (C-04) · SPEC D9
  - Acceptance: `common/constants/time.constants.ts` is the only declaration of `MS_PER_SECOND`, `MS_PER_MINUTE`, `MS_PER_HOUR`, `SECONDS_PER_MINUTE`, `SECONDS_PER_HOUR` and `SECONDS_PER_DAY`. Digest names stay per purpose. A lint rule forbids the literal `1_000` / `1000` in `*.constants.ts` elsewhere.
  - Verify: SV, with the R1-07 pin spec unchanged.
  - Files: `common/constants/time.constants.ts`, the five declaring files.

- [x] **R2-16: Kind maps for image re-encoders and actor kinds** · S · Deps: R1-11 · core-builder · **Security gate: yes** · Findings AUD-AU1a-17 (notes 1-2) · SPEC D2, D12
  - Acceptance:
    - The image re-encoders are a `Record<ImageMime, encoder>` derived from `ALLOWED_MEDIA_TYPES`, where an allowlisted MIME with no encoder throws `unsupportedType`.
    - `effectivePolicy` and `auditActorOf` use `Record<ActorKind, ...>` with no default. The reviewer/anonymous read-only clamp is unchanged, and anonymous is still audited as `{type:'account', accountId:null}`.
  - Verify: SV.
  - Files: `media/upload.pipeline.ts`, `media/media.constants.ts`, `access/actor-context.ts`, `security-audit/security-audit.service.ts`.

- [x] **R2-17: Content-types contract snapshot and open-union note** · S · Deps: R2-01 · core-builder · Findings AUD-AU1b-16 · SPEC §9
  - Acceptance: a spec snapshots the keys of a `GET /content-types` response. `docs/modules/content-schema.md` says `type` and `conditionKind` are open unions that clients must handle with a fallback.
  - Verify: SV.
  - Files: `content-types/content-types.contract.spec.ts`, `docs/modules/content-schema.md`.

- [x] **R2-18: `noImplicitReturns` in cms-api** · S · Deps: R2-03, Q-A9 · core-builder · Findings SEC-AU1b 13-C · SPEC §10
  - Acceptance: `apps/cms-api/tsconfig.json` sets `noImplicitReturns: true`, and every reported site is fixed so it fails closed (no behavior change otherwise).
  - Verify: SV.
  - Files: `apps/cms-api/tsconfig.json` + the fixed sites (listed in the unit record).

### Phase R3: frontends and UI kit (ui-builder; one core-builder and one qc task)

- [x] **R3-01: Admin failure vocabulary to `lib/`, FormAlert out of auth** · M · Deps: R3-22 · ui-builder · **Security gate: yes** · Findings AUD-AU2-01 (S-01), AUD-AU2-04 (error part) · SPEC D8
  - Acceptance:
    - `lib/api-failure.ts` holds `ApiFailure`, `apiFailureOf`, `rateLimitedMessage`, `retryAfterSecondsOf`, `ApiIssue` and `apiIssuesOf`, moved with identical logic.
    - Login's private `rateLimitedMessage` and its rule of one generic message for every 4xx stay in `login-error.ts`.
    - Admin uses the kit `FormAlert` from R3-22 (Q-A5 option A). The deletion of the local `features/auth/FormAlert.tsx` is listed for approval.
    - The `auth -> access` edge is gone. The `login-error`, `password-error` and `setup-error` tests are unchanged.
  - Verify: SV.
  - Files: `lib/api-failure.ts`, `features/auth/api-failure.ts`, `features/auth/login-error.ts`, `features/access/access-error.ts` (+ import-only edits to the kit `FormAlert`).

- [x] **R3-02: Admin auth facade with narrow hooks; app-only wiring entry** · S · Deps: R3-01 · ui-builder · **Security gate: yes** · Findings AUD-AU2-02, AUD-AU2-03 (auth) (S-02, S-03; AU6 decision block) · SPEC D14
  - Acceptance:
    - `features/auth/index.ts` exports by name only `useCurrentUser`, `useSession` and `Session`.
    - `features/auth/app-wiring.ts` exports `createSession`, `createAuthApi`, `authReducer` and `accessTokenOf`, and only `src/app/**` may import it.
    - The typed hooks stay internal to auth, and features stop importing `app/`. `createAppStore` keeps `devTools: appEnv.isDev` and has no persistence.
    - `strip-trailing-slashes` moves to `config/`.
    - `no-restricted-imports`: app-wiring only from `src/app/**`, no `app/**` from features or lib, no features from lib. `src/architecture.spec.ts` asserts the exact auth export list.
  - Verify: SV.
  - Files: `features/auth/index.ts`, `features/auth/app-wiring.ts`, `app/store.ts`, `apps/cms-admin/eslint.config.mjs`, `src/architecture.spec.ts` (+ import-only edits in 9 feature files).

- [x] **R3-03: Admin session machinery moves into `features/auth`** · S · Deps: R3-02 · ui-builder · **Security gate: yes** · Findings AUD-AU2-07 (lib part; S-05), AUD-AU2-10 (interceptor flags) · SPEC D9, D14
  - Acceptance:
    - `single-flight.ts`, `cross-tab-refresh.ts` and `auth-interceptor.ts` move with their tests unchanged, keeping the same lock and channel names and the same broadcast message.
    - If `skipAuthRefresh` / `authRetried` are renamed, it happens in this task across all 10 call sites and the augmentation, with a test that login sends no `Authorization` header and does not refresh on 401.
  - Verify: SV.
  - Files: the three `lib/` files and their tests (moved), `app/app-services.ts`, `features/auth/session.ts`.

- [x] **R3-04: Shared page states to `components/`; content-type model to `features/content-types`** · M · Deps: R3-01, R1-00 · ui-builder · Findings AUD-AU2-04 · SPEC §2 (frontend directions), §5
  - Acceptance: `components/PageStates.tsx` (`PageHeader`, `TableSkeleton`, `LoadError`; `Pagination` see R3-18). `PageMeta` in `lib/api-types.ts`. `ContentType`, `ContentTypeField` and `getContentTypes` move to a new small feature `features/content-types/` (mirrors the cms-api `content-types` module; replanned 2026-10-23: `features/content` would make an access <-> content cycle, since content already imports access). Its `index.ts` exports only those three names. `access`, `media`, `content` and `reviewer` import them from that `index.ts`; `content-types` imports no other feature. `components/**` and `lib/**` import no feature (spec).
  - Verify: SV.
  - Files: `components/PageStates.tsx`, `lib/api-types.ts`, `features/access/access.api.ts`, `features/content-types/content-types.api.ts`, `features/content-types/index.ts` (+ import-only edits in content, media, reviewer).

- [x] **R3-05: Admin feature facades and import order** · M · Deps: R3-02, R3-04 · ui-builder · **Security gate: yes** · Findings AUD-AU2-03, AUD-AU2-01 (guard) (S-03) · SPEC §5
  - Acceptance:
    - `index.ts` for access, media, content, reviewer and security, with named exports only.
    - Per-feature `no-restricted-imports` encodes the SPEC §2 order auth < security < content-types < access < media < content, reviewer (status imports no feature), with no deep imports.
    - The architecture spec checks every cross-feature import targets an `index.ts`.
  - Verify: SV. The spec fails on `content/CollectionListPage.tsx:34-37` before the change.
  - Files: five `index.ts`, `apps/cms-admin/eslint.config.mjs`, `src/architecture.spec.ts` (+ import-only edits).

- [x] **R3-06: `createApiContext`; health API through a provider** · S · Deps: R3-05 · ui-builder · Findings AUD-AU2-06 (contexts), AUD-AU2-17 · SPEC §5
  - Acceptance: `lib/create-api-context.tsx` returns `[Provider, useApi]`. The seven `*-api-context.tsx` files use it, and so does `createHealthApi(client)`. A lint rule forbids `**/lib/api-client` in `src/features/**`.
  - Verify: SV.
  - Files: `lib/create-api-context.tsx`, the seven context files, `features/status/health.api.ts`, `app/AppProviders.tsx`.

- [x] **R3-07: Shared page hooks, formatters, mask constant, query keys** · M · Deps: R3-05 · ui-builder · **Security gate: yes** (setup key) · Findings AUD-AU2-06 (rest), AUD-AU2-09 (S-06) · SPEC §5
  - Acceptance:
    - `components/use-restore-focus.ts`, `useClampedPage(meta)` and `lib/date-format.ts` exist.
    - The mask sentinel becomes a constant in `config/content.constants.ts`. `CONTENT_QUERY_KEYS` holds `{list, type, presence}`.
    - `SETUP_STATUS_QUERY_KEY` is exported from `use-setup-status.ts` and imported by `OwnerSetupPage`, with `staleTime: 0` and `retry: false` kept.
    - Lint rules forbid `new Intl.DateTimeFormat` and literal `queryKey` arrays outside their owners.
  - Verify: SV.
  - Files: new hooks and `lib/date-format.ts`, `features/content/content-queries.ts`, `features/auth/use-setup-status.ts`, the pages (import edits). Split per hook if over 5 files.

- [x] **R3-08: Admin copy split into a folder with an aggregate** · M · Deps: R3-01 · ui-builder · **Security gate: yes** · Findings AUD-AU2-18, AUD-AU2-15 (nav labels) (S-09) · SPEC §5
  - Acceptance:
    - `config/copy/` has one file per section plus `common.copy.ts` (`password`, `session`, `app`, nav labels). `COPY` is re-exported, so call sites are unchanged.
    - A deep-equal test of `COPY` before and after covers the `login`, `setup`, `password` and `security` sections.
    - A lint rule stops one feature importing another feature's copy file.
  - Verify: SV. e2e imports of `copy.constants` still resolve (`config/copy.constants.ts` re-exports).
  - Files: `config/copy/*.copy.ts`, `config/copy.constants.ts`.

- [x] **R3-09: Admin feature registry: routes and nav items** · M · Deps: R3-05, R3-08 · ui-builder · **Security gate: yes** · Findings AUD-AU2-14 (routes, nav), AUD-AU2-15 (S-08) · SPEC D14
  - Acceptance:
    - Each feature exports `feature.ts` with `routes` and optional `navItem {labelKey, path, subject, action}`. `features/registry.ts` lists them, and `App.tsx` and `AppShell.tsx` iterate the list.
    - Routes are protected unless listed otherwise. The public routes are one allowlist owned by `features/auth`; a spec checks it is exactly `{LOGIN, SETUP, RESET_PASSWORD, SET_PASSWORD}` and that `*` is last.
    - Nav uses `useCallerAccess().can`, and the nav order is unchanged.
  - Verify: SV, plus a spec that every `features/*` folder is registered.
  - Files: `features/registry.ts`, `features/*/feature.ts`, `app/App.tsx`, `app/AppShell.tsx`.

- [x] **R3-10: Admin feature registry: services and providers** · S · Deps: R3-09, R3-06 · ui-builder · **Security gate: yes** · Findings AUD-AU2-14 (wiring) (S-08 condition 4) · SPEC §5
  - Acceptance: `app-services.ts` and `AppProviders.tsx` iterate the registry, nesting through `reduceRight`. `SessionProvider` and the store provider stay outermost. Adding a feature needs one registry line.
  - Verify: SV.
  - Files: `app/app-services.ts`, `app/AppProviders.tsx`, `features/registry.ts`, `features/*/feature.ts`.

- [x] **R3-11: Admin field registry also covers list display** · S · Deps: R3-05 · ui-builder · Findings AUD-AU2-16 · SPEC §5
  - Acceptance: `FieldAdapter` gains optional `formatForList`, `isSortable` and `listAlignment`. `formatValue` and `LIST_SORTABLE_TYPES` are derived from the registry. A spec checks every non-component `FIELD_TYPE` has an entry and that `CollectionListPage` does not reference `FIELD_TYPE`.
  - Verify: SV.
  - Files: `features/content/field-registry.tsx`, `features/content/CollectionListPage.tsx`, `config/content.constants.ts`.

- [x] **R3-12: Admin feature constants next to their features** · M · Deps: R1-00 (Q-A1 answer), R3-05 · ui-builder · Findings AUD-AU2-07 (constants) · SPEC §5
  - Acceptance: `config/` keeps `env`, `endpoints`, `routes`, `http.constants` and `auth.constants`. The access, content, media, security and reviewer constants move to `features/<x>/<x>.constants.ts`. A lint rule forbids importing another feature's constants file.
  - Verify: SV.
  - Files: five constants files (moved) + import-only edits.

- [x] **R3-13: Web `features/session`; auth and reviewer stop depending on each other** · M · Deps: R3-14 · ui-builder · **Security gate: yes** · Findings AUD-AU3-01, AUD-AU3-13 (I1-I5, SEC-AU3-01, -04, -05) · SPEC §5 web rules, D14
  - Acceptance:
    - `features/session/` holds `web-session.tsx` (moved from `useWebSession.tsx`) and `auth.api.ts`. Its `index.ts` exports `WebSessionProvider`, `useWebSession`, `WebSession`, `CurrentUser`, the single `PrivilegedAccessError` class and the sign-in types, and never `start`, `tokenRef`, `isPrivileged` or `createAuthApi`.
    - `AccountMenu` moves to `app/` and keeps `'use client'`.
    - Lint rules: no deep imports between features, no auth <-> reviewer imports, `**/*test-utils*` only in tests. An architecture spec fails on a directory cycle.
  - Verify: SV, plus tests pinning I1-I5 and a privileged `signIn` showing `COPY.login.errors.privileged`.
  - Files: `features/session/*` (moved), `app/AccountMenu.tsx`, `app/layout.tsx`, `app/providers.tsx`, `apps/web/eslint.config.mjs`.

- [x] **R3-14: Web failure mapping to `lib/api-failure`** · S · Deps: none · ui-builder · **Security gate: yes** · Findings AUD-AU3-03, AUD-AU3-06 (Bearer) (I6-I8, SEC-AU3-02, -03) · SPEC D8
  - Acceptance:
    - `lib/api-failure.ts` holds transport kinds only, plus `retryAfterSecondsOf` and `formatRetryAfter`. `Alert` / `AlertTone` replace `LoginAlert`.
    - The login and 2FA alerts check `PrivilegedAccessError` first, in one auth-side check.
    - `BEARER_PREFIX = 'Bearer '` is used only inside `me()`'s per-call headers.
  - Verify: SV, plus a 2FA privileged test, an exact-header test, and a test that `apiClient.defaults.headers` has no `Authorization`.
  - Files: `lib/api-failure.ts`, `features/auth/api-failure.ts`, `features/auth/TwoFactorStep.tsx`, `features/auth/login-alert.ts`, `features/reviewer/reviewer-error.ts`.

- [x] **R3-15: Web small owners: reviewer queries, safe link target, config owners** · S · Deps: R3-13 · ui-builder · **Security gate: yes** · Findings AUD-AU3-06, AUD-AU3-07, AUD-AU3-15, AUD-AU3-02 (SEC-AU3-04) · SPEC §5
  - Acceptance:
    - `features/reviewer/reviewer.queries.ts` holds `REVIEWER_QUERY_KEYS`, one `reviewerApi` and `useReviewerEnabled()`, keeping the `siteKey && anonymous` gate.
    - `lib/safe-link-target.ts` exists. Error codes move to the auth and reviewer constants. `TURNSTILE` moves to `security.constants.ts`.
    - `config/**` may not import `lib/api-client` or features.
  - Verify: SV.
  - Files: `features/reviewer/reviewer.queries.ts`, `lib/safe-link-target.ts`, `config/require-env.ts`, `config/http.constants.ts`, `config/security.constants.ts`.

- [x] **R3-16: Kit field wiring hooks and control style constants** · M · Deps: none · ui-builder · Findings AUD-AU4-1, AUD-AU4-3 · SPEC §5
  - Acceptance: internal `useFieldIds`, `useRegisteredField` (one FormProvider guard) and `NativeFieldProps` are used by Field, CheckboxInput, SwitchInput, TextInput, TextAreaInput, SelectInput and RichtextInput. `ui/control.constants.ts` holds the shared focus and invalid classes, and the output CSS is unchanged. The spec from AUD-AU4-1 and AUD-AU4-3 is added.
  - Verify: SV; component tests unchanged.
  - Files: `components/forms/field-wiring.ts`, `components/ui/control.constants.ts`, the inputs (split into two sessions if over 5 files).

- [x] **R3-17: Kit `Radio`; swaps in FieldPicker, DiffViewerBlock, CellDetails** · S · Deps: R3-16 · ui-builder · **Security gate: yes** · Findings AUD-AU4-8 (R1, R2, SEC-AU4-05) · SPEC D3
  - Acceptance: `ui/radio.tsx` is a styled native radio input. `FieldPicker` passes `disabled` explicitly. `CellDetails` uses `Textarea` and keeps its aria, `disabled` and `spellCheck` props. Lint forbids raw radio and textarea JSX in the apps.
  - Verify: SV, plus tests that a disabled picker ignores clicks and that the emitted values are exactly `null` / `[]`.
  - Files: `packages/form-commons/src/components/ui/radio.tsx`, kit `index.ts`, `DiffViewerBlock.tsx`, `features/access/FieldPicker.tsx`, `features/access/CellDetails.tsx`.

- [x] **R3-18: Admin `Pagination` becomes an adapter over the kit `TablePagination` (planned change)** · S · Deps: R3-04, Q-A10 · ui-builder · Findings AUD-AU4-5 · SPEC §5
  - Acceptance: the copied markup is removed and the adapter maps `meta`. The empty-page range text changes to the kit's `range(0, 0, total)`, as approved in Q-A10. A spec stops a second `Pagination` definition.
  - Verify: SV.
  - Files: `components/PageStates.tsx` (or the adapter file), the 5 call sites (import only).

- [x] **R3-19: Admin 2FA dialogs on the kit `Dialog`** · S · Deps: none · ui-builder · **Security gate: yes** · Findings AUD-AU4-6 (M1-M3, SEC-AU4-01, -02) · SPEC D8
  - Acceptance: `components/Modal.tsx` renders the kit `Dialog`, with `onInteractOutside` prevented and `onOpenChange(false)` mapped to `onClose`. It opens on mount and closes on unmount (no `forceMount`). Callers are unchanged. A lint rule forbids `<dialog` JSX.
  - Verify: SV, plus tests per caller: an overlay click does not close and Esc does; the TOTP secret is gone after cancel; focus is on the code field.
  - Files: `components/Modal.tsx`, `TwoFactorModal.test.tsx`, `SecuritySettingsPage.test.tsx`, `apps/cms-admin/eslint.config.mjs`.

- [x] **R3-20: Admin list tables on `SortableSheet`** · M (4 sessions: a Reviewer+Roles, b Accounts, c ApiTokens, d MediaLibrary) · Deps: R3-07 · ui-builder · **Security gate: yes** (a-c) · Findings AUD-AU4-7 (T1, T2, SEC-AU4-03, -04) · SPEC D3, D5, D6
  - Acceptance:
    - No `sortable` columns, `onSortChange` or `onSelectedChange` on these lists.
    - Conditional columns and per-row gates stay the same, and confirm dialogs are kept. Only `tokenPrefix` appears in a cell.
    - A spec allows `<table` only in `PermissionMatrix` and `TokenScopeEditor`.
  - Verify: SV, plus read-only, revoked and unmanageable row tests (kept or added before the swap).
  - Files: one page + its test per session; the spec in session d.

- [x] **R3-21: Kit domain blocks and CSP nonce constant** · S · Deps: Q-A7 · ui-builder · Findings AUD-AU4-4 · SPEC §5
  - Acceptance: per Q-A7 (approved): `DiffViewerBlock` is moved with `git mv` to cms-admin `features/content`, and the removal of its kit export is listed for approval, `MediaInput` stays, and `CSP_NONCE_META_NAME` is exported by the kit and used in admin `main.tsx`.
  - Verify: SV.
  - Files: `DiffViewerBlock/*`, kit `index.ts`, `features/content/ConflictMergeModal.tsx`, admin `config/security.constants.ts`, `main.tsx`.

- [x] **R3-22: Shared FormAlert in the kit; parity test for copied helpers** · S · Deps: none (Q-A5 option A approved) · ui-builder · Findings AUD-AU3-04 · SPEC §5
  - Acceptance: `FormAlert` (with the additive `success` tone) is exported by the kit. Admin and web use it, and their local copies are listed for deletion. A root test checks `strip-trailing-slashes.ts` is byte-identical in both apps.
  - Verify: SV.
  - Files: kit `components/forms/FormAlert/*`, kit `index.ts`, both apps' FormAlert importers (import-only), the parity test.

- [x] **R3-23: Kit public API snapshot and README table** · S · Deps: R3-21 · ui-builder · Findings AUD-AU4-15, AUD-AU4-16 · SPEC §5
  - Acceptance: a spec compares the kit export names with `public-api.snapshot.ts`. The README export table is correct, and a "Public API" rule says changes are additive and renames go through deprecated aliases.
  - Verify: SV.
  - Files: `packages/form-commons/src/public-api.spec.ts`, `public-api.snapshot.ts`, `README.md`.

- [x] **R3-24: Contract snapshot of public cms-api constants** · M (3 sessions) · Deps: Q-A4, R1-15, R2-10 · a core-builder, b ui-builder, c qc · **Security gate: yes** (a) · Findings AUD-AU2-05, AUD-AU3-05, AUD-AU4-2, AUD-AU5-02 (e2e part) (S-04) · SPEC §10
  - Acceptance:
    - a: `pnpm --filter @abyss/cms-api contract:print` writes `apps/cms-api/content/public-constants.json` from `*.constants.ts` exports only. It contains password bounds, OTP and TOTP lengths, setup-token max, reviewer input limits, error codes, permission actions, system subjects and richtext schemes, with no env or secrets. `-- --check` is added to the cms-api CI job (Q-A6).
    - b: admin, web and kit tests compare their mirrored constants with the JSON in both directions. Only tests import it.
    - c: e2e constants (`REFRESH_COOKIE_NAME`, `NOTES_MAX`, TOTP period) are checked the same way.
  - Verify: SV. Changing one mirrored value fails the matching test.
  - Files: a: `apps/cms-api/src/contract/print-public-constants.ts`, `package.json`, `.github/workflows/cms-api.yml`; b: one `*.contract.test.ts` per package; c: `apps/e2e/src/constants.contract.test.ts`.

- [x] **R3-25: Cap the resend cooldown timer (planned change)** · S · Deps: R3-14 (and R3-22 if the hooks merge) · ui-builder · **Security gate: yes** · Findings SEC-AU3 observation (AU6 decision block) · SPEC D8
  - Acceptance: `use-email-code.ts` in web and admin clamps the delay to `MAX_TIMER_DELAY_MS = 2_147_483_647`.
  - Verify: SV, plus a unit test that a huge `Retry-After` keeps the button blocked.
  - Files: `apps/web/src/features/auth/use-email-code.ts`, `apps/cms-admin/src/features/auth/use-email-code.ts`, their tests, the constants files.

- [x] **R3-26: `noImplicitReturns` in cms-admin, web and form-commons** · S · Deps: Q-A9 · ui-builder · Findings SEC-AU1b 13-C · SPEC §10
  - Acceptance: each tsconfig sets the option, and the reported sites are fixed.
  - Verify: SV.
  - Files: three tsconfigs + fixed sites.

### Phase R4: readability sweep and test tooling

Comment sweeps (Q4: remove task IDs, keep SPEC IDs and the sentence; security contract comments per C-11, S-07, AUD-AU3-11 keep their meaning; diffs touch comment text only, or check-label strings in `smoke.sh`):
- [x] **R4-01: Task IDs out of cms-api identity, access, security-audit comments** · S · core-builder · **Security gate: yes** (diff check) · Findings AUD-AU1a-11 · Verify: SV. Files: the comment lines listed in the finding.
- [x] **R4-02: Task IDs out of the other cms-api comments; comment guard spec** · S · Deps: R4-01 · core-builder · Findings AUD-AU1b-10, AUD-AU1c-10 (C-11, stale database-health comments) · Acceptance: `comments.architecture.spec.ts` fails on `\b(T\d{1,3}[a-z]?|OS\d+|Q-?[A-Z]*\d+)\b` in comments of non-spec sources, without matching `D7`, `§9` or `2fa`. Verify: SV.
- [x] **R4-03: Task IDs out of cms-admin comments; guard** · S · ui-builder · **Security gate: yes** (diff check) · Findings AUD-AU2-11 (S-07: replace IDs with D9, D14, D1, D8 where a security reason is stated) · Verify: SV.
- [x] **R4-04: Task IDs out of web and kit comments; guard** · S · ui-builder · Findings AUD-AU3-11, AUD-AU4-11 (keep "Held in memory only", "Reader roles only", "Fails closed") · Verify: SV.
- [x] **R4-05: Task IDs and stale comments in scripts, compose, workflows** · S · core-builder · Findings AUD-AU5-12, AUD-AU5-13 (smoke header; check labels such as `Init container (deploy:migrate)`; stale `T37e` workflow comment) · Verify: `pnpm smoke` output reads without IDs; actionlint clean.
- [x] **R4-06: Task IDs and stale owner:bootstrap text in apps/e2e** · S · qc · Findings AUD-AU5-12, AUD-AU5-13 (README, `.env.example`) · Verify: e2e lint; `pnpm e2e:spec` on one spec.

Renames (internal names only; public API and response keys unchanged per Q-A8):
- [x] **R4-07: cms-api renames in identity, access, reviewer, media** · S · core-builder · **Security gate: yes** · Findings AUD-AU1a-09, AUD-AU1a-10, AUD-AU1a-13 (owner-bootstrap CLI file, media-refs naming) · Verify: SV.
- [x] **R4-08: cms-api renames in content-engine, documents, graphql, common, infrastructure** · S · core-builder · **Security gate: yes** (turnstile) · Findings AUD-AU1b-08, AUD-AU1b-09 (internal), AUD-AU1c-09 (C-09, C-10: an `UnconfiguredTurnstileVerifier` 503 test first, `satisfies TurnstileVerifier` on the test double) · Verify: SV.
- [x] **R4-09: Admin and web renames; admin test fixture out of `src`** · S · ui-builder · **Security gate: yes** (web auth files) · Findings AUD-AU2-10, AUD-AU2-13, AUD-AU3-10 · Verify: SV.
- [x] **R4-10: Kit internal renames, `MediaInput.onFilePick`, folder names** · S · ui-builder · Findings AUD-AU4-9 (internal), AUD-AU4-10 (additive alias with `@deprecated`), AUD-AU4-14 · Verify: SV; public API snapshot updated additively only.

File and function splits (named sub-responsibilities only; X3 single providers; each split goes through security-qc where gated):
- [x] **R4-11: Split the 2FA service into management and login** · M · core-builder · **Security gate: yes** · Findings AUD-AU1a-12 (notes 2, 5) · Verify: SV, plus the 2FA tests unchanged and one `TwoFactorChallengeStore` provider.
- [x] **R4-12: Split invitations out of accounts** · S · core-builder · **Security gate: yes** · Findings AUD-AU1a-12 (note 3) · Verify: SV.
- [x] **R4-13: Split effective policy and the permission validators; named steps in `validateConditions`** · M · core-builder · **Security gate: yes** · Findings AUD-AU1a-12 (note 4) · Verify: SV.
- [x] **R4-14: Named steps in `login` and `bootstrapOwner`** · S · core-builder · **Security gate: yes** · Findings AUD-AU1a-12 (note 1: timing parity, same error for every failure) · Verify: SV, plus the timing-parity test unchanged.
- [x] **R4-15: Named steps in reviewer `createSession`** · S · core-builder · **Security gate: yes** · Findings AUD-AU1a-12 · Verify: SV.
- [x] **R4-16: content-engine: row mapping, component sync, SQL reserved words** · M · core-builder · Findings AUD-AU1b-11 · Verify: SV.
- [x] **R4-17: documents: update steps and bulk errors** · M · core-builder · Findings AUD-AU1b-11 · Verify: SV.
- [x] **R4-18: Admin `CollectionListPage` split** · M · ui-builder · Findings AUD-AU2-12 · Verify: SV.
- [x] **R4-19: Admin `TokenFormBody` submit hook; row components** · M · ui-builder · Findings AUD-AU2-12 · Verify: SV.
- [x] **R4-20: Web reviewer dialog steps** · M · ui-builder · Findings AUD-AU3-12 · Verify: SV.
- [x] **R4-21: Kit `RichtextInput` split** · M · ui-builder · Findings AUD-AU4-12 · Verify: SV.
- [x] **R4-22: Kit `SortableSheet` split** · M · ui-builder · Findings AUD-AU4-13 · Verify: SV.

Test tooling:
- [x] **R4-23: Smoke DB identity exported as E2E vars; one E2E variable list** · S · core-builder · Findings AUD-AU5-01 (scripts part), AUD-AU5-05 · Acceptance: `E2E_DB_CONTAINER`, `E2E_DB_USER` and `E2E_DB_NAME` are resolved from compose. `stack_export_e2e_env` is derived from `E2E_VARS`. Verify: `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke`.
- [x] **R4-24: e2e database runner, env contract test, app-contracts entry** · M · Deps: R4-23 · qc · Findings AUD-AU5-01 (e2e), AUD-AU5-10, AUD-AU5-05 (test), AUD-AU5-04 · Acceptance: `src/smoke-database.ts` keeps `SAFE_NAME` and refuses any host not ending in `.localhost`. `src/env-contract.test.ts` exists. `src/app-contracts.ts` is the only importer of app `src`, enforced by lint. Verify: e2e lint; full smoke.
- [x] **R4-25: e2e API paths, HTTP codes, shared helpers** · M (2 sessions) · Deps: R4-24 · qc · Findings AUD-AU5-06, AUD-AU5-08, AUD-AU5-09, AUD-AU5-15 · Acceptance: `src/api-paths.ts`, one `HTTP`, `signInAs`, `RUN_ID`, slug constants, locators and `inviteAccount`. Lint stops local copies. Verify: full smoke.
- [x] **R4-26: Smoke expected-output file and header comparison** · S · core-builder · Findings AUD-AU5-02 (shell part; do not weaken the HSTS, CSP, cookie or nonce checks) · Verify: smoke.
- [x] **R4-27: Split `smoke.sh` into section files** · M · Deps: R4-26 · core-builder · Findings AUD-AU5-14, AUD-AU5-16 · Verify: smoke; same check order.
- [x] **R4-28: Split the large e2e specs** · M · Deps: R4-25 · qc · Findings AUD-AU5-14 (reviewer, access-admin, content-conflict setup, `fakeMediaApi`) · Verify: full smoke; same test count.
- [x] **R4-29: One reusable app-checks workflow and a pins check** · M · Deps: Q-A6 · core-builder · Findings AUD-AU5-07 (do not touch `_publish.yml` permissions, `secrets: inherit` or environments) · Verify: actionlint; `affected.test.sh`; `pins-check.sh` test.

## Architecture and navigation (CA, CR, DV, SM, FN, MF) — PROPOSED 2026-10-25

User request (handoff "Planner request: cms architecture and side-menu"): (1) cms-api core logic separated from framework parts, clean-architecture style, audit first then refactor; (2) micro-frontend for cms-admin and web, options for the user to pick; (3) cms-api `start:dev` loads `.env.local`; (4) cms-admin side menu instead of the header bar with the user's groups; plus the file-naming rule `<use><PascalName>.<function>.<ext>`.
Designs: `docs/adr/0006-cms-api-clean-architecture-layers.md` (Q-CA1..Q-CA4), `docs/adr/0007-frontend-micro-frontend-approach.md` (Q-MF1..Q-MF3), `docs/adr/0008-file-naming-rule.md` (Q-FN1..Q-FN6), `docs/modules/admin-navigation.md` (Q-SM1..Q-SM4). Questions block only the tasks that name them.
SV (standard verify) is the R-phase SV in "Refactor: Audit fixes" above.

### Phase CA: cms-api clean-architecture audit

Audit run rules: the same as "Audit run rules" in "Ad-hoc: Audit" (read-only, probes in the scratchpad, one findings file per task, counts per check including zero, security-qc notes on proposed fixes in high-risk paths). Findings file: `.claude/state/findings/AUDIT-CA<area>.md`, IDs `AUD-CA<area>-<n>`. Measure against ADR 0006 as proposed; where a Q-CA answer would change a finding, give the fix for both answers.

Layer checks (every CA task):
- L1 Framework imports in core logic: classify every non-spec file as domain / application / adapter / http / wiring / mixed. For each mixed file list the parts and their target layer.
- L2 HTTP errors outside `http/`: every `throw new *Exception` outside controllers, guards and filters, with its HTTP status, its `errorCode` and the proposed `DomainError` kind. Report the full set of kinds needed.
- L3 Persistence outside adapters: every Prisma, Kysely or raw SQL use outside a repository; proposed repository port per aggregate (name, methods). List use cases that need several repositories in one transaction.
- L4 Transport types in core: Express `Request`/`Response`, cookies, headers, `ClientMeta` built from a request, Nest `ExecutionContext` used below `http/`.
- L5 Hidden I/O: `Date.now`/`new Date()` outside `Clock`, `randomUUID`/`randomBytes`, `process.env`, direct library calls (argon2, otplib, jsonwebtoken, cloudinary) in rules that should sit behind a port.
- L6 Rules in the wrong place: business rules inside controllers, guards, middleware, decorators or CLI files.
- L7 Platform split: classify each `common/` file as HTTP pipeline or pure helper; list `infrastructure/` ports used by one module only (candidates to move into that module).
- L8 Target file map: for every file, its target path under ADR 0006 (layer folder plus the ADR 0008 name), and the number of moves. Size the module refactor S/M/L, and propose a task split (one module per task; a large module may take several tasks, one layer each).

- [x] **CA1a: Audit identity and security-audit against ADR 0006** · M · Deps: none · qc, then security-qc · **High-risk paths (read-only) · Security gate: yes** · ADR 0006 · SPEC §2, §7
  - Scope: `apps/cms-api/src/modules/identity/**` (incl. `cli/`, `crypto/`), `apps/cms-api/src/modules/security-audit/**`.
  - Acceptance: `.claude/state/findings/AUDIT-CA1a.md` has an entry or a zero count for L1-L8. Every L2 throw site in login, refresh, OTP, TOTP, password and owner setup is listed with its status and error code. L8 keeps the timing-parity paths (login, setup token compare) named as must-not-change. security-qc adds `Security note:` lines under every proposed fix.
  - Verify: `git status --short` shows only the findings file.
  - Files: `.claude/state/findings/AUDIT-CA1a.md` (write); scope read-only.

- [x] **CA1b: Audit access (core, management, document auth) against ADR 0006** · M · Deps: none · qc, then security-qc · **High-risk paths (read-only) · Security gate: yes** · ADR 0006 · SPEC §2, §7, docs/modules/access-control.md
  - Scope: `apps/cms-api/src/modules/access/**`.
  - Acceptance: as CA1a for this scope, in `AUDIT-CA1b.md`. The record serializer, write allowlist, field projection and guards are each placed in a layer with the reason; L8 states which facade exceptions remain.
  - Verify: `git status --short` shows only the findings file.
  - Files: `.claude/state/findings/AUDIT-CA1b.md` (write); scope read-only.

- [x] **CA2: Audit reviewer and media against ADR 0006** · M · Deps: none · qc, then security-qc · **High-risk paths (read-only) · Security gate: yes** · ADR 0006 · SPEC §2, §7
  - Scope: `apps/cms-api/src/modules/{reviewer,media}/**`, `apps/cms-api/src/infrastructure/media/**`, `apps/cms-api/src/infrastructure/turnstile/**` (L7 only for the two infrastructure folders).
  - Acceptance: as CA1a for this scope, in `AUDIT-CA2.md`; the upload pipeline steps are each placed in a layer.
  - Verify: `git status --short` shows only the findings file.
  - Files: `.claude/state/findings/AUDIT-CA2.md` (write); scope read-only.

- [x] **CA3: Audit documents, graphql, content-types, health against ADR 0006** · M · Deps: none · qc · ADR 0006 · SPEC §2, D10, D18
  - Scope: `apps/cms-api/src/modules/{documents,graphql,content-types,health}/**`.
  - Acceptance: as CA1a for this scope (no security-qc), in `AUDIT-CA3.md`. L8 proposes which of `health` or `content-types` is the pilot module for the pattern, with the reason.
  - Verify: `git status --short` shows only the findings file.
  - Files: `.claude/state/findings/AUDIT-CA3.md` (write); scope read-only.

- [x] **CA4: Audit content-engine and platform (common, config, infrastructure, composition root, contract) against ADR 0006** · M · Deps: none · qc · ADR 0006 · SPEC §2, §5
  - Scope: `apps/cms-api/src/modules/content-engine/**`, `apps/cms-api/src/{common,config,infrastructure,contract}/**`, `main.ts`, `bootstrap.ts`, `app.module.ts`, `app.setup.ts`, `src/architecture/**` (to reuse `import-graph.ts`).
  - Acceptance: as CA1a for this scope, in `AUDIT-CA4.md`. L7 is complete for every `common/` and `infrastructure/` file. The proposed `layers.architecture.spec.ts` and `LAYER_RULES` shape is checked against `import-graph.ts` (can it tell layers apart by path today?).
  - Verify: `git status --short` shows only the findings file.
  - Files: `.claude/state/findings/AUDIT-CA4.md` (write); scope read-only.

- [x] **CA5: Consolidate the CA findings and write the refactor tasks** · M · Deps: CA1a, CA1b, CA2, CA3, CA4, Q-CA1..Q-CA4 (and Q-FN1, Q-FN2 for file names) · planner (`REPLAN CA5`) · ADR 0006
  - Acceptance: ADR 0006 status set to accepted with the answers; SPEC §2/§5 update written as a task (or done, if the user asks); refactor tasks `CR-xx` written in a new "Phase CR" in todo.md and plan.md: first the platform task (`DomainError`, `DOMAIN_ERROR_HTTP_STATUS`, `LAYER_RULES`, `layers.architecture.spec.ts` with `KNOWN_LAYER_VIOLATIONS`), then the pilot module, then one module (or one layer of a large module) per task, high-risk modules last with `Security gate: yes`. Dropped findings are listed with reasons.
  - Verify: the user approves the CR task list.
  - Files: `tasks/todo.md`, `tasks/plan.md`, `docs/adr/0006-cms-api-clean-architecture-layers.md`.

### Phase DV: cms-api local start

Open questions (user): **Q-DV1** watch mode: recommended yes, with no new dependency (`tsc --watch` in the background plus `node --watch-path=dist`); alternative: build once and run, restart by hand. **Q-DV2** root scripts: recommended a new `start:cms-api:dev` and root `start:dev` also starts cms-api (one command for the full local stack, needs a local Postgres); alternative: root `start:dev` stays admin + web only.

- [x] **DV1: cms-api `start:dev` reads `.env.local`** · S · Deps: Q-DV1 · core-builder · user decision (handoff): cms-api loads `.env.local` for `start:dev` · SPEC §4
  - Design: Node 24 `--env-file-if-exists=.env.local` on the `start:dev` command only. The app code still reads `process.env` only (`config/`, `main.ts` unchanged), so production and the smoke stack never load a file. A variable already set in the shell wins over the file (Node behaviour). No new dependency.
  - Acceptance:
    - `apps/cms-api/package.json` has `start:dev`: build once with `tsc -p tsconfig.build.json`, then run `dist/main.js` with `--env-file-if-exists=.env.local`; with watch per Q-DV1 (recommended: `tsc --watch --preserveWatchOutput` in the background and `node --watch-path=dist`).
    - Root `package.json`: `start:cms-api:dev` runs it (or root `start:dev` includes cms-api, per Q-DV2).
    - Without `.env.local` the command still starts and fails only on the config check, listing keys (unchanged message).
    - `docs/local-run.md` and `apps/cms-api/README.md` describe `.env.local` (copy from `.env.example`), and state that `db:migrate`, the CLIs and production still read the shell env only. `apps/cms-api/.env.example` header names `.env.local` for `start:dev`.
  - Verify: SV for cms-api (lint, typecheck, unit). Manual: with a scratch `.env.local` holding a test `PORT`, `pnpm --filter @abyss/cms-api start:dev` logs `Listening on port <that port>` (the builder never reads the user's real `.env.local`; it creates a throwaway one only if none exists, and removes it after asking). `grep -rn "env-file" apps/cms-api/src` returns nothing.
  - Files: `apps/cms-api/package.json`, `package.json`, `docs/local-run.md`, `apps/cms-api/README.md`, `apps/cms-api/.env.example`.
  - Superseded in part: the watch design above was replaced by DV1b (commit 5c50f23, `nest start --watch`), and the remaining NestJS CLI defaults are DV1c (ADR 0009).

- [x] **DV1c: cms-api uses the NestJS CLI build, start and tsconfig defaults** · S · Deps: DV1b (5c50f23), Q-NC1..Q-NC3 · core-builder · ADR 0009 · user decision (handoff 2026-10-25): all NestJS CLI defaults · SPEC §4
  - Design: `docs/adr/0009-cms-api-nestjs-cli-defaults.md` (script table, tsconfig, what is not adopted). Package config only; no application code, Dockerfile, smoke, CI, turbo or root `package.json` change.
  - Acceptance:
    - `apps/cms-api/package.json`: `build` = `nest build`; `start` = `nest start`; `start:prod` = `node dist/main`; `start:debug` = `nest start --debug --watch` with the same `--exec "node --env-file-if-exists=.env.local"` as `start:dev` (per Q-NC3); `content:generate`, `graphql:print-schema`, `contract:print` start with `nest build &&` instead of `tsc -p tsconfig.build.json &&`. `start:dev` and `dev` unchanged. No other script changes.
    - `@nestjs/schematics` added as a devDependency pinned to the version already in `pnpm-lock.yaml` (per Q-NC2); `nest-cli.json` unchanged.
    - `apps/cms-api/tsconfig.json`: still extends `../../tsconfig.base.json` with the same `include`; adds `removeComments: true` and `incremental: true`; `strictPropertyInitialization` not turned off (per Q-NC1).
    - `apps/cms-api/tsconfig.build.json`: `rootDir: ./src`, `include: ["src"]`, `exclude: ["node_modules", "test", "dist", "**/*spec.ts"]`, keeps `types: ["node"]`.
    - `grep -n "tsc" apps/cms-api/package.json` matches only `typecheck`.
    - `apps/cms-api/README.md` (Run section and Scripts table: `build`, `start`, `start:dev`, `start:debug`, `start:prod`) and `docs/local-run.md` describe the scaffold scripts; both still say only `start:dev` / `start:debug` load `.env.local`.
  - Verify:
    - Before the change, `pnpm --filter @abyss/cms-api build && (cd apps/cms-api && find dist -name '*.js' | sort) > <scratchpad>/tsc-files.txt`; after it, `rm -rf apps/cms-api/dist && pnpm --filter @abyss/cms-api typecheck && pnpm --filter @abyss/cms-api build`, then `test -f apps/cms-api/dist/main.js` and the same `find` list equals `tsc-files.txt`.
    - `pnpm --filter @abyss/cms-api exec nest info` (or the build log) shows TypeScript 6.0.3.
    - SV for cms-api: lint, typecheck, `test:unit`; `content:generate -- --check`, `graphql:print-schema -- --check`, `contract:print -- --check` pass (CI parity).
    - `docker build -f apps/cms-api/Dockerfile .` succeeds and the image starts `node dist/main.js` (smoke stack: `SMOKE_E2E=1 pnpm smoke` green, or at least `SMOKE_KEEP=1 pnpm smoke` brings cms-api healthy; the builder asks before a full smoke run if Docker time is a concern).
    - Manual: `start:debug` with a scratch `.env.local` (same rule as DV1: never read the user's real file) logs the inspector URL and `Listening on port <that port>`.
  - Files: `apps/cms-api/package.json`, `apps/cms-api/tsconfig.json`, `apps/cms-api/tsconfig.build.json`, `pnpm-lock.yaml`, `apps/cms-api/README.md`, `docs/local-run.md`.

### Phase SM: cms-admin side menu

Design: `docs/modules/admin-navigation.md`. Builder: ui-builder (SM1-SM3), qc (SM4). UI work follows ui-direction and uses semantic tokens only.

- [x] **SM1: Nav sections in the feature contract** · S · Deps: none · ui-builder · docs/modules/admin-navigation.md · SPEC §2 frontend directions
  - Acceptance: `FeatureNavItem` gains `section: NavSectionId`; `Feature` gains optional `useNavItems`. New `lib/nav-sections.ts` exports `NAV_SECTIONS` (content with sub-sections `singleTypes`, `collectionTypes`; `utilities`; `systemSettings`) and `NavSectionId`. `access` (accounts, roles, API tokens), `reviewer` -> `systemSettings`; `media` -> `utilities`. `NAV_COPY` gains the section labels. The header still renders as today (no visual change in this task). A unit test fails when a nav item names a section missing from `NAV_SECTIONS`.
  - Verify: SV for cms-admin.
  - Files: `apps/cms-admin/src/lib/feature-definition.tsx`, `src/lib/nav-sections.ts` (new) + test, `src/features/{access,media,reviewer}/feature.ts`, `src/config/copy/common.copy.ts`, `src/config/copy/copy.snapshot.json`.

- [x] **SM2: Content-type nav items from the catalog** · M · Deps: SM1, Q-SM1 · ui-builder · docs/modules/admin-navigation.md
  - Acceptance: `features/content` exports `useContentNavItems` through `contentFeature.useNavItems`: one item per content type the caller may read (same check as `CollectionListPage`: the slug or the content wildcard subject), `section` from `kind` (`single` -> `singleTypes`, `collection` -> `collectionTypes`), label from the type's display name or slug, path `contentListPath(slug)`. The kind-to-section map is one constant in `content.constants.ts`. Per Q-SM1 (recommended, planned change): `/content/:slug` for a `single` type opens its one document's edit form, or the create form when there is none. Query keys come from `*-queries.ts`.
  - Verify: SV; unit tests for the kind mapping, the permission filter, and the single-type redirect (with and without an existing document).
  - Files: `apps/cms-admin/src/features/content/{feature.ts,content.constants.ts,CollectionListPage.tsx}`, a new hook file in `features/content/` + test, `src/config/copy/content.copy.ts` (if new text).

- [x] **SM3: Side-menu layout** · M · Deps: SM1, SM2, Q-SM2, Q-SM3, Q-SM4 · ui-builder · docs/modules/admin-navigation.md · ui-direction
  - Acceptance: `app/AppShell.tsx` renders the side menu at `md` and up and a top bar with a Menu button and a kit `Dialog` sheet below `md`, as in the design doc: sections and sub-headings from `NAV_SECTIONS`, empty sections hidden, active link with `aria-current="page"`, user block at the bottom (per Q-SM3), skeleton rows while permissions or the catalog load, one-line error with Retry for the catalog. The nav landmark keeps `aria-label={COPY.access.nav.label}`. Labels per Q-SM2. Tokens only, no raw values; no decorative icons.
  - Verify: SV; component tests for: owner sees all three sections; a reader without system rights sees no System settings section; a reviewer sees no Security settings link; the mobile sheet opens, closes on Esc and on link choice. Browser walk on a kept smoke stack at 375, 768 and 1280 px widths: focus visible, AA contrast on links and headings, no console errors.
  - Files: `apps/cms-admin/src/app/AppShell.tsx`, `src/app/SideMenu.tsx` (new), `src/app/MobileMenu.tsx` (new), their tests, `src/config/copy/common.copy.ts`, `copy.snapshot.json`.

- [x] **SM4: e2e for the side menu** · S · Deps: SM3 · qc · docs/modules/admin-navigation.md
  - Acceptance: e2e specs that use the admin nav (`feature-registry`, `access-admin`, `access-admin-limited`, `api-tokens`, `media-library`, `reviewer-dialog`) pass against the side menu; `feature-registry.spec.ts` asserts the section headings and item order for owner and for a limited role, and one test opens the mobile menu at 375 px. Same test count or more.
  - Verify: `pnpm e2e:spec` per changed spec on a kept stack, then full `SMOKE_E2E=1 pnpm smoke`.
  - Files: the specs above under `apps/e2e/tests/`.

### Phase FN: file naming rule

Revised 2026-10-26 (REPLAN FN1, then the user answers Q-FN7..Q-FN11): folders kebab-case; files `<PascalName>.<function>.<ext>` when a word is needed, otherwise `<PascalName>.<ext>` (React components never take a word); hooks `use<PascalName>.<query | mutation | state>.<ext>`; several hooks of one feature `<Feature>.queries.ts`. The "needed" test is in ADR 0008 "When a file needs a function word". Rule and word table: SPEC §5; decision, guard and rename procedure: ADR 0008. CR is closed, so the renames that Q-FN2 put into CR tasks are tasks here. Order inside a package: cms-api and base-config already have guards, so their rename tasks shrink `KNOWN_FILE_NAME_EXCEPTIONS`; the other packages rename first and add the guard last, with no exception list. Packages are independent: the core-builder chain (FN1r, FN-api-1..4, FN-bc-1), the ui-builder chain (FN-kit-1, FN1b-kit, FN-web-1, FN-web-2, FN1b-web, FN-ad-1..5, FN1b-admin) and the qc chain (FN-e2e-1, FN1c) may run in parallel.

Rules for every rename task (ADR 0008 "Renaming"): one commit; `git mv` (two steps through a temporary name for a case-only change) plus path edits only: imports, pinned-path constants, ESLint and test-runner globs, setup-file paths, `package.json` scripts and exports, `scripts/`, docs. No other content change; exported identifiers and package export subpaths stay. Before moving, the builder writes the full old -> new map into the unit record, applying the ADR 0008 "needed" test; a file no row fits is named `<PascalName>.<ext>` and listed in the report for the planner. Types-only and re-export-only files are merged into their nearest neighbour inside the task (Q-FN10); the task report lists every merged-away file, and these whole-file deletions are approved together with the task (user answer 2026-10-26). Expected `git diff -M --stat`: renames only, plus the path-edit lines.

- [x] **FN1: SPEC §5 naming rule and per-package guards (core part)** · M · core-builder · ADR 0008 · SPEC §5 · committed 0b03efe (cms-api `file-names.architecture.spec.ts` + `file-names.constants.ts`, base-config `test/file-names.test.ts`). The SPEC §5 part is done by the planner (REPLAN FN1, 2026-10-26). The old FN1b / FN1c split is replaced by the tasks below.

- [x] **FN1r: Revise the cms-api file-name guard to the 2026-10-26 rule** · S · Deps: FN1 · core-builder · ADR 0008 "Guard" · SPEC §5
  - Acceptance: the guard is `src/architecture/FileNames.architecture.spec.ts` with `src/architecture/FileNames.constants.ts` (renamed from the kebab-case files). `ARCHITECTURE_SPEC_NAME` and `TOOL_CONFIG_SUFFIX` are removed (no kebab-case or `*.config.ts` shape is accepted under `src/` or `test/`). `FILE_FUNCTION_WORDS` adds the approved cms-api words (`architecture`, `analyzer`, `integration`, `contract`, `schema`). New check: every folder under `src/` and `test/` (except `src/generated`) matches `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. Every file that now fails (the kebab-case `*.architecture.spec.ts` files) is added to `KNOWN_FILE_NAME_EXCEPTIONS`; stale entries still fail. The shape self-test accepts `ImportGraph.architecture.spec.ts`, `Auth.integration.spec.ts` and rejects `import-graph.architecture.spec.ts`, `Richtext.config.ts`, a wordless `AccessPolicy.ts` (cms-api requires a word), a `BadFolder/` folder; it accepts the test variant `Auth.service.refresh.spec.ts`. `apps/cms-api/README.md` naming lines match.
  - Verify: `pnpm --filter @abyss/cms-api test:unit -- FileNames`, lint, typecheck; a scratch `src/modules/health/bad-name.ts` and a scratch folder `src/modules/health/BadFolder/` each fail the guard (removed after).
  - Files: `apps/cms-api/src/architecture/FileNames.architecture.spec.ts`, `apps/cms-api/src/architecture/FileNames.constants.ts` (both `git mv`), `apps/cms-api/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-api-1: Rename cms-api `src/architecture/`** · M · Deps: FN1r · core-builder · ADR 0008 · SPEC §5
  - Acceptance: the 26 remaining files under `src/architecture/` follow the rule (structure guards `<Topic>.architecture.spec.ts`, readers `<Topic>.analyzer.ts`, constants `<Topic>.constants.ts`; for example `import-graph.ts` -> `ImportGraph.analyzer.ts`, `layer-rules.constants.ts` -> `LayerRules.constants.ts`). Their entries leave `KNOWN_FILE_NAME_EXCEPTIONS`. Every spec that imports or pins these paths is updated. No merge of the architecture constants files in this task (§4.4 merges are a separate decision).
  - Verify: `pnpm --filter @abyss/cms-api test:unit` (architecture count unchanged), lint, typecheck; `git diff -M --stat` shows renames.
  - Files: `apps/cms-api/src/architecture/**`, `apps/cms-api/eslint.config.mjs` if it names these files.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-api-2: Rename cms-api platform files (root, `common/`, `config/`, `contract/`, `infrastructure/`)** · M · Deps: FN-api-1 · core-builder · ADR 0008 · SPEC §5
  - Acceptance: the 53 listed files follow the rule (for example `app.module.ts` -> `App.module.ts`, `app.setup.ts` -> `App.setup.ts`, `bootstrap.ts` -> `Bootstrap.setup.ts`, `env.schema.ts` -> `Env.schema.ts`, `prisma.service.ts` -> `Prisma.service.ts`, `smtp-mail.sender.ts` -> `SmtpMail.adapter.ts`, `request-id.middleware.ts` -> `RequestId.middleware.ts`, `print-public-constants.ts` -> `PrintPublicConstants.command.ts`); `main.ts` stays. Their entries leave the exception list. `contract:print` in `package.json` points at the new dist path. Pinned paths (`source-paths.constants`, `layer-rules.constants`, `module-edges.constants`, `common-ownership` guard) and `eslint.config.mjs` exceptions follow.
  - Verify: unit, lint, typecheck, `pnpm --filter @abyss/cms-api build` then `contract:print --check`; integration `http-pipeline`, `security-headers`, `rate-limit`, `cors`, `route-snapshot`; tier 3 smoke (env schema and HTTP pipeline files move).
  - Files: `apps/cms-api/src/{*.ts,common,config,contract,infrastructure}/**`, `apps/cms-api/package.json`, `apps/cms-api/eslint.config.mjs`, pinned-path constants under `src/architecture/`, `apps/cms-api/README.md`, `docs/modules/*.md` lines that name these paths.
  - Checks: qc tier 3 (cms-api env schema path). Risk: normal. Do not run in parallel with a task on `security-headers.middleware.ts` (the open API security-headers decision).

- [x] **FN-api-3: Rename cms-api module files left from CR** · S · Deps: FN-api-2 · core-builder · Security gate: yes · ADR 0008 · SPEC §5
  - Acceptance: the 15 module entries in the exception list (13 today plus the two module `*.architecture.spec.ts` files FN1r adds) follow the rule: `access/domain/PolicyEvaluator.ts` -> `PolicyEvaluator.rules.ts`, `RecordSerializer.ts` -> `RecordSerializer.rules.ts` (and their specs), `access/domain/AccessErrorBodies.spec.ts` -> `AccessErrorBodies.contract.spec.ts`, `access/record-serializer.architecture.spec.ts` -> `access/RecordSerializer.architecture.spec.ts`, `identity/auth-constants.pin.spec.ts` -> `identity/AuthConstants.contract.spec.ts`, `media/adapters/Storage.adapters.spec.ts` -> `Storage.adapter.spec.ts`, `content-engine/cli/generate.ts` -> `ContentGenerate.command.ts`, `migrate.ts` -> `ContentMigrate.command.ts`, `graphql/cli/print-schema.ts` -> `PrintSchema.command.ts` (and specs), `graphql/graphql.architecture.spec.ts` -> `Graphql.architecture.spec.ts`, `content-types/domain/ContentTypeView.contract.spec.ts` stays if `contract` is approved (entry removed). `content:generate`, `content:migrate`, `graphql:print-schema` scripts, `scripts/dev-stack.sh`, `scripts/smoke/owner-setup.sh` and `docs/modules/content-schema.md` point at the new dist paths.
  - Verify: unit, lint, typecheck; `content:generate --check`, `graphql:print-schema --check`; integration `content-migrations`, `accounts-roles`, `media`; tier 3 smoke with e2e (the `content:migrate` CLI runs in the stack).
  - Files: the 15 files above (paths under `apps/cms-api/src/modules/{access,identity,media,content-engine,graphql,content-types}/`), `apps/cms-api/package.json`, `scripts/dev-stack.sh`, `scripts/smoke/owner-setup.sh`, `docs/modules/content-schema.md`, `apps/cms-api/README.md`, pinned paths under `src/architecture/`.
  - Checks: qc tier 3 (content:migrate CLI), security-qc (access, identity, media paths). Risk: high. Do not run in parallel with the dev-stack port-readiness follow-up (`scripts/dev-stack.sh`).

- [x] **FN-api-4: Rename cms-api `test/` and remove the exception list** · M · Deps: FN-api-3 · core-builder · ADR 0008 · SPEC §5
  - Acceptance: the 49 files under `test/` follow the rule: integration suites `<Topic>.integration.spec.ts` (`auth.spec.ts` -> `Auth.integration.spec.ts`), fixtures `<Topic>.fixture.ts` (`multipart.ts` -> `Multipart.fixture.ts`, `test-app.ts` -> `TestApp.fixture.ts`), runner hooks `.setup.ts` (`global-setup.ts` -> `SharedPostgresStart.setup.ts`, `global-teardown.ts` -> `SharedPostgresStop.setup.ts`, `jest.setup.ts` -> `Jest.setup.ts`; ADR 0008 "Word choices confirmed by the planner"; the teardown's `import './global-setup'` follows). The Jest project config (test match, global setup and teardown, setup files) follows. `KNOWN_FILE_NAME_EXCEPTIONS` is empty, so it and its stale-entry test are removed from the guard.
  - Verify: unit and full integration (suite and test counts unchanged), lint, typecheck; the guard passes with no exception list.
  - Files: `apps/cms-api/test/**`, the Jest config (`apps/cms-api/package.json` or `jest.config.*`), `apps/cms-api/src/architecture/FileNames.architecture.spec.ts`, `FileNames.constants.ts`, specs that import fixtures, `apps/cms-api/README.md`.
  - Checks: qc-cli tier 1 (integration included). Risk: normal.

- [x] **FN-bc-1: Revise the base-config guard and rename base-config** · S · Deps: FN1 · core-builder · ADR 0008 · SPEC §5
  - Acceptance: `src/eslint.ts`, `src/oxlint.ts`, `src/prettier.ts` -> `src/Eslint.setup.ts`, `src/Oxlint.setup.ts`, `src/Prettier.setup.ts`; `test/config.test.ts` -> `test/Configs.setup.test.ts`; the guard `test/file-names.test.ts` -> `test/FileNames.architecture.test.ts` with the 2026-10-26 checks (no `*.config.ts` exemption, folder check, `architecture` word, word optional per ADR 0008, test variant) and no exception list. `package.json` exports keep the subpaths `./prettier`, `./eslint`, `./oxlint` and point at the new `dist/` files.
  - Verify: `pnpm --filter @abyss/base-config build test`; root `pnpm lint` and `pnpm format:check` (every package loads these configs); a scratch `src/bad-name.ts` fails the guard.
  - Files: `packages/base-config/src/*.ts`, `packages/base-config/test/*.ts`, `packages/base-config/package.json`, `packages/base-config/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-kit-1: Rename form-commons folders and files** · M · Deps: none · ui-builder · ADR 0008 · SPEC §5
  - Acceptance: the 15 component folders are kebab-case (`BulkActionBar/` -> `bulk-action-bar/`); every file under `src/` and `test/` follows the rule (component files keep `<ComponentName>.tsx`: `BulkActionBar/BulkActionBar.tsx` -> `bulk-action-bar/BulkActionBar.tsx`, `ui/button.tsx` -> `ui/Button.tsx`, `ui/native-select.tsx` -> `ui/NativeSelect.tsx`; `richtext.config.ts` -> `Richtext.setup.ts`, `richtext.styles.ts` -> `Richtext.styles.ts`, `use-row-selection.ts` -> `useRowSelection.state.ts`, `field-wiring.ts` -> `FieldWiring.setup.ts`, `public-api.snapshot.ts` -> `PublicApi.snapshot.ts`, `architecture.spec.ts` -> `KitBoundaries.architecture.test.ts`, `public-api.spec.ts` -> `PublicApi.snapshot.test.ts`); the types-only `sortable-sheet.types.ts` is merged into `SortableSheet.tsx`; the per-control `index.ts` facades keep their name. Public API unchanged: the public-API snapshot test passes without a snapshot change. `architecture` guard paths (`FIELD_WIRING_FILE`, `CONTROL_CONSTANTS_FILE`), `vitest.config.ts` setup file and include, tsup entry follow. README notes that files from `shadcn add` are renamed to the rule.
  - Verify: `pnpm --filter @abyss/form-commons lint typecheck test build`; `pnpm --filter @abyss/cms-admin build` and `pnpm --filter @abyss/web build` (consumers).
  - Files: `packages/form-commons/src/**`, `packages/form-commons/test/**`, `packages/form-commons/vitest.config.ts`, `packages/form-commons/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN1b-kit: form-commons file-name guard** · S · Deps: FN-kit-1 · ui-builder · ADR 0008 "Guard"
  - Acceptance: `packages/form-commons/src/FileNames.architecture.test.ts` checks files and folders under `src/` and `test/` per ADR 0008 (words, hook words with `use`, framework names, kebab folders) with no exception list.
  - Verify: package test; a scratch `src/components/ui/bad-name.tsx` and a scratch folder `src/components/forms/BadFolder/` each fail.
  - Files: `packages/form-commons/src/FileNames.architecture.test.ts`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-web-1: Rename web files** · M · Deps: none · ui-builder · Security gate: yes · ADR 0008 · SPEC §5
  - Acceptance: every file under `apps/web/src` and `test/` follows the rule; Next.js route files, `proxy.ts`, `instrumentation.ts`, `next-env.d.ts` stay. Examples: `env.server.ts` -> `Server.env.ts`, `env.client.ts` -> `Browser.env.ts`, `endpoints.ts` -> `Api.endpoints.ts`, `instrumentation-node.ts` -> `InstrumentationNode.setup.ts`, `content-security-policy.ts` -> `ContentSecurityPolicy.rules.ts`, `reviewer.queries.ts` -> `Reviewer.queries.ts`, `turnstile.ts` -> `Turnstile.client.ts`, `use-human-check.tsx` -> `useHumanCheck.state.tsx`, components keep their names (`AccountMenu.tsx`, `CspNonce.tsx`, and the tests `AccountMenu.login.test.tsx` etc. already fit the variant rule); `providers.tsx` -> `AppProviders.tsx` (a component), `web-session.tsx` -> `WebSession.context.tsx`. The `instrumentation.ts` dynamic import, the vitest setup and `server-only` stub alias, `src/architecture.test.ts` paths (-> `FeatureTiers.architecture.test.ts`) and ESLint globs follow.
  - Verify: `pnpm --filter @abyss/web lint typecheck test build` (standalone build); tier 2 dev stack: `E2E_STACK=dev pnpm e2e:spec` for `web-session`, `reviewer-session`, `reviewer-dialog`, `edge-routing`; CSP header and nonce unchanged on `/` (curl).
  - Files: `apps/web/src/**`, `apps/web/test/**`, `apps/web/vitest.config.ts`, `apps/web/eslint.config.mjs`, `apps/web/README.md`.
  - Checks: qc tier 2 plus the web production build, security-qc (`apps/web/src/features/auth`, CSP files). Risk: high. Run before T30 (CV page), or T30 names its files by the rule.

- [x] **FN-web-2: Drop the repeated `Error` from the web reviewer error file name** · S · Deps: FN-web-1 · ui-builder · ADR 0008 "Word choices confirmed by the planner (FN-ad-3)" · SPEC §5
  - Acceptance: `apps/web/src/features/reviewer/ReviewerError.errors.ts` -> `Reviewer.errors.ts` and its test -> `Reviewer.errors.test.ts`, via `git mv`; only import specifiers change (`ReviewerAccessDialog.tsx`, the moved test, and any other importer the type-check finds). Exported identifiers are unchanged. `git diff -M --stat` shows 2 renames.
  - Verify: `pnpm --filter @abyss/web lint typecheck test build`; `git grep -n "Error.errors" apps/web` is empty.
  - Files: `apps/web/src/features/reviewer/**`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN1b-web: web file-name guard** · S · Deps: FN-web-1, FN-web-2 · ui-builder · ADR 0008 "Guard"
  - Acceptance: `apps/web/src/FileNames.architecture.test.ts` per ADR 0008, Next.js framework file and folder names listed, no exception list.
  - Verify: package test; a scratch bad file and a scratch `BadFolder/` fail; a scratch `src/app/[slug]/page.tsx` passes.
  - Files: `apps/web/src/FileNames.architecture.test.ts`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-ad-1: Rename cms-admin shell (`app/`, `config/`, `lib/`, `components/`, `test/`)** · M · Deps: none · ui-builder · ADR 0008 · SPEC §5
  - Acceptance: the about 63 files under `src/app`, `src/config` (incl. `copy/`), `src/lib`, `src/components`, `test/` and `src/architecture.test.ts` follow the rule (`store.ts` -> `App.store.ts`, `query-client.ts` -> `QueryClient.setup.ts`, `app-routes.tsx` -> `AppRoutes.setup.tsx` (revised by DESIGN FN-ad-1-words, below), `env.ts` -> `App.env.ts`, `endpoints.ts` -> `Api.endpoints.ts`, `api-client.ts` -> `Api.client.ts`, `use-clamped-page.ts` -> `useClampedPage.state.ts`, `create-api-context.tsx` -> `ApiContext.setup.tsx`, `architecture.test.ts` -> `FeatureTiers.architecture.test.ts`, `test/setup.ts` -> `Vitest.setup.ts`, `render-app.tsx` -> `RenderApp.fixture.tsx`); `main.tsx`, `vite-env.d.ts` and the components (`AppShell.tsx`, `SideMenu.tsx`, `Modal.tsx`, `Pagination.tsx`) keep their names; the types-only `lib/api-types.ts` is merged into `Api.client.ts`; `config/copy/index.ts` stays (facade). ESLint globs and boundary groups (`**/lib/api-client`, `src/lib/date-format.ts`, `src/config/copy/*.copy.ts`), `vite.config.ts` setup file follow.
  - Verify: `pnpm --filter @abyss/cms-admin lint typecheck test build`; tier 2: `E2E_STACK=dev pnpm e2e:spec` for `side-menu`, `admin-auth`, `feature-registry`.
  - Files: `apps/cms-admin/src/{app,config,lib,components}/**`, `apps/cms-admin/src/architecture.test.ts`, `apps/cms-admin/test/**`, `apps/cms-admin/vite.config.ts`, `apps/cms-admin/eslint.config.mjs`, `apps/cms-admin/README.md`.
  - Checks: qc tier 2. Risk: normal. The side-menu a11y follow-up (SideMenu) runs before or after this task, not in parallel.
  - Word decisions (DESIGN FN-ad-1-words, 2026-10-26; no rule change, ADR 0008 and SPEC §5 unchanged):
    - `config/App.routes.ts` keeps its name: the UI path map, the `routes` row and its ADR/SPEC example; 37 importers and `conventions.md` name it.
    - `app/App.routes.tsx` -> `app/AppRoutes.setup.tsx`, its test -> `app/AppRoutes.setup.test.tsx`. It holds no path map: it assembles the feature registry into the router's `RouteObject` tree, i.e. composition-root wiring, which is the `setup` row, the same as its neighbour `AppServices.setup.ts` (assembles the feature API services). The base name names the export (`appRoutes`). This removes the second `App.routes` in the package, so `./App.routes` and `../config/App.routes` no longer read alike. Path edits only: `app/App.tsx` import, the test's import, `apps/cms-admin/README.md` line naming `app/App.routes.tsx`. Done in this task's fix loop (not yet committed), two-step `git mv` is not needed (not a case-only change).
    - `lib/FeatureDefinition.tsx` is confirmed without a word (ADR 0008 step 5, same reasoning as `RichtextToolbar.ts`). It holds the `Feature` contract types plus `defineApiService` (JSX). No row's "Holds" fits: `feature` is one feature's `Feature` value inside `features/<f>/` (`Media.feature.ts`) and must stay the glob-selectable feature entry; `contract` is values pinned across packages; `setup` is `ApiContext.setup.tsx` next to it; types-only does not apply (it has a function). No tool, guard or glob selects it and no same-named file sits in `lib/`. Not merged into `ApiContext.setup.tsx` (that file is the per-feature React context factory, a different responsibility).

- [x] **FN-ad-2: Rename cms-admin `features/auth` and `features/security`** · M · Deps: FN-ad-1 · ui-builder · Security gate: yes · ADR 0008 · SPEC §5
  - Acceptance: the 59 files follow the rule (`auth.slice.ts` -> `Auth.slice.ts`, `auth-interceptor.ts` -> `Auth.interceptor.ts`, `use-current-user.ts` -> `useCurrentUser.state.ts` (revised by DESIGN FN-ad-2-words, below), `single-flight.ts` -> `SingleFlight.rules.ts`, `session-context.tsx` -> `Session.context.tsx`, `feature.ts` -> `Auth.feature.ts`, `auth-hooks.ts` (one hook) -> `useAuthSelector.state.ts` (revised, below); `LoginPage.tsx`, `TwoFactorModal.tsx`, `CrossTabRefresh.ts`, `Session.ts` keep a name without a word). The `app-wiring` ESLint ban and `use-setup-status.ts` query-key owner glob follow.
  - Verify: package lint, typecheck, test, build; tier 2: `admin-auth`, `owner-setup`, `password-reset`, `two-factor`, `admin-session-retry`, `admin-tabs` specs.
  - Files: `apps/cms-admin/src/features/{auth,security}/**`, `apps/cms-admin/eslint.config.mjs`, importers elsewhere in `apps/cms-admin/src`.
  - Checks: qc tier 2, security-qc. Risk: high.
  - Word decisions (DESIGN FN-ad-2-words, 2026-10-26; recorded in ADR 0008 "Word choices confirmed by the planner (FN-ad-2)", SPEC §5 `query`/`state` row sharpened):
    - `useAuthSelector.state.ts` confirmed (one hook that reads the Redux store; not `Auth.queries.ts`, which means the feature's TanStack keys and hooks). The `AuthRootState` type stays in it.
    - `useCurrentUser.query.ts` -> `useCurrentUser.state.ts`: it reads the Redux store synchronously, with no query key and no fetch. Path edits only: the `git mv` and the import in `features/auth/index.ts` (no other importer names the path). Done in this task's fix loop; not a case-only change, so one `git mv`.
    - `CrossTabRefresh.ts` and `Session.ts` confirmed without a word (step 5; no row fits, and no tool or glob selects them).
    - The hook files stay separate despite being under 30 lines (one hook per `use` file); no merges beyond Q-FN10 in a rename task.

- [x] **FN-ad-3: Rename cms-admin `features/access`, `media`, `content-types`, `reviewer`, `status`** · M · Deps: FN-ad-2 · ui-builder · ADR 0008 · SPEC §5
  - Acceptance: the about 70 files follow the rule (`access-queries.ts` -> `Access.queries.ts`, `access-api-context.tsx` -> `AccessApi.context.tsx`, `account-columns.tsx` -> `Account.columns.tsx`, `use-token-submit.ts` -> `useTokenSubmit.mutation.ts`, `token-expiry.ts` -> `TokenExpiry.rules.ts`). `architecture.test` `MATRIX_FILES` and the `*-queries.ts` ESLint glob follow.
  - Verify: package lint, typecheck, test, build; tier 2: `access-admin`, `access-admin-limited`, `api-tokens`, `media-library`, `media-attach`, `reviewer-session`, `status-card` specs.
  - Files: `apps/cms-admin/src/features/{access,media,content-types,reviewer,status}/**`, `apps/cms-admin/eslint.config.mjs`, `apps/cms-admin/src/architecture.test.ts` (renamed name from FN-ad-1).
  - Checks: qc tier 2. Risk: normal.
  - Word decisions (DESIGN FN-ad-3-words, 2026-10-26; recorded in ADR 0008 "Word choices confirmed by the planner (FN-ad-3)", SPEC §5 naming bullet and `query` row sharpened; no file of this task moves again):
    - `caller-access.ts` -> `useCallerAccess.query.ts` confirmed. Its data is the `GET /roles` TanStack answer read through `useRolesQuery`, and `isReady` passes on that query's pending state. It owns no key, so it is not in `Access.queries.ts` or `QUERY_KEY_OWNERS`. The `CallerAccess` type and pure `callerAccessOf` stay in the file.
    - Error files are `<Feature>.errors.ts` (or `<Flow>.errors.ts` when a feature has several); the base name never repeats the word. `Access.errors.ts` and `Media.errors.ts` are kept. FN-ad-2's `*Error.errors.ts` files move in FN-ad-5, and web's `ReviewerError.errors.ts` moves in FN-web-2.

- [x] **FN-ad-4: Rename cms-admin `features/content` and the feature registry** · M · Deps: FN-ad-3 · ui-builder · ADR 0008 · SPEC §5
  - Acceptance: the 44 files in `features/content` plus `features/registry.ts` (-> `Features.registry.ts`) and `features/nav-items.test.ts` follow the rule (`merge.reducer.ts` -> `Merge.reducer.ts`, `merge.tree.ts` -> `MergeTree.rules.ts`, `field-registry.tsx` -> `Field.registry.tsx`, `document-form.ts` -> `Document.form.ts`, `use-bulk-run.ts` -> `useBulkRun.mutation.ts`, `content-queries.ts` -> `Content.queries.ts`, `content-error.ts` -> `Content.errors.ts` (DESIGN FN-ad-3-words: the base name never repeats the word)). The explicit `'src/features/content/content-queries.ts'` line in `QUERY_KEY_OWNERS` (`eslint.config.mjs`) is deleted because the `src/**/*.queries.ts` glob covers the new name.
  - Verify: package lint, typecheck, test, build; tier 2: `content-*`, `collection-list-display`, `document-values`, `list-query-limits`, `richtext-toolbar` specs.
  - Files: `apps/cms-admin/src/features/content/**`, `apps/cms-admin/src/features/*.ts(x)`, `apps/cms-admin/eslint.config.mjs`, `apps/cms-admin/README.md`.
  - Checks: qc tier 2. Risk: normal.
  - Word decisions (DESIGN FN-ad-4-words, 2026-10-26; no rule change, ADR 0008 and SPEC §5 unchanged):
    - `BulkBanner.rules.ts`, `Conflict.rules.ts`, `FieldTree.rules.ts`, `MergeDescribe.rules.ts` confirmed `rules` (step 4: pure functions plus the types they define, no I/O, no React). `Conflict.rules.ts` is not `Conflict.errors.ts`: `conflictDetailsOf` reads the 409 body into the merge model (`ConflictDetails`, `DiffEntry`) that `Merge.reducer.ts`, `MergeTree.rules.ts` and `MergeDescribe.rules.ts` build on; it maps no error to a message or alert, which `Content.errors.ts` owns. `BulkBanner.rules.ts` (22 lines) stays a separate file in this rename task (rename tasks only merge types-only and re-export-only files, FN-ad-2 decision); merging it into `Bulk.rules.ts` is a possible later §4.4 clean-up, not part of FN-ad-4.
    - `useCollectionList.query.ts` confirmed `query` (FN-ad-3 rule: the data source decides). Its data is the content type (`useQuery` with `CONTENT_QUERY_KEYS.type`) and the drafts page (`useDocumentListQuery`), and it passes on their pending and error state; the page, sort and selection state around them does not change the word. It uses keys from `Content.queries.ts` and writes no literal key, so it is not a query-key owner and stays out of `QUERY_KEY_OWNERS`.
    - `useContentNavItems.query.ts` confirmed `query`. Its data is `useCallerAccess` (`GET /roles`) and `useContentTypesQuery`, and `isLoading` / `hasFailed` pass on their pending and error state. The pure `contentNavItemsOf` stays with the one hook that uses it (same as `callerAccessOf` in `useCallerAccess.query.ts`).
    - `NavItems.test.ts` -> `Features.registry.test.ts`. A test is named after the file it tests (SPEC §5: the suffix is appended to the full name); this one imports only `FEATURE_LIST` from `Features.registry.ts` and checks the registry's nav items against `NAV_SECTION_IDS`, so the registry is its source file. Neither `NavItems.test.ts` nor `FeatureNavItems.test.ts` names a file that exists. No other test of the registry exists, so no variant is needed. Path edit only: one `git mv` in this task's fix loop (no importer, README or glob names the file).

- [x] **FN-ad-5: Drop the repeated `Error` from cms-admin auth and security error file names** · S · Deps: FN-ad-4 · ui-builder · Security gate: yes · ADR 0008 "Word choices confirmed by the planner (FN-ad-3)" · SPEC §5
  - Acceptance: `features/auth/LoginError.errors.ts` -> `Login.errors.ts`, `PasswordError.errors.ts` -> `Password.errors.ts`, `SetupError.errors.ts` -> `Setup.errors.ts` (each with its `.test.ts`), `features/security/SecurityError.errors.ts` -> `Security.errors.ts`. The renames use `git mv`, and only import specifiers change (`LoginPage.tsx`, `SetPasswordPage.tsx`, `ResetPasswordPage.tsx`, `OwnerSetupPage.tsx`, `Password.form.ts`, `ChangePasswordSection.tsx`, `ConfirmWithCodeForm.tsx`, `TwoFactorDialogs.tsx`, the moved tests, and any other importer the type-check finds), plus the `apps/cms-admin/README.md` line that names `LoginError.errors.ts`. Exported identifiers (`LoginError`, `toLoginError`, `SecurityError`, ...) are unchanged. `git diff -M --stat` shows 7 renames.
  - Verify: `pnpm --filter @abyss/cms-admin lint typecheck test build` (same unit test count as before); `git grep -n "Error.errors" apps/cms-admin` is empty.
  - Files: `apps/cms-admin/src/features/{auth,security}/**`, `apps/cms-admin/README.md`.
  - Checks: qc-cli tier 1, security-qc (high-risk paths; confirm the diff is renames plus import specifiers only). Risk: normal.

- [x] **FN1b-admin: cms-admin file-name guard** · S · Deps: FN-ad-4, FN-ad-5 · ui-builder · ADR 0008 "Guard"
  - Acceptance: `apps/cms-admin/src/FileNames.architecture.test.ts` per ADR 0008, no exception list.
  - Verify: package test; a scratch bad file and `BadFolder/` fail.
  - Files: `apps/cms-admin/src/FileNames.architecture.test.ts`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-e2e-1: Rename apps/e2e files** · M · Deps: none · qc · ADR 0008 · SPEC §5
  - Acceptance: Playwright suites are `tests/<Topic>.e2e.spec.ts` (`side-menu.spec.ts` -> `SideMenu.e2e.spec.ts`); helpers under `src/` take a table word (`mailpit.ts` -> `Mailpit.client.ts`, `smoke-database.ts` -> `SmokeDatabase.client.ts`, `accounts.ts` -> `Accounts.fixture.ts`, `constants.ts` -> `E2e.constants.ts`, `env-contract.test.ts` -> `Env.contract.test.ts`). `playwright.config.ts` test match, `apps/e2e/README.md` and `scripts/` references follow. The manager updates spec paths in `project.md` and `conventions.md`. Rename-only (Q-FN10): no file is merged here.
  - Word choices (planner, DESIGN FN-e2e-words, ADR 0008 "Word choices confirmed by the planner (FN-e2e-1)"): `E2e.env.ts` kept (the `env` row is widened to e2e `src/`); `AppContracts.contract.ts` kept (re-export gateway that the lint rule requires); `RunId.constants.ts`, `ContentTypes.constants.ts`, `TwoFactorAccount.constants.ts` and `ApiPaths.constants.ts` keep their names here and change in FN-e2e-2.
  - Verify: `pnpm --filter @abyss/e2e lint typecheck`; `pnpm exec playwright test --list` shows the same test count as before (205); one full e2e run on the dev stack (tier 2).
  - Files: `apps/e2e/src/**`, `apps/e2e/tests/**`, `apps/e2e/playwright.config.ts`, `apps/e2e/README.md`.
  - Checks: qc tier 2 (run by a qc agent other than the builder, or the manager accepts the builder's run). Risk: normal.

- [x] **FN-e2e-2: Merge the small e2e constants files and name the path map `Api.endpoints.ts`** · S · Deps: FN-e2e-1 · qc · ADR 0008 "Word choices confirmed by the planner (FN-e2e-1)" · SPEC §5 · `code-standards` §4.4
  - Acceptance:
    - `RUN_ID` (from `src/RunId.constants.ts`) and `CV_PAGE_SLUG`, `PROFILE_SLUG`, `editUrlPattern` (from `src/ContentTypes.constants.ts`) move into `src/E2e.constants.ts`; both old files are deleted (deletion approved with this task).
    - `TWO_FACTOR_CHANGED_PASSWORD` moves into `tests/TwoFactor.e2e.spec.ts`, its only user, as a module-level constant; `src/TwoFactorAccount.constants.ts` is deleted.
    - `src/ApiPaths.constants.ts` -> `src/Api.endpoints.ts` (`git mv`, content unchanged; exported names `API_PATHS` and `apiUrl` unchanged).
    - Imports in `src/` and `tests/` follow; the `no-restricted-syntax` messages in `apps/e2e/eslint.config.mjs` name `src/E2e.constants.ts` and `src/Api.endpoints.ts`; `apps/e2e/README.md` paths follow.
    - Afterwards `src/` has one constants file (`E2e.constants.ts`) and no file under 30 lines except `AppContracts.contract.ts` (ADR 0008 keeps it). No value, export name or test changes.
  - Verify: `pnpm --filter @abyss/e2e lint typecheck`; `pnpm --filter @abyss/e2e test:contract`; `pnpm exec playwright test --list` still lists 205 tests; `git grep -n "RunId.constants\|ContentTypes.constants\|TwoFactorAccount.constants\|ApiPaths.constants"` finds nothing outside `docs/adr/` and `tasks/`. Tier 1 is enough (imports and constant moves only, no runtime change); the manager may ask for one tier 2 run of `TwoFactor.e2e.spec.ts` and one spec that uses `RUN_ID`.
  - Files: `apps/e2e/src/E2e.constants.ts`, `apps/e2e/src/Api.endpoints.ts` (was `ApiPaths.constants.ts`), `apps/e2e/src/RunId.constants.ts` (delete), `apps/e2e/src/ContentTypes.constants.ts` (delete), `apps/e2e/src/TwoFactorAccount.constants.ts` (delete), importers under `apps/e2e/src/**` and `apps/e2e/tests/**`, `apps/e2e/eslint.config.mjs`, `apps/e2e/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN1c: e2e file-name guard** · S · Deps: FN-e2e-2 · qc · ADR 0008 "Guard" and "Word choices confirmed by the planner (FN-e2e-1)"
  - Acceptance: `apps/e2e/src/FileNames.architecture.test.ts` (`node:test`, no new dependency) checks every file and folder under `src/` and `tests/` per ADR 0008, no exception list:
    - `FILE_FUNCTION_WORDS` = `e2e`, `contract`, `fixture`, `client`, `constants`, `env`, `endpoints`, `architecture`; no `HOOK_FUNCTION_WORDS` (a `use<Name>` file fails); no `FRAMEWORK_FILE_NAMES`.
    - The word is required: `<PascalName>.<word>.ts`; tests are `<PascalName>.<word>[.<variant>].spec.ts` under `tests/` only and `<PascalName>.<word>[.<variant>].test.ts` under `src/` only.
    - Folders kebab-case (none exist today).
    - The `test:contract` script becomes `test:unit`: `node --test src/*.test.ts` (runs `Env.contract.test.ts` and the guard); `apps/e2e/README.md` names the new script.
  - Verify: `pnpm --filter @abyss/e2e test:unit` passes; each of these scratch files fails it, then is removed: `src/bad-name.ts`, `src/Helper.ts` (no word), `src/Mailpit.service.ts` (word not in the list), `tests/SideMenu.e2e.test.ts` (wrong suffix in `tests/`); `pnpm --filter @abyss/e2e lint typecheck`.
  - Files: `apps/e2e/src/FileNames.architecture.test.ts`, `apps/e2e/package.json`, `apps/e2e/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

#### Revision 3: open word set, one lint rule (DESIGN naming-rule-general, 2026-10-26)

ADR 0008 "Revision 3" (accepted with user answers Q-FN12..Q-FN16, 2026-10-26). The word set is open, so the six per-package guards and their word lists go; one ESLint rule `abyss/file-names` in `@abyss/base-config` checks the shape of `.ts`, `.tsx`, `.js`, `.jsx` and `.mjs` files (Q-FN13). Hook files drop their hook word: `use<PascalName>.<ext>` (Q-FN12). The general rule text goes into each project's own copy of `code-standards` §4.5, which names nothing from this repo (Q-FN15; manager edits the agent layer; not a builder task). Each whole-file deletion below is approved by the user one by one before the task's commit.

Order: FN-lint-1 first; then FN-lint-api (core-builder), FN-lint-ui (ui-builder) and FN-lint-e2e (qc) in parallel; FN-hook-rename (ui-builder) after FN-lint-ui, because the old cms-admin, web and form-commons guards reject `use<Name>.ts` without a hook word and FN-lint-ui deletes them.

- [x] **FN-lint-1: `abyss/file-names` ESLint rule in base-config** · M · Deps: none (Q-FN12..Q-FN14 answered) · core-builder · ADR 0008 "Revision 3" · SPEC §5
  - Acceptance:
    - `packages/base-config/src/Eslint.setup.ts` defines a local plugin `abyss` with rule `file-names` (no new dependency) and exports its options type `FileNameRuleOptions`: `frameworkFileNames` (exact names; default `['index.ts']`, `*.d.ts` always accepted), `allowsRouteSegmentFolders` (default false), `isWordRequired` (default false), `testSuffixes` (default `['test', 'spec']`), `scannedFolders` (default `['src', 'test', 'tests']`). No hook-word option (Q-FN12).
    - `BaseEslintOptions` gets one optional field `fileNames?: FileNameRuleOptions` (additive). When `fileNames` is passed (an empty object means all defaults), `baseEslint()` turns the rule on (`error`) for the `.ts`, `.tsx`, `.js`, `.jsx` and `.mjs` files under the scanned folders (Q-FN13; other file types are not checked); files outside them (root tool configs) are not checked. Without `fileNames` the rule is off, so root `pnpm lint` stays green until each package opts in (FN-lint-api / -ui / -e2e).
    - The rule reports, with a message naming the broken part: a folder segment between the scanned folder and the file that is not kebab-case (or a route segment when allowed); a file name that is neither a framework name, nor a framework name with a test suffix before its extension (`page.test.tsx`), nor `<use?><PascalName>[.<word>][.<variant>].<testSuffix>.<ext>` / `<use?><PascalName>[.<word>].<ext>` (lower-case words; `<ext>` one of `ts`, `tsx`, `js`, `jsx`, `mjs`); a word that repeats the last PascalCase segment of the name (singular or plural); a missing word when required; a `use<Name>` file with no value export named `use<Name>`; a non-`use` file whose only value export is one function named `use[A-Z]...`.
    - base-config's own `eslint.config.ts` passes `fileNames: {}`; `packages/base-config/test/FileNames.architecture.test.ts` is deleted (user approves the deletion); `packages/base-config/README.md` documents the rule and its options.
  - Verify: `pnpm --filter @abyss/base-config build test lint typecheck` (run `build` and `test` as separate calls); the rule's tests use ESLint's `Linter` with virtual file names and cover every report above plus accepted shapes (`AccessPolicy.service.ts`, `Auth.service.refresh.spec.ts`, `LoginPage.tsx`, `useSetupStatus.ts`, `useSetupStatus.test.ts`, `Access.queries.ts`, `Server.env.mjs`, `index.ts`, `vite-env.d.ts`, `[slug]` with route folders on) and a `.css` / `.json` file next to them that the rule does not see; root `pnpm lint` stays green (no other package passes `fileNames` yet).
  - Files: `packages/base-config/src/Eslint.setup.ts`, `packages/base-config/eslint.config.ts`, `packages/base-config/test/Eslint.setup.fileNames.test.ts` (new), `packages/base-config/test/FileNames.architecture.test.ts` (delete), `packages/base-config/README.md`.
  - Checks: qc-cli tier 1. Risk: normal. If the rule passes 300 lines inside `Eslint.setup.ts`, the builder moves it to `src/FileNames.eslint.ts` (`code-standards` §4.4) and records it.

- [x] **FN-lint-api: cms-api uses `abyss/file-names`; drop the cms-api guard; rename `ErrorContract.contract.spec.ts`** · S · Deps: FN-lint-1 (Q-FN16 answered) · core-builder · ADR 0008 "Revision 3"
  - Acceptance: `apps/cms-api/eslint.config.mjs` passes `fileNames: { frameworkFileNames: ['index.ts', 'main.ts'], isWordRequired: true, testSuffixes: ['spec'] }` (and ignores `src/generated/**`, as today). `src/architecture/FileNames.architecture.spec.ts` and `src/architecture/FileNames.constants.ts` are deleted (user approves each). `src/architecture/ErrorContract.contract.spec.ts` -> `src/architecture/ErrorBody.contract.spec.ts` (`git mv`, content unchanged). `apps/cms-api/README.md` naming lines name the lint rule instead of the guard and its constants file.
  - Verify: `pnpm --filter @abyss/cms-api lint typecheck test:unit` green; unit test count drops only by the deleted guard's tests; scratch `src/modules/health/bad-name.ts`, `src/modules/health/Health.ts` (no word), `src/modules/health/BadFolder/X.service.ts`, `src/modules/health/HealthService.service.ts` each fail `pnpm --filter @abyss/cms-api lint` (removed after); `git grep -n "FileNames.constants\|FILE_FUNCTION_WORDS" apps/cms-api` finds nothing.
  - Files: `apps/cms-api/eslint.config.mjs`, `apps/cms-api/src/architecture/FileNames.architecture.spec.ts` (delete), `apps/cms-api/src/architecture/FileNames.constants.ts` (delete), `apps/cms-api/src/architecture/ErrorContract.contract.spec.ts` (`git mv`), `apps/cms-api/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-lint-ui: cms-admin, web, form-commons use `abyss/file-names`; drop their guards** · S · Deps: FN-lint-1 · ui-builder · ADR 0008 "Revision 3"
  - Acceptance:
    - `apps/cms-admin/eslint.config.mjs`: `fileNames: { frameworkFileNames: ['index.ts', 'main.tsx'], testSuffixes: ['test'] }`; `src/FileNames.architecture.test.ts` deleted.
    - `apps/web/eslint.config.mjs`: `fileNames: { frameworkFileNames: <index.ts plus the Next.js names now in the web guard: default, error, global-error, instrumentation, layout, loading, not-found, page, proxy, robots, route, sitemap, template, each .ts and .tsx>, allowsRouteSegmentFolders: true, testSuffixes: ['test'] }`; `src/FileNames.architecture.test.ts` deleted.
    - `packages/form-commons/eslint.config.mjs`: `fileNames: { testSuffixes: ['test'] }`; `src/FileNames.architecture.test.ts` deleted.
    - Each deletion is approved by the user one by one. The three READMEs' naming paragraphs name the lint rule instead of the guard.
  - Verify: `pnpm --filter @abyss/cms-admin lint test`, `pnpm --filter @abyss/web lint test`, `pnpm --filter @abyss/form-commons lint test` green (test counts drop only by the deleted guards' tests); per package one scratch kebab-case file, one `BadFolder/` and one `useThing.ts` that exports no `useThing` fail lint (removed after); `git grep -n "FILE_FUNCTION_WORDS\|HOOK_FUNCTION_WORDS" apps packages` finds nothing in these packages.
  - Files: `apps/cms-admin/eslint.config.mjs`, `apps/cms-admin/src/FileNames.architecture.test.ts` (delete), `apps/cms-admin/README.md`, `apps/web/eslint.config.mjs`, `apps/web/src/FileNames.architecture.test.ts` (delete), `apps/web/README.md`, `packages/form-commons/eslint.config.mjs`, `packages/form-commons/src/FileNames.architecture.test.ts` (delete), `packages/form-commons/README.md`.
  - Checks: qc-cli tier 1. Risk: normal. Note: the 16 hook files still named `use<Name>.<query | mutation | state>.<ext>` pass the rule (the word is optional) and are renamed in FN-hook-rename, not here. If the hook-export check flags any other file, the builder lists it in the unit record and reports `blocked` with the proposed rename; it does not rename files in this task.

- [x] **FN-lint-e2e: apps/e2e uses `abyss/file-names`; drop the e2e guard; rename `AppContracts.contract.ts`** · S · Deps: FN-lint-1 (Q-FN16 answered) · qc · ADR 0008 "Revision 3"
  - Acceptance: `apps/e2e/eslint.config.mjs` passes `fileNames: { isWordRequired: true }` with `testSuffixes: ['spec']` for `tests/**` and `['test']` for `src/**` (one `files` block each). `src/FileNames.architecture.test.ts` is deleted (user approves). `src/AppContracts.contract.ts` -> `src/Apps.contract.ts` (`git mv`, content unchanged); every import, the `no-restricted-imports` message and the `files` entry in `eslint.config.mjs`, and `apps/e2e/README.md` follow. `test:unit` (`node --test src/*.test.ts`) still runs `Env.contract.test.ts`.
  - Verify: `pnpm --filter @abyss/e2e lint typecheck test:unit` green; `pnpm exec playwright test --list` still lists 205 tests; scratch `src/Helper.ts` (no word) and `tests/SideMenu.e2e.test.ts` (wrong suffix) fail lint (removed after); `git grep -n "AppContracts.contract"` finds nothing outside `docs/adr/` and `tasks/`.
  - Files: `apps/e2e/eslint.config.mjs`, `apps/e2e/src/FileNames.architecture.test.ts` (delete), `apps/e2e/src/AppContracts.contract.ts` (`git mv` -> `Apps.contract.ts`), importers under `apps/e2e/src/**` and `apps/e2e/tests/**`, `apps/e2e/README.md`.
  - Checks: qc-cli tier 1. Risk: normal.

- [x] **FN-hook-rename: Drop the hook word from the 16 hook files** · S · Deps: FN-lint-ui · ui-builder · ADR 0008 "Revision 3" (3a, "Hook files renamed") · SPEC §5 · Security gate: yes (renames in `apps/cms-admin/src/features/auth` and `apps/web/src/features/auth`)
  - Acceptance:
    - One commit, `git mv` plus path edits only (ADR 0008 "Renaming"); exported hook names and behaviour unchanged; `git diff -M --stat` shows 22 renames.
    - File map (old -> new; a test moves with its file and keeps its suffix):
      - cms-admin `src/components/`: `useClampedPage.state.ts` -> `useClampedPage.ts`, `useClampedPage.state.test.tsx` -> `useClampedPage.test.tsx`, `useRestoreFocus.state.ts` -> `useRestoreFocus.ts`, `useRestoreFocus.state.test.tsx` -> `useRestoreFocus.test.tsx`.
      - cms-admin `src/features/access/`: `useCallerAccess.query.ts` -> `useCallerAccess.ts`, `useCallerAccess.query.test.ts` -> `useCallerAccess.test.ts`, `useTokenSubmit.mutation.ts` -> `useTokenSubmit.ts`.
      - cms-admin `src/features/auth/`: `useAuthSelector.state.ts` -> `useAuthSelector.ts`, `useCurrentUser.state.ts` -> `useCurrentUser.ts`, `useEmailCode.mutation.ts` -> `useEmailCode.ts`, `useEmailCode.mutation.test.tsx` -> `useEmailCode.test.tsx`, `useSetupStatus.query.ts` -> `useSetupStatus.ts`.
      - cms-admin `src/features/content/`: `useBulkRun.mutation.ts` -> `useBulkRun.ts`, `useCollectionList.query.ts` -> `useCollectionList.ts`, `useContentNavItems.query.ts` -> `useContentNavItems.ts`, `useContentNavItems.query.test.ts` -> `useContentNavItems.test.ts`.
      - cms-admin `src/features/status/`: `useLiveHealth.query.ts` -> `useLiveHealth.ts`.
      - web `src/features/auth/`: `useEmailCode.mutation.ts` -> `useEmailCode.ts`, `useEmailCode.mutation.test.tsx` -> `useEmailCode.test.tsx`.
      - web `src/features/reviewer/`: `useHumanCheck.state.tsx` -> `useHumanCheck.tsx`.
      - web `src/features/status/`: `useLiveHealth.query.ts` -> `useLiveHealth.ts`.
      - form-commons `src/components/forms/sortable-sheet/`: `useRowSelection.state.ts` -> `useRowSelection.ts`.
    - Import edits (relative import paths and any `vi.mock` path that names a moved file):
      - cms-admin: `src/app/SideMenu.tsx`; `src/features/access/AccountsPage.tsx`, `ApiTokensPage.tsx`, `RolePermissionsPage.tsx`, `TokenFormDialog.tsx`, `index.ts`; `src/features/auth/AuthWiring.setup.ts`, `LoginPage.tsx`, `OwnerSetupPage.tsx`, `ProtectedRoute.tsx`, `TwoFactorModal.tsx`, `index.ts`; `src/features/content/CollectionListPage.tsx`, `Content.feature.ts`; `src/features/media/MediaLibraryPage.tsx`; `src/features/reviewer/ReviewerSessionsPage.tsx`; `src/features/status/StatusCard.tsx`; inside moved files: `useCollectionList.ts` (imports `useClampedPage`), `useCurrentUser.ts` (imports `useAuthSelector`), and the moved tests.
      - cms-admin `eslint.config.mjs`: the `QUERY_KEY_OWNERS` entry `src/**/useSetupStatus.query.ts` -> `src/**/useSetupStatus.ts` and the rule message `useSetupStatus.query.ts` -> `useSetupStatus.ts`.
      - web: `src/features/auth/TwoFactorStep.tsx`, `src/features/reviewer/ReviewerAccessDialog.tsx`, `src/features/status/StatusCard.tsx`, and the moved test.
      - form-commons: `src/components/forms/sortable-sheet/SortableSheet.tsx`.
      - READMEs: `apps/cms-admin/README.md` (`useEmailCode.mutation.ts`, `useCallerAccess.query.ts`), `apps/web/README.md` (`useHumanCheck.state.tsx`).
    - The builder re-runs the grep below before moving; any other file that names a moved path is edited in the same commit and listed in the unit record.
  - Verify: `pnpm --filter @abyss/cms-admin lint typecheck test build`, `pnpm --filter @abyss/web lint typecheck test build`, `pnpm --filter @abyss/form-commons lint typecheck test build` green (run `build` and `test` as separate calls; test counts unchanged; form-commons public-API snapshot unchanged); `git grep -nE "use[A-Z][A-Za-z]+\.(query|mutation|state)\b" apps packages` finds nothing; `git diff -M --stat` shows only renames plus the path-edit lines.
  - Files: the 22 moved files above, the importers above, `apps/cms-admin/eslint.config.mjs`, `apps/cms-admin/README.md`, `apps/web/README.md`.
  - Checks: qc tier 2 on the ui side (cms-admin and web in dev mode: login with 2FA email code, status card, content list paging and bulk action, API token form, reviewer access dialog on web; `pnpm exec playwright test --list` still 205) + security-qc (auth paths moved; path-only diff). Risk: normal.

### Phase MF: micro-frontends

- [x] **MF0: User picks the micro-frontend option** · - · Deps: Q-MF1, Q-MF2, Q-MF3 · user, then planner (`PLAN` MF) · ADR 0007
  - Acceptance: ADR 0007 status accepted with the chosen option; MF tasks written per the option's outline (Option A: `@abyss/admin-sdk` first, then one feature package per task in tier order, then web).
  - Verify: the user approves the MF task list.
  - Files: `docs/adr/0007-frontend-micro-frontend-approach.md`, `tasks/todo.md`, `tasks/plan.md`.

### Phase CR: cms-api clean-architecture refactor — PROPOSED 2026-10-25 (CA5)

Source: CA5 consolidation of `.claude/state/findings/AUDIT-CA1a.md`, `AUDIT-CA1b.md`, `AUDIT-CA2.md`, `AUDIT-CA3.md`, `AUDIT-CA4.md`, with ADR 0006 sections 1-7 (accepted 2026-10-25; section 7 holds the amendments the audit proved). Keep the five findings files until CR-cl-1 is done: the tasks cite their L8 target maps, their "Must-not-change" lists and their security notes (CA1a findings 1-10; CA1b N1-N12; CA2 N1-N14 and F2; CA3 AUD-CA3-3 / -6 notes; CA4 AUD-CA4-9 note). The builder reads the cited note before starting.
User answers used: Q-CA1 A (only `@Injectable` / `@Inject` in `application/`), Q-CA2 (`domain/`, `application/`, `adapters/`, `http/`), Q-CA3 (no Prisma types in `domain/` or `application/`), Q-CA4 (blanket rename approval; whole-file deletions still asked), Q-FN1..Q-FN6 (ADR 0008 names; existing files are renamed once, when their CR task moves them).

**Order and why.** CR0 platform → CR1 pilot (`health` warm-up, then `content-types`) → checkpoint (the user reviews the pattern) → CR2 content-engine → CR3 documents and graphql → CR4 access core → CR5 security-audit and identity → CR6 access management, media, reviewer → CR6b consolidation of the modules moved before §4.4 (added 2026-10-25) → CR7 close. DEV-STACK (infra, added 2026-10-25) runs after CR-dc-1 so that tier 2 tasks have a dev stack. The platform comes first because of the `describeError` hazard: once any service throws `DomainError`, every place that reads `instanceof HttpException` (GraphQL error formatter, bulk per-item errors, the GraphQL "missing document is null" check) would turn it into a 500 / `INTERNAL_ERROR`, and unit tests with mocks would stay green (AUD-CA3-2, AUD-CA4-9). CR-pf-1 routes every reader through one `describeError` before any module changes a throw. After the pilot, modules go lowest in the SPEC §2 graph first. The high-risk modules (access, identity, media, reviewer) come last, and every task in them has `Security gate: yes`.

Rules for every CR task:
- Behavior-preserving: the same routes, statuses, response bodies (including the bare 401 / 403 / 404 / 503 bodies, ADR 0006 §7.2), error codes, headers (`Cache-Control: no-store`, `Retry-After`), audit rows, timing-parity paths and stored-data formats. Only a line marked **planned change** may change behavior.
- One owner module per task; other modules get import-path edits only (through facades).
- Moves: `git mv` in a commit with no content change (Q-CA4). Each file is renamed to its ADR 0008 name when it moves (Q-FN2); a case-only rename goes through a temporary name. A split starts with `git mv` of the old file to the target of its largest part, so no file is deleted; a real whole-file deletion is reported for approval.
- Target paths: the task's **Target map** line (revision of 2026-10-25, below); for tasks without one, the L8 map of the cited audit file. Names follow the ADR 0008 table; where a CA3 / CA4 map keeps kebab-case names, the builder uses the ADR 0008 name; the extra word `resolver` (Q-CA16) is available; FN1a adds it to `FILE_FUNCTION_WORDS`.
- Each module task, in the same task: adds the module (or sub-module) to `MIGRATED_MODULES`; fixes the imports of it that already-migrated modules now fail (path edits, or a transitional entry; ADR 0006 §7.8); leaves no `KNOWN_LAYER_VIOLATIONS` entry for it, except a transitional entry the task names with the task that removes it; edits pinned paths only in `architecture/source-paths.constants.ts` (CR-pf-2); updates the module's `docs/modules/*.md` section (if any) and the `apps/cms-api/README.md` layout notes; adds unit specs for every use case it extracts (built with `new` and fake ports).
- Test files change only in import paths and constructor wiring unless the task names a test change. Integration tests in `apps/cms-api/test/integration/` keep their assertions.
- **CR-SV (standard verify; revised 2026-10-25 for test tiers):** tier 1 for every task: `pnpm --filter @abyss/cms-api lint typecheck test:unit test:integration` (Docker), Prettier on changed files, `content:generate -- --check`, `graphql:print-schema -- --check` and `contract:print -- --check`. `layers.architecture.spec.ts` and `modules.architecture.spec.ts` are green. `test/integration/route-snapshot.spec.ts`, `permission-metadata.architecture.spec.ts` and `rate-limit-policies.architecture.spec.ts` are green with no snapshot or list update (a pinned path may change, the scanned policies and counts may not). `git show -M --stat` of each move commit shows renames only. The task's `Tier:` line adds more: tier 2 = the named specs with `pnpm e2e:spec` on `pnpm dev:stack` (DEV-STACK); tier 3 = `SMOKE_E2E=1 pnpm smoke` green. Phase checks (exit criteria of CR3-CR7) are always tier 3.
- `Security gate: yes`: security-qc reviews the diff against the cited security notes before the next task builds on it.

**Revision 2026-10-25 (planner REVISE CR: `code-standards` §4.4, ADR 0006 §7.13, skill `test-tiers`).** Applies to every CR task from CR-gq-1 on and to CR-cs-1..3. Each of them has a **Target map** line (the module's files after the task, with the count) and a **Tier** line. The Target map wins over file names in its Acceptance text, in the audit L8 maps and in older Files lines; security notes, behavior rules and verify steps are unchanged. A builder who still finds a §4.4 conflict follows §4.4 and records the difference in `current.md`.
- G1 Ports: at most one `application/<Module>.port.ts` per module (the sub-modules `access/management` and `access/document-auth` count as modules) with every port interface of the module and its token. A port exists only for I/O that the layer rules keep out of `application/` (Prisma, Kysely, pg, filesystem, streams, network) or for a second implementation that a spec or the wiring uses (a fake, an unconfigured default). A ports part under 30 lines lives in the module's main `application/` service file (the adapter imports it from there).
- G2 Library calls without I/O (argon2, jsonwebtoken, otplib, `node:crypto` HMAC / HKDF / AES) get no port: they stay in the use case or the one `application/` file that uses them (user answer Q-R3; ADR 0006 §1 and §7.13).
- G3 Constants: at most one constants file per module layer; a constant used by one file lives in that file. Route groups and rate-limit policies used by one controller live in that controller file; values several `http/` files share go to `http/<Module>Http.constants.ts`.
- G4 Requests: one `<Controller>.requests.ts` per controller (ADR 0008); a requests part under 30 lines lives in its controller file.
- G5 Domain: types shared inside a layer go into its main entity or rules file. `<Module>.errors.ts` (the `DomainError` constructors) only when it reaches 30 lines, otherwise the constructors go into the module's main `domain/` rules or entity file. One adapter per aggregate and storage technology.
- G6 Files under 30 lines: only `index.ts`, `<Module>.module.ts`, `*.setup.ts`, a file a security note pins byte for byte (`identity/domain/SetupToken.rules.ts`), and (Q-R2) a Nest entry-point class (guard, resolver, middleware, job) or a single adapter that its layer forces into its own file.
- G7 Endpoint check: a new endpoint touches its controller (with route and rate limit), requests, service, rule, port file and repository: 6 files; the module file only when a new provider is added.
- G8 Merges: a merge starts with `git mv` of the largest part to the target name; the other parts are merged in by a content commit. Specs follow their source: when sources merge, their specs merge into the target's spec with the same cases. The merged-away files are whole-file deletions: each task lists them under "Merged away" for the user's approval (Q-R4).
- G9 Pinned paths: every move or merge updates, in the same task, `architecture/source-paths.constants.ts`, the lists in `architecture/layer-rules.constants.ts`, the exceptions in `apps/cms-api/eslint.config.mjs`, the paths in `contract/public-constants.ts`, `docs/modules/*.md` and test imports.
- G10 Tiers: the `Tier:` line is the expected tier; the builder may raise it with a reason in `Checks needed`, never lower it.
- File names below use the port word `port` from ADR 0008 (`<Module>.port.ts`; user answer Q-R1, ADR 0006 §7.13).
- File counts (non-spec source files of the module; today → older plan (audit L8 maps and task lists) → this revision): graphql 19 → ~20 → 17; documents 28 + 3 (`infrastructure/activity`) → ~37 → 25; access core with `roles/` and document auth 41 → ~57 → 36-37; access management 14 → ~21 → 18; security-audit 4 → 7 → 5-6; identity 44 → ~66 → 42; media 15 + 5 (`infrastructure/media`) → ~35 → 19; reviewer 9 + 4 (`infrastructure/turnstile`) → ~21 → 13. Already moved (CR-cs-1..3): health 8 → 5; content-types 8 → 5; content-engine 38 → 31; platform `common/` 26 → 22.

**User answers (2026-10-25, handoff "CA5 user answers").** All 13 questions were answered with the recommended option; the tasks below are written with them.
- Q-CA5 / Q-CA13: `zod` and `sanitize-html` are allowed in `domain/` through `ALLOWED_DOMAIN_PACKAGES`; every I/O package stays banned.
- Q-CA6: `domain/` may use `import type` from another module's facade, plus named pure values listed in `DOMAIN_CROSS_MODULE_VALUES` (pure functions such as `fieldTypeOf`, `isComponentField`, `joinFieldPath`, and `as const` data constants such as `CONDITION_SYSTEM_FIELDS`; ADR 0006 §7.11), only along edges already in `ALLOWED_MODULE_EDGES`.
- Q-CA7: a `jobs/` layer next to `cli/`. Jobs may use Nest lifecycle hooks and `Logger` and call use cases only; one shared interval-job helper owns the timer / running-flag / error-log skeleton.
- Q-CA14a (also Q-CA9a, Q-CA12b): the four single-consumer `infrastructure/` folders move into their owner modules inside that module's task (activity → documents CR-dc-2, database health → health CR-hc-1, media storage → media CR-md-1 / CR-md-3, turnstile → reviewer CR-rv-2). The manager then updates the high-risk paths in `project.md`. Q-CA8 is moot.
- Q-CA9b (also AUD-CA3-6): SQL on tables the module does not own stays in the consuming module behind a port (`ReviewerAccountGateway`; a presence lookup that selects `displayName` only); the overlap is recorded in `docs/modules/access-control.md`.
- Q-CA10: `graphql/rules/` and `graphql/schema/` go to `http/`; `graphql` has no `domain/`.
- Q-CA14b: `loadDefinitions` and `DEFAULT_CONTENT_PATHS` stay on the content-engine facade.
- Q-CA14c: a concurrent delete reaching `DocumentNotFoundError` answers `404 DOCUMENT_NOT_FOUND` (**planned change**, CR-dc-3; today it is a 500).
- Q-CA15c: access core in `access/<layer>/`, management in `access/management/<layer>/`, document auth in `access/document-auth/<layer>/` with its own `index.ts` (replaces `document-auth.ts`). Nodes are decided by folder.
- Q-CA16: only `resolver` is added to ADR 0008. Pure validator / mapper / compiler → `rules`; gateway / checker / SQL implementations → `adapter` with a `port`; view and value types → `entity`.
- Q-CA17: the `kysely` `sql` assembly stays in `access/domain/PolicyEvaluator.ts` and `access/domain/Conditions.rules.ts` as the one named `LAYER_RULES` exception; documents and media `application/` receive the filter as an access-owned opaque `RowFilter` type.
- Q-CA1..Q-CA4 and Q-FN1..Q-FN6 are confirmed as recorded. Q-CA12 and Q-CA15a / b / d follow ADR 0006 §7.

**Settled in CA5 (ADR 0006 §7; no user answer needed).** The HTTP 415 kind: `unsupported_media_type` is added, and `gone` is dropped because no site uses it. Q-CA11: the bare bodies stay as they are; a `DomainError` without a code describes as the matching Nest exception. Q-CA12a: the `TransactionRunner` shape, with core and content bindings, `afterCommit` and `runInSavepoint`. Q-CA12b: merged into Q-CA14a. Q-CA15a: platform roles are classified by folder. Q-CA15b: the layer guard starts with `MIGRATED_MODULES`. Q-CA15d: the `ClientMeta` type goes to `common/types/`. The `AppLogger` port follows from Q-CA1 A. The access field-projection deep import from documents (CA1b L8 exception 1) stays as a named `LAYER_RULES` exception, option (a), because it is the existing D3 protection that `facade-reexports.architecture.spec.ts` pins.

**Dropped or deferred findings, with reasons.**
- `IdGenerator` / `TokenGenerator` / `StorageKeyGenerator` / `RandomSource` ports (CA1a L5, CA2 L5 and AUD-CA2-9 in part, AUD-CA3-7 in part, CA4 L5): `node:crypto` is not banned in `application/`, and no test needs fixed ids. `uuidv7` gets its time from `Clock` as an argument (CR-md-1).
- The typed `RowCondition` tree (CA1b L5): replaced by Q-CA17.
- AUD-CA1b-9 (bare 403 of `requireAccountActor`, the `QueryGuard` name): giving it a code is a contract change (Q-A8). The name is fixed by the rename to `QueryFieldAccess.rules.ts` (CR-ac-1).
- AUD-CA4-11 (`ACCESS_INVALID_REQUEST` named for access but used platform-wide): renaming it is a contract change (Q-A8).
- AUD-CA4-12 (`config/` and `infrastructure/database` types at folder level): there is no file cycle, and the layer guard does not need the change.
- AUD-CA3-11 and AUD-CA2-14: notes; the splits in CR-hc-1 and CR-md-3 already resolve them.

#### CR0: platform (core-builder)

- [x] **CR-00: SPEC §2 / §5 for the layer layout** · S · Deps: none (Q-CA6, Q-CA7, Q-CA14a, Q-CA15c, Q-CA16 answered) · planner (`SPEC`) · ADR 0006 · SPEC §2, §5
  - Acceptance: §2 "Module directions": the access paragraph names the folders `access/<layer>/`, `access/management/<layer>/`, `access/document-auth/<layer>/` (Q-CA15c); one new bullet states the layer rule and names `apps/cms-api/src/architecture/layer-rules.constants.ts` (`LAYER_RULES`) as its mirror (a change to one is a change to both). §5 cms-api tree shows `modules/<module>/{domain,application,adapters,http,cli,jobs}`, `<Module>.module.ts`, `index.ts`, `common/{errors,types,validation}/`, `infrastructure/logging/` and `infrastructure/` reduced to `database/`, `mail/` and `logging/` (Q-CA14a). §5 naming points at ADR 0008 for cms-api file names (FN1 owns the full table).
  - Verify: the user approves the diff; `LAYER_RULES` (CR-pf-3) matches the §2 bullet.
  - Files: `SPEC.md`.

- [x] **CR-pf-1: `DomainError`, one error reader, and the kind-to-status table** · M · Deps: none · core-builder · **Security gate: yes** (the 401 / 403 / 429 path of every module) · ADR 0006 §3, §7.1-7.3 · Findings AUD-CA4-9, AUD-CA3-2, AUD-CA1a-1 / -9, AUD-CA1b-1, AUD-CA2-1 · SPEC §9 (error body), D18
  - Acceptance:
    - New `apps/cms-api/src/common/errors/Domain.errors.ts` (`DomainError`: `kind`, optional `errorCode`, `message`, `details`, `retryAfterSeconds`) and `common/errors/DomainErrorKinds.constants.ts` (`DOMAIN_ERROR_KINDS`, `DomainErrorKind`: the 9 kinds of ADR §7.1). New `common/http/DomainErrorHttpStatus.constants.ts`: `DOMAIN_ERROR_HTTP_STATUS: Record<DomainErrorKind, number>` (a missing kind fails to compile). No Nest import under `common/errors/`.
    - `common/http/describe-http-exception.ts` exports `describeError(error: unknown)` (Nest `HttpException`, `DomainError`, anything else as a generic 500). `describeHttpException` stays as its `HttpException` branch (additive).
    - A parity spec: for every kind, `describeError(new DomainError({ kind }))` equals `describeHttpException` of the matching Nest exception (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`, `PayloadTooLargeException`, `UnsupportedMediaTypeException`, `HttpException(…, 429)`, `ServiceUnavailableException`). With `errorCode`, `message` and `details` set, they appear as given; a 5xx keeps the generic message and drops `details`.
    - `HttpExceptionFilter` uses `describeError` and sets `Retry-After` (whole seconds, at least 1, same format as the throttle guard) for `rate_limited` with `retryAfterSeconds`.
    - `modules/graphql/error-format.ts`, `modules/documents/bulk-errors.ts` (`asItemError`, `atomicFailure`, `itemError`) and `modules/graphql/document.resolvers.ts` (missing document → `null`) read errors only through `describeError` or `DomainError` (`kind === 'not_found'` and `DOCUMENT_ERROR_CODES.NOT_FOUND`), and still accept the Nest exceptions the services throw today.
    - A contract spec: one `DomainError` (`conflict` with a code and `details`) gives the same `{ statusCode, errorCode, message, details }` through the REST filter, the GraphQL formatter and a bulk item result.
    - No module throws `DomainError` yet (`grep -rln "new DomainError" apps/cms-api/src/modules` finds only specs).
  - Security note (AUD-CA4-9, CA1a finding 1): unknown errors stay a generic 500 with the stack in the log only; the 5xx rule (generic message, no `details`) also holds for kind `unavailable`; no new field in the body; `Retry-After` only on 429.
  - Verify: CR-SV. The unit record shows the contract spec failing on the old readers (a `DomainError` through GraphQL gave `INTERNAL_ERROR`).
  - Files: `apps/cms-api/src/common/errors/{Domain.errors.ts,DomainErrorKinds.constants.ts}` (new) + specs, `src/common/http/DomainErrorHttpStatus.constants.ts` (new), `src/common/http/describe-http-exception.ts` + spec, `src/common/filters/http-exception.filter.ts`, `src/modules/graphql/{error-format.ts,document.resolvers.ts}`, `src/modules/documents/bulk-errors.ts`, their specs.

- [x] **CR-pf-2: Layer-aware import graph and one table of pinned paths** · S · Deps: none · core-builder · **Security gate: yes** (edits the D3 / D18 guard specs under `modules/access` and `modules/graphql`) · ADR 0006 §2 · Findings AUD-CA4-1, AUD-CA4-2, AUD-CA4-10, AUD-CA1b-7 · SPEC §2
  - Acceptance:
    - `architecture/import-graph.ts`: `ResolvedImport.isTypeOnly` for every statement (the regex count moves here from `module-graph.ts`, which then uses it); `textMatches(file, pattern)` over comment-stripped text.
    - `architecture/module-graph.ts`: `layerOfFile(file)` returns `domain | application | adapters | http | cli | jobs | wiring | unlayered` (wiring = `index.ts`, `*.module.ts`). `nodeOfFile` skips a layer folder right after the module name before it applies the access rules. Fixture tests cover `access/application/x.ts` (core), `access/management/application/x.ts` (management) and `access/http/document-auth.guard.ts` (document auth); the document-auth rule itself changes in CR-ac-4 (Q-CA15c).
    - New `architecture/source-paths.constants.ts` holds every module file path that a spec or helper pins today (`controller-handlers.ts` and its spec, `field-type-branches`, `facade-reexports`, `permission-metadata`, `rate-limit-policies`, `security-audit-provider`, `session-ownership`, `system-role-literals`, `modules/access/record-serializer.architecture.spec.ts`, `modules/graphql/graphql.architecture.spec.ts`; about 25 paths, AUD-CA4-10). Those files read it. A pinned path that does not exist fails with a "missing path" message instead of an empty scan.
  - Security note (CA1b N8, N10; CA3 D18 rules): each spec scans the same files as before (its non-empty count assertions stay); no rule is loosened; only path sources change.
  - Verify: CR-SV. Renaming one pinned file in a scratch commit fails a spec with the "missing path" message (then revert).
  - Files: `apps/cms-api/src/architecture/{import-graph.ts,import-graph.spec.ts,module-graph.ts,modules.architecture.spec.ts,source-paths.constants.ts,controller-handlers.ts,controller-handlers.spec.ts,field-type-branches.architecture.spec.ts,facade-reexports.architecture.spec.ts,permission-metadata.architecture.spec.ts,rate-limit-policies.architecture.spec.ts,security-audit-provider.architecture.spec.ts,session-ownership.architecture.spec.ts,system-role-literals.architecture.spec.ts}`, `src/modules/access/record-serializer.architecture.spec.ts`, `src/modules/graphql/graphql.architecture.spec.ts`.

- [x] **CR-pf-3: `LAYER_RULES` and the layer guard** · M · Deps: CR-pf-2 · core-builder · ADR 0006 §2, §7.6, §7.8 · Findings AUD-CA4 "LAYER_RULES check" (gaps 1-6) · SPEC §2
  - Acceptance:
    - New `architecture/layer-rules.constants.ts`: `LAYER_RULES` (the shape in AUDIT-CA4.md "LAYER_RULES check", with the platform roles by folder of ADR §7.6), `ALLOWED_DOMAIN_PACKAGES` (`zod`, `sanitize-html`; Q-CA5 / Q-CA13), the cross-module `domain/` allowances (Q-CA6), the named exceptions (`kysely` in two access domain files per Q-CA17; documents' deep import of access field projection; `src/architecture/**` and `src/contract/**` reading module constants), `MIGRATED_MODULES` (empty) and `KNOWN_LAYER_VIOLATIONS` (empty).
    - Rules: `application/` may import only `Injectable` and `Inject` from `@nestjs/common` (a namespace or default import fails); per-layer banned packages (`@nestjs/*` beyond that, `express`, `@prisma/*`, `generated/**` including `import type`, `kysely`, `pg`, `passport*`); banned text in `domain/` and `application/` (`process.env`, argument-less `new Date()`, `Date.now(`); the `jobs/` row (Q-CA7: lifecycle hooks and `Logger` allowed, use cases only, no adapters).
    - New `architecture/layers.architecture.spec.ts` checks every non-spec file of each `MIGRATED_MODULES` entry. An unlayered file fails (except `<Module>.module.ts` and `index.ts`), a stale `KNOWN_LAYER_VIOLATIONS` entry fails, and the scan asserts a non-empty file count once the list is non-empty.
    - Fixture cases (a scratch tree, the way `identity-cli.architecture.spec.ts` builds one): `application/` importing its own `adapters/` fails; `application/` importing `Logger` from `@nestjs/common` fails; `domain/` importing `kysely` fails; `import type` from `generated/prisma` in `application/` fails; `application/` importing another module's application export through its facade passes; another module's adapter reached through its facade fails.
    - Design review amendments (ADR 0006 §7.11, 2026-10-25; fix round on the built unit):
      - Replace `ALLOWED_DOMAIN_NODE_BUILTINS` with `ALLOWED_DOMAIN_BUILTIN_IMPORTS = { 'node:crypto': ['createHash'] }`, checked like the `@nestjs/common` allowance of `application/`. Fixtures in `domain/`: `import { createHash } from 'node:crypto'` passes; `import { randomUUID } from 'node:crypto'`, `import * as crypto from 'node:crypto'` and `import { createHash } from 'crypto'` fail.
      - `cli` row: own layers add `adapters`; other-module layers add `adapters` (through the facade only). Fixtures: `cli/` importing its own `adapters/` passes; `cli/` importing another module's adapter export through its facade passes; `cli/` importing its own `http/` fails.
      - New platform role `scheduling` for `infrastructure/scheduling/`; `jobs` platform roles become `pure`, `config`, `scheduling` (no `port`). `platformRoleOfFile` picks the longest matching prefix, not the first row. Fixtures: `jobs/` importing `infrastructure/scheduling/x.ts` passes; `jobs/` importing another `infrastructure/` adapter fails; `adapters/` importing `infrastructure/scheduling/x.ts` fails.
      - Unchanged and confirmed: unmigrated targets are not judged, deep imports stay banned (ADR §7.8, §7.11.2); the `domain`, `application`, `adapters` and `http` platform roles.
  - Verify: CR-SV; each fixture case passes or fails as listed.
  - Files: `apps/cms-api/src/architecture/{layer-rules.constants.ts,layer-check.ts,layers.architecture.spec.ts}` (new), `architecture/module-graph.ts` (`moduleFolderOf`), and the spec's fixtures.

- [x] **CR-pf-4: Platform splits and the `AppLogger` port** · M · Deps: CR-pf-3 · core-builder · ADR 0006 §6, §7.5-7.7 · Findings AUD-CA4-3, AUD-CA3-5, AUD-CA3-8, CA1a L4 / CA1b L4 / AUD-CA2-4 (`ClientMeta`) · SPEC §2, §5
  - Acceptance (additive: every existing import keeps working; modules switch their imports in their own CR task):
    - The pure parts of `common/http/request-parsing.ts` (`PAGINATION`, `queryInt`, `pageQuerySchema`, `documentIdSchema`, `RequestIssue`, `PageQuery`, `PageMeta`) move to `common/validation/SharedSchemas.rules.ts`; `request-parsing.ts` keeps `parseRequest` and `invalidRequest` and re-exports the moved names.
    - `ERROR_CODE_BY_STATUS` moves from `common/constants/error.constants.ts` to `common/http/ErrorCodeByStatus.constants.ts`, and its 1 importer (`common/http/describe-http-exception.ts`) changes its import path in this task. `error.constants.ts` keeps `ERROR_CODES` and `INTERNAL_ERROR_MESSAGE` with no Nest import.
    - The `ClientMeta` interface moves to `common/types/ClientMeta.entity.ts`; `common/http/client-meta.ts` keeps `clientMetaOf` and re-exports the type.
    - New `infrastructure/logging/{AppLogger.port.ts,NestAppLogger.adapter.ts,Logging.module.ts}` (`APP_LOGGER`, `warn`, `error`), provided globally from `app.module.ts`.
    - `Clock` is unchanged (Q-CA1 A allows `@Injectable`).
  - Verify: CR-SV; `grep -rln "@nestjs" apps/cms-api/src/common/{constants,errors,types,validation}` prints nothing.
  - Files: `apps/cms-api/src/common/http/{request-parsing.ts,client-meta.ts,ErrorCodeByStatus.constants.ts}`, `src/common/constants/error.constants.ts`, `src/common/validation/SharedSchemas.rules.ts` (new), `src/common/types/ClientMeta.entity.ts` (new), `src/infrastructure/logging/*` (new), `src/app.module.ts`, `src/common/http/describe-http-exception.ts` (the 1 `ERROR_CODE_BY_STATUS` importer; path edit only).

- [x] **CR-pf-5: `TransactionRunner` port and the Prisma runner** · M · Deps: CR-pf-3 · core-builder · **Security gate: yes** (the atomicity, lock order and after-commit cache drops of every later high-risk task build on it) · ADR 0006 §4, §7.4 · Findings AUD-CA1a-2, AUD-CA1b-2, AUD-CA2-2, AUD-CA3-3, CA4 L3 · SPEC D15, D16
  - Acceptance:
    - New `infrastructure/database/TransactionRunner.port.ts`: `TransactionRunner.run(work)`, opaque `UnitOfWork` with `afterCommit(callback)`, `ContentTransactionRunner` (adds `runInSavepoint(unit, work)`), tokens `CORE_TRANSACTION_RUNNER` and `CONTENT_TRANSACTION_RUNNER`. The content adapter is built in CR-ce-2.
    - New `infrastructure/database/PrismaTransactionRunner.adapter.ts`, bound in `DatabaseModule`: `run` wraps `prisma.$transaction(callback)` with today's options (no isolation-level change); after-commit callbacks run once, after commit, in registration order, and never on rollback. `prismaTxOf(unit)` is for adapters only. A transitional `unitOfWorkFromPrismaTx(tx)` lets a not-yet-migrated caller hand its `tx` to a migrated module; it is removed in CR-cl-1.
    - New integration spec `test/integration/transaction-runner.spec.ts` (Testcontainers): two writes commit together; a throw rolls both back; after-commit runs after commit and not after a rollback.
    - **Synchronous after-commit callbacks (ADR 0006 §7.12, CR-pf-5 security review).** The port signature is `afterCommit(callback: () => void): void` (was `() => void | Promise<void>`), and its doc comment says: in-memory work only, runs synchronously after commit and before `run` resolves; post-commit I/O belongs after `run`. New `infrastructure/database/AfterCommitCallbacks.store.ts` owns the list, the unit state (`open` → `committed` / `rolledBack`, finding F1: `register` throws when not `open`) and `runAll(logger)`; `PrismaUnitOfWork` delegates to it. `runAll` calls each callback without `await`; a thrown error is logged and the next callback runs; a returned thenable is logged as `An after-commit callback returned a promise; after-commit callbacks must be synchronous`, gets a rejection handler that logs the rejection message (no unhandled rejection), and the next callback runs at once. No timeout.
    - Spec changes: the "runs after the commit, in registration order" test uses synchronous callbacks (to prove the commit is visible, the first callback starts `probeNames()` and stores the promise; the test awaits it after `run` and expects `['a']`); new tests: every callback has run when `run` resolves; a callback that returns a never-settling promise does not delay `run` or the later callbacks, and the misuse error is logged; a callback that returns a rejecting promise logs and leaves no unhandled rejection. A unit spec for `AfterCommitCallbacks` covers the states and `runAll` without a database.
  - Security note (CA1b N11; CA1a finding 2; SPEC D9): no lock or isolation change; `FOR UPDATE`, `FOR SHARE` and advisory locks stay in the repositories' SQL inside the unit; after-commit callbacks never run inside the transaction; every cache drop has run before `run` resolves, so with one replica a revocation applies on the next request; a slow or hung callback cannot be awaited, so it cannot hold back later drops or the response.
  - Verify: CR-SV; `pnpm --filter @abyss/cms-api lint` passes with the narrowed signature (an `async` callback passed to `afterCommit` would fail `no-misused-promises`).
  - Files: `apps/cms-api/src/infrastructure/database/{TransactionRunner.port.ts,PrismaTransactionRunner.adapter.ts,AfterCommitCallbacks.store.ts,database.module.ts}` + specs, `apps/cms-api/test/integration/transaction-runner.spec.ts` (new).

- [x] **CR-pf-6: Domain constants for the Prisma enums** · S · Deps: CR-pf-3 · core-builder · **Security gate: yes** (high-risk paths `modules/access`, `modules/identity`) · ADR 0006 §7.9 · Findings AUD-CA1b-5, AUD-CA1a-3 · SPEC §7 D5, D6
  - Acceptance: new `access/domain/PermissionAction.entity.ts`, `access/domain/AccountStatus.entity.ts`, `identity/domain/TwoFaMethod.entity.ts` and `identity/domain/OtpPurpose.entity.ts` (`as const` objects plus types), exported from the access and identity facades. A parity spec per enum checks set equality with the `generated/prisma` values both ways. No caller switches here; each module task switches its own imports.
  - Security note (AUD-CA1b-5): the values stay byte-identical (stored in `permissions.action` and `accounts.status`, and in token scope JSON and audit metadata); adapter mappings are exhaustive with no default branch.
  - Verify: CR-SV.
  - Files: the four new files + specs, `apps/cms-api/src/modules/{access,identity}/index.ts`.

#### CR1: pilot (core-builder)

- [x] **CR-hc-1: Pilot warm-up: `health` in layers** · S · Deps: CR-pf-3, CR-pf-4 · core-builder · ADR 0006 · Findings CA3 L6.1, AUD-CA3-8, CA4 L7 (database health) · SPEC §2
  - Acceptance: `health/http/{Health.controller.ts,Health.routes.ts}`, `health/application/{CheckReadiness.service.ts,Health.constants.ts}`, `health/Health.module.ts`, `health/index.ts`. `CheckReadiness` pings through the injected `DatabaseHealth` port (never the adapter file; `HealthModule` binds the adapter to the token) with the same timeout and returns `{ status }`; the controller answers 503 on `error` and logs the same warning (Nest `Logger` stays in `http/`). Per Q-CA14a: `infrastructure/database/database-health.ts` → `health/application/DatabaseHealth.port.ts` and its Prisma adapter → `health/adapters/PrismaDatabaseHealth.adapter.ts`, bound in `HealthModule` (`DatabaseModule` stops providing it). `MIGRATED_MODULES = ['health']`.
  - Verify: CR-SV; `test/integration/health.spec.ts` unchanged (`{ status }` bodies, 503 on failure).
  - Files: `apps/cms-api/src/modules/health/**`, `src/infrastructure/database/{database-health.ts,prisma-database-health.ts,database.module.ts}` (moves, Q-CA14a), `src/architecture/layer-rules.constants.ts`.

- [x] **CR-hc-2: Pilot: `content-types` in layers** · S · Deps: CR-hc-1, CR-pf-1, CR-pf-6 · core-builder · ADR 0006 · Findings AUD-CA3-1 (content-types row), AUD-CA3-10, CA3 L8 pilot · SPEC §2, §9
  - Acceptance: `http/{ContentTypes.controller.ts,ContentTypes.routes.ts}`, `application/{ContentTypes.service.ts,ContentTypes.constants.ts}` (`FULL_CATALOG_PERMISSION` uses the access-domain `PermissionAction`), `domain/ContentTypes.errors.ts` (code, message, `contentTypeNotFound()` → `DomainError(not_found, CONTENT_TYPE_NOT_FOUND, same message)`), `domain/ContentTypeView.rules.ts`, which imports what it needs from the access and content-engine facades: types, `isComponentField`, `joinFieldPath` and `CONDITION_SYSTEM_FIELDS`. These are named pure values allowed by Q-CA6 and ADR 0006 §7.11; the rule takes no vocabulary argument. `DOMAIN_CROSS_MODULE_HELPERS` is renamed `DOMAIN_CROSS_MODULE_VALUES` and lists all three names, `ContentTypes.module.ts`, `index.ts`. No Prisma import left in the module. `MIGRATED_MODULES` adds `content-types`. `test/integration/content-types.spec.ts` and `content-types.contract.spec.ts` change import paths only. `apps/cms-api/README.md` gains a "Module layout (ADR 0006)" section with the checklist this pilot used (moves commit, splits, `MIGRATED_MODULES`, `source-paths`, docs, specs), which later CR tasks follow.
  - Verify: CR-SV; the 404 for an unknown or unreadable type is byte-identical (integration test unchanged).
  - Files: `apps/cms-api/src/modules/content-types/**`, `apps/cms-api/test/integration/content-types.spec.ts` (paths), `src/architecture/layer-rules.constants.ts`, `apps/cms-api/README.md`.

#### CR2: content-engine (core-builder)

- [x] **CR-ce-1: content-engine `domain/` moves and splits** · M · Deps: CR1 checkpoint · core-builder · ADR 0006 §4, §5 · Findings AUD-CA4-4, AUD-CA4-6 (`UNMASKED_FILES`), CA4 L8 (domain rows) · SPEC §2, D3, D10
  - Acceptance: per the CA4 L8 map: the constants split (domain part; `adapters/ContentEnginePersistence.constants.ts` for pool size, pg codes, migration file names, lock key, hash); `naming`, `sql-reserved-words`, `definition.schema`, `definition.validator`, `sql-generator`, `tree-input`, `field-types/*` and `content-row-mapping` move to `domain/`. `ContentEngineError` goes to `domain/ContentEngine.errors.ts`; `ContentDocument`, `ContentStatus`, `DocumentRef` and `DocumentNotFoundError` go to `domain/ContentDocument.entity.ts`; the tree types, `rowToValues` and `emptyComponents` go to `domain/ContentTree.entity.ts`. The facade keeps every exported name. Consumers that import these types by file (access 2 files, documents 6) take them through the facade as `import type` where possible. `content-row-mapping` is added to `UNMASKED_FILES` in `facade-reexports.architecture.spec.ts`. The module is not yet in `MIGRATED_MODULES` (its adapters follow in CR-ce-2).
  - Security note (AUD-CA4-6; CA1b N8): `content.repository`, `tree-loader` and `content-row-mapping` stay off the facade (mapping a row bypasses masking, D3); `naming.ts` and `quoteIdentifier` stay the only SQL-name sources; the richtext sanitizer config is unchanged.
  - Verify: CR-SV; `field-type-branches.architecture.spec` green.
  - Files: `apps/cms-api/src/modules/content-engine/**` (domain rows), import-path edits in `modules/{access,documents}` files that name the moved types, `src/architecture/source-paths.constants.ts`.

- [x] **CR-ce-2: content-engine ports, adapters and the registry load use case** · M · Deps: CR-ce-1, CR-pf-5, CR-pf-4 · core-builder · **Security gate: yes** (documents and access build their record paths on these ports) · Findings AUD-CA4-5, AUD-CA4-6 (facade), AUD-CA4-8, CA4 L3, L6.1-2 · SPEC D10, D18
  - Acceptance: ports `application/{ContentRepository.port.ts,ContentTypeRepository.port.ts}`; `application/ContentRegistry.service.ts` (lazy load, retry after failure, empty registry when not migrated; logs through `AppLogger`). It reads definitions only through the injected `ContentTypeRepository` port and imports no `adapters/` file (ADR 0006 §1, §2); the registry class to `domain/` without `fromDatabase`. Adapters: `KyselyContent.repository.ts` (was `ContentRepository`; methods take a `UnitOfWork`), `TreeLoader.adapter.ts`, `ComponentTableSync.adapter.ts`, `MigrationRunner.adapter.ts`, `MigrationFiles.adapter.ts`, `ContentDatabase.adapter.ts`, `PgContentType.repository.ts` (was `RegistryService.fromDatabase`; maps the not-migrated pg codes; implements `ContentTypeRepository` and receives its migration `Kysely` handle in the constructor), `MigrationDb.adapter.ts` (was `createMigrationDb` in `cli/migrate.ts`). Only wiring imports `MigrationDb.adapter.ts`: `ContentEngine.module.ts` builds `PgContentType.repository` from it with a `useFactory` bound to the `ContentTypeRepository` token, and the CLI builds it in `cli/ContentEngineCli.setup.ts` (a wiring file, the same pattern as `identity/cli/IdentityCli.setup.ts` in CR-id-4) and passes it to the command; `content-registry.provider.ts` stops importing `./cli/migrate`, `KyselyContentTransactionRunner.adapter.ts` bound to `CONTENT_TRANSACTION_RUNNER`, with the savepoint statements moved unchanged from `documents/bulk.service.ts`. Its unit keeps after-commit callbacks through the shared `infrastructure/database/AfterCommitCallbacks.store.ts` (ADR 0006 §7.12: synchronous callbacks, state `open` → `committed` / `rolledBack`, no own list), and the CR-pf-5 runner tests for registration order, rollback, late registration and a promise-returning callback are repeated against it; callbacks registered inside a savepoint step go on the outer unit's list and run only after the outer commit (also when that savepoint rolled back: a cache drop that was not needed only forces a re-read). The facade keeps `loadDefinitions` and `DEFAULT_CONTENT_PATHS` (Q-CA14b). Documents keeps its own Kysely transactions until CR-dc-3 through a transitional `unitOfWorkFromContentTrx(trx)`, listed in `KNOWN_LAYER_VIOLATIONS` with removedBy CR-dc-3. `MIGRATED_MODULES` adds `content-engine`.
  - Security note (CA3 must-not-change; AUD-CA4-8): the `forUpdate` row lock in `replaceTree` and the place `DocumentNotFoundError` is thrown stay the same; "not migrated → empty registry" still fails closed (unknown types are 404 everywhere); the pool parsers and migration lock key are unchanged.
  - Verify: CR-SV; `test/integration/{content-repository,content-migrations}.spec.ts` unchanged; `grep -rn "MigrationDb.adapter" apps/cms-api/src` matches only `ContentEngine.module.ts`, `cli/ContentEngineCli.setup.ts` and the adapter's own spec; `layers.architecture.spec.ts` has no `KNOWN_LAYER_VIOLATIONS` entry from `content-engine/application/` to `adapters/`; a unit spec builds `ContentRegistry` with `new` and a fake `ContentTypeRepository` (loaded, not migrated, failure then retry).
  - Files: `apps/cms-api/src/modules/content-engine/**`, `src/modules/documents/*.service.ts` (wrap the transaction handle only), `src/architecture/layer-rules.constants.ts`.

#### CR3: documents and graphql (core-builder)

- [x] **CR-dc-1: documents `domain/` and `http/` moves** · M · Deps: CR-ce-2, CR-pf-1, CR-pf-4 · core-builder · **Security gate: yes** (record read and write path, CA3 high-risk note) · Findings AUD-CA3-5, AUD-CA3-9, AUD-CA3-10, CA3 L6.2, CA3 L8 (documents rows) · SPEC D3, D10
  - Acceptance: `http/`: both controllers, routes, rate limits, the body-limit middleware, and `dto/*` flattened to `http/{ListDocuments,WriteDocument,Bulk,Presence}.requests.ts`; the constants split into `domain/Documents.constants.ts`, `http/DocumentsHttp.constants.ts` (query keys, body keys, id param) and `adapters/DocumentsSql.constants.ts` (`LIST_TIEBREAK_COLUMN`, `LIKE_SPECIALS_PATTERN`). `domain/`: `ListQuery.rules.ts` (the normalizer throws `DomainError(invalid_input, 'ACCESS_INVALID_REQUEST', message, { issues })`, the same body `invalidRequest` gives today), `QueryableFields.rules.ts`, `Diff.rules.ts`, `TreeCloner.rules.ts`, `ValueValidator.rules.ts` (its one site → `DomainError`). `document-filter.ts` is split: `coerceFilterValue` and the operator checks go to `domain/DocumentFilter.rules.ts`, and the Kysely expression part to `adapters/DocumentFilterSql.adapter.ts`. `Diff` and `TreeCloner` take content types through the content-engine facade (`import type`). graphql keeps `normalizeListQuery` through the documents facade.
  - Security note (CA1b N10; CA3 must-not-change): the list-query `details.issues[]` shape and code are identical (`list-documents.query.spec`, `list-arguments.spec`); filter, sort and search work only on readable fields, checked before any SQL is built; the `DOCUMENT_INVALID` text is unchanged; richtext is sanitized before it is stored.
  - Verify: CR-SV; `test/integration/documents-*.spec.ts` unchanged.
  - Files: `apps/cms-api/src/modules/documents/**` (http, domain and filter rows), `src/modules/graphql/*` (import paths only), `src/architecture/source-paths.constants.ts`.

- [x] **DEV-STACK: `pnpm dev:stack` for tier 2 tests** · M · Deps: none (scheduled after CR-dc-1, before CR-gq-1) · core-builder · skill `test-tiers` (tier 2) · SPEC §4 (commands), §11 (testing strategy)
  - Acceptance:
    - New `scripts/dev-stack.sh` with root scripts `dev:stack` (start) and `dev:stack:stop` (stop and remove its containers and volumes). It starts Postgres and Mailpit from ready images only (the `postgres:16-alpine` and `axllent/mailpit` tags already pinned in `docker-compose.smoke.yml`), with no image build, under its own compose project name `abyss-dev` (new `docker-compose.dev.yml`, or `docker run` with that label). It never starts, stops or reads `abyss-smoke` or any other stack, and its host ports come from `.localEnv.agent`, so it can run next to a smoke stack on 8080.
    - After the database answers: `db:migrate` and `content:migrate` (built `dist/` of cms-api, as the package scripts run them), then the owner bootstrap and the e2e account seeding through the existing helpers in `scripts/lib/stack-seed.sh` (sourced, not copied; the script defines `api_exec`, `pass` and `fail` for a host process instead of a container; if a helper only fits a container, the builder makes it take the runner as a parameter, keeping `scripts/smoke.sh` behavior identical).
    - cms-api (`start:dev`), cms-admin (`dev`) and web (`dev`) start in dev mode in the background with logs under the gitignored `.dev-stack/`; the script waits until each answers (cms-api `/health/ready` with `"status":"ok"`, the admin and web index pages) with a timeout, and on a timeout prints the log tail and stops what it started.
    - It writes `.dev-stack/e2e-vars.sh` with the `E2E_VARS` list of `stack-seed.sh` (dev URLs, seeded accounts, Mailpit URL, db container name). `scripts/e2e-spec.sh` uses the stack named by `E2E_STACK=dev|smoke`; without it, the one whose vars file exists; with both present and no `E2E_STACK`, it stops and asks for it. The smoke path is unchanged.
    - Env only from `.localEnv.agent` (created with generated dev-only values when missing, after `git check-ignore -q .localEnv.agent` and the `.dockerignore` check of the skill); the app processes get their values from it, never from a `.env*` file. Key names only (no values) go into the matching `.env.example` files (`apps/cms-api`, `apps/cms-admin`, `apps/web`, `apps/e2e`). `.dev-stack/` is added to `.gitignore` and `.dockerignore`.
    - Docs: `.claude/state/project.md` `dev stack (tier 2)` line names the start and stop commands and drops "not built yet"; `.claude/state/conventions.md` Testing line names `pnpm dev:stack` and `pnpm dev:stack:stop`; `apps/e2e/README.md` gains a "Dev stack (tier 2)" section. Three of these paths are outside core-builder's scope (`apps/e2e`, the `.env.example` files of cms-admin and web, the state files): the manager clears them for this task when dispatching it.
  - Security note: generated values are dev-only and never printed (the owner password is written only to the vars file, like the smoke script); no CORS, cookie or app config default changes to make dev mode pass: if an auth spec fails only because the dev origins differ from the smoke host, the builder reports `blocked` with the failing check instead of changing app code.
  - Verify: `pnpm dev:stack` from a clean state; then `pnpm e2e:spec tests/admin-auth.spec.ts` and `pnpm e2e:spec tests/media-library.spec.ts` pass against it (`E2E_STACK=dev`); `pnpm dev:stack:stop` leaves no `abyss-dev` container or volume; an `abyss-smoke` stack running at the same time is untouched (`docker compose -p abyss-smoke ps` before and after). The unit record states the start-up time of `pnpm dev:stack` next to `SMOKE_E2E=1 pnpm smoke` (time to the first e2e spec).
  - Tier: 2 (qc-cli runs the two specs on the dev stack; the smoke path of `e2e-spec.sh` is checked with one spec on a kept smoke stack only if the qc already has one, otherwise statically).
  - Files: `scripts/dev-stack.sh` (new), `docker-compose.dev.yml` (new, if used), `scripts/lib/stack-seed.sh` (runner parameter only, if needed), `scripts/e2e-spec.sh`, root `package.json` (scripts), `.gitignore`, `.dockerignore`, `apps/{cms-api,cms-admin,web,e2e}/.env.example` (key names), `apps/e2e/README.md`, `.claude/state/{project,conventions}.md` (the two lines above).

- [x] **CR-gq-1: graphql `http/` moves** · S · Deps: CR-dc-1 · core-builder · Findings CA3 L8 (graphql), AUD-CA3-5 · SPEC D18
  - Acceptance: per the CA3 L8 map with ADR 0008 names: routes, controller, body-limit middleware, `list-arguments`, `document.resolvers` → `http/Document.resolver.ts` (Q-CA16), the error formatter, `rules/` and `schema/` (to `http/rules/` and `http/schema/`, Q-CA10), and the constants split; `cli/` stays. The module imports `PermissionAction` from the access facade. `graphql.architecture.spec.ts` is green after every commit. The executor and the schema provider move in CR-gq-2.
  - Security note (CA3 must-not-change): hidden = unknown (same error text, count and locations); the visibility rule stays as the second line of defence; no path reaches `content.repository`, `tree-loader` or `field-projection`, and there is no Kysely in graphql; depth and complexity limits and `Cache-Control: no-store` are unchanged.
  - Verify: CR-SV; `test/integration/graphql.spec.ts` unchanged.
  - Target map (graphql 19 → 18 here, 17 after CR-gq-2): `Graphql.module.ts`, `index.ts`, `cli/print-schema.ts` (stays: the `graphql:print-schema` script runs its dist path); `http/Graphql.controller.ts`, `http/GraphqlBodyLimit.middleware.ts`, `http/Document.resolver.ts`, `http/ListArguments.rules.ts` (own spec), `http/GraphqlError.filter.ts` (was `error-format.ts`; the GraphQL counterpart of `HttpExceptionFilter`), `http/rules/{Limits.rules.ts,Visibility.rules.ts}`, `http/schema/{SchemaBuilder.rules.ts,FilterInputs.rules.ts,Scalars.rules.ts,SharedTypes.entity.ts,TypeNames.rules.ts}`; `application/Graphql.constants.ts` = the whole `graphql.constants.ts` plus `GRAPHQL_ROUTE` (used by the controller and the middleware), the module's one constants file, which `http/` imports, so it moves once and is not split (G3; this replaces "the constants split"); `graphql.executor.ts` and `graphql.schema.provider.ts` stay until CR-gq-2. Merged away: `graphql.routes.ts`.
  - Tier: 1 (behavior-preserving moves; `graphql.spec.ts` covers the endpoint).
  - Files: `apps/cms-api/src/modules/graphql/**`, `src/architecture/source-paths.constants.ts`, `docs/modules/graphql.md` (paths).

- [x] **CR-dc-2: documents repository, presence and activity ports** · M · Deps: CR-dc-1, CR-ce-2 · core-builder · **Security gate: yes** · Findings CA3 L3, AUD-CA3-6, CA4 L7 (activity) · SPEC D3, D10, D16
  - Acceptance: `application/Document.port.ts` (`DocumentRepository`, with the methods in CA3 L3) and `adapters/KyselyDocument.repository.ts`: every Kysely query moves unchanged from the four services and the filter adapter. `application/PresenceStore.port.ts` + `adapters/InMemoryPresence.store.ts` keep the same cap and TTL. The presence display-name lookup is `application/PresenceAccount.port.ts` + `adapters/PrismaPresenceAccount.adapter.ts`, selecting `displayName` only (Q-CA9b). Per Q-CA14a: `infrastructure/activity/*` → `documents/application/Activity.port.ts` + `documents/adapters/NoneActivity.adapter.ts` (removing the then-empty folder is reported for approval). The services call the ports; the row filter reaches the repository as the access-owned opaque `RowFilter` type (Q-CA17), and `application/` names no `kysely`.
  - Security note (AUD-CA3-3, AUD-CA3-6; CA1b N10; D3): the `forUpdate` row lock and the "published row is in the actor's publish scope" check stay in the same transaction as the swap; the presence lookup returns only `displayName` and `documentId`, never email or role; column lists come only from the field projection (unreadable columns are never selected); `RecordSerializer` stays the only record-to-response path.
  - Verify: CR-SV; documents and presence integration specs unchanged.
  - Target map (documents after CR-dc-3; 28 files + 3 in `infrastructure/activity` today → 25). This task also consolidates the CR-dc-1 files (G3-G5):
    - `domain/` (7): `Documents.constants.ts`, `ListQuery.rules.ts` (takes in `ListQuery.entity.ts` and `QueryableFields.rules.ts`), `Diff.rules.ts`, `TreeCloner.rules.ts`, `ValueValidator.rules.ts`, `DocumentFilter.rules.ts`; `Documents.errors.ts` comes in CR-dc-3.
    - `http/` (6): `Documents.controller.ts`, `Bulk.controller.ts`, `BulkBodyLimit.middleware.ts`, `DocumentsHttp.constants.ts` (takes in `Documents.routes.ts`, shared by both controllers and the middleware, and `DocumentsRateLimits.constants.ts`), `Documents.requests.ts` (was `ListDocuments.requests.ts`, takes in `WriteDocument.requests.ts` and `Presence.requests.ts`; specs merge), `Bulk.requests.ts`.
    - `application/` (7, after CR-dc-3): `Documents.port.ts` (`DocumentRepository`, the presence account lookup and the activity recorder port moved from `infrastructure/activity/activity.port.ts`), `DocumentsQuery.service.ts`, `DocumentsCommand.service.ts` (split by use case only if it still passes 300 lines after the repository extraction), `Publish.service.ts`, `Bulk.service.ts`, `BulkItem.errors.ts` (was `bulk-errors.ts`, own spec; CR-dc-3), `Presence.service.ts`, which keeps its in-memory store, cap and TTL: no `PresenceStore` port and no `InMemoryPresence.store.ts` (G1: no I/O, no second implementation).
    - `adapters/` (3): `KyselyDocument.repository.ts` (takes in `DocumentsSql.constants.ts`), `DocumentFilterSql.adapter.ts` (own spec), `PrismaPresenceAccount.adapter.ts` (Q-CA9b, `displayName` only; G6).
    - Wiring (2): `Documents.module.ts` binds the no-op activity recorder as a `useValue` (replaces `ActivityModule` and `NoneActivityRecorder`; `app.module.ts` stops importing `ActivityModule` if it does), `index.ts`.
    - Merged away: `domain/{ListQuery.entity.ts,QueryableFields.rules.ts}`, `http/{Documents.routes.ts,DocumentsRateLimits.constants.ts,WriteDocument.requests.ts,Presence.requests.ts}`, `adapters/DocumentsSql.constants.ts`, `infrastructure/activity/{activity.module.ts,none-activity.recorder.ts}` (and the then-empty folder); `activity.port.ts` is moved with `git mv` into `Documents.port.ts`.
  - Tier: 1 (behavior-preserving; documents and presence integration specs).
  - Files: `apps/cms-api/src/modules/documents/**`, `src/infrastructure/activity/**` (moves, Q-CA14a), `src/app.module.ts` (if the activity module binding moves), `src/modules/graphql/**` (import paths only), `src/architecture/{source-paths,layer-rules}.constants.ts`, `apps/cms-api/eslint.config.mjs` (exceptions, if a path is named), `src/contract/public-constants.ts` (paths), `docs/modules/access-control.md` (Q-CA9b overlap note).

- [x] **CR-dc-3: documents use cases: `DomainError`, `Clock`, `TransactionRunner`** · M · Deps: CR-dc-2, CR-pf-5 · core-builder · **Security gate: yes** · Findings AUD-CA3-1, AUD-CA3-3, AUD-CA3-4, AUD-CA3-7, AUD-CA3-8, CA3 L6.3-4, AUD-CA4-8 · SPEC D3, D10, §9
  - Acceptance: the 35 throw sites become `DomainError` with the same status, code, message and `details` (the 19 bare ones per ADR §7.2). The `ContentTreeError` → 400 mapping gets one owner (`domain/Documents.errors.ts`), used by both command and bulk. Presence "store full" becomes `DomainError(rate_limited)` with the same body. `new Date()` and the `Date.now()` default parameters → `Clock`. Transactions go through `CONTENT_TRANSACTION_RUNNER` (`publishIn`, `removeIn` and `prepareCreate` take a `UnitOfWork`; bulk non-atomic items use `runInSavepoint`). The publish activity failure is logged through `AppLogger`. The transitional `unitOfWorkFromContentTrx` is removed. **Planned change** (Q-CA14c): `DocumentNotFoundError` from `replaceTree` → `DomainError(not_found, DOCUMENT_NOT_FOUND)`, with an integration test for the concurrent-delete case. `MIGRATED_MODULES` adds `documents`, with no `KNOWN_LAYER_VIOLATIONS` left for it.
  - Security note (AUD-CA3-3; CA3 must-not-change; D3): one transaction per bulk call; atomic means the first error aborts all, non-atomic means a savepoint per item; activity is tracked after `run` resolves, not from an `afterCommit` callback (it is I/O; ADR 0006 §7.12); the row lock and scope check stay inside the swap transaction; the `DOCUMENT_VERSION_CONFLICT` body (`server`, `submitted`, `diff`) is serialized through the actor's read access (masking); the 403-vs-404 order in presence, `publish.begin` and `command.update` is unchanged.
  - Verify: CR-SV; `test/integration/documents-*.spec.ts` unchanged (apart from the planned-change test); a unit spec per use case with fake ports.
  - Target map: the documents map in CR-dc-2; this task adds `domain/Documents.errors.ts` (the `DomainError` constructors and the one `ContentTreeError` mapping; per G5 they go into `ValueValidator.rules.ts` if under 30 lines) and moves `bulk-errors.ts` to `application/BulkItem.errors.ts`.
  - Bulk item errors (planner decision, replaces "no `KNOWN_LAYER_VIOLATIONS` left for it" for this one file): `asItemError` needs `describeError` (`common/http`, a pipeline role that `application/` may not import), because access field errors (until CR-ac-3) and media reference errors (until CR-md-3) still throw Nest exceptions inside bulk items. So `documents/application/BulkItem.errors.ts → common/http/describe-http-exception.ts` is the one transitional `KNOWN_LAYER_VIOLATIONS` entry of documents, with removedBy CR-cl-1 (after CR-ac-3 and CR-md-3 no Nest exception reaches a bulk item, see CR-cl-1); `atomicFailure` returns a `DomainError` (same status, code, message and `details: { index, details }`).
  - Tier: 2 (planned change: the concurrent-delete answer becomes 404). Specs: `pnpm e2e:spec tests/content-bulk.spec.ts`, `tests/content-conflict.spec.ts`, `tests/content-presence.spec.ts`, `tests/content-form.spec.ts` on the dev stack.
  - Files: `apps/cms-api/src/modules/documents/**`, `src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter.ts` (transitional helper removed), `src/architecture/{layer-rules,source-paths}.constants.ts`.

- [x] **CR-gq-2: graphql executor into `http/`** · S · Deps: CR-gq-1, CR-dc-3 · core-builder · Findings CA3 L8 (executor, schema provider), AUD-CA3-8 · SPEC D18 · ADR 0006 §7.14 (revised 2026-10-26, CR-gq-2 answers)
  - Acceptance: `http/Graphql.executor.ts` (spec `http/Graphql.executor.spec.ts`) holds the executor (parse, limits, validate, execute; `isProduction` through the typed config, no `Logger`: the error formatter logs) and the per-readable-slug-set schema cache. It is transport, not a use case (ADR 0006 §7.14; ADR 0008 word `executor`). `graphql/application/` keeps only `Graphql.constants.ts`. `MIGRATED_MODULES` adds `graphql`. `LAYER_EXCEPTIONS` for graphql: the six permanent `cli/print-schema.ts` entries of ADR 0006 §7.14 in one block with one reason (`http/schema/{SchemaBuilder.rules.ts,FilterInputs.rules.ts,Scalars.rules.ts,SharedTypes.entity.ts,TypeNames.rules.ts}`, `common/http/request-parsing.ts`); no executor entries. `cli/print-schema.ts -> content-engine/cli/content-paths.ts` is a `KNOWN_LAYER_VIOLATIONS` entry with removedBy CR-ce-4. The controller deep-import entry (removedBy CR-ac-4) stays.
  - Security note: as CR-gq-1, and production still hides internal messages.
  - Verify: CR-SV; `graphql:print-schema -- --check` unchanged; `layers.architecture.spec.ts` green with graphql in `MIGRATED_MODULES`.
  - Target map (graphql 18 → 17): `http/Graphql.executor.ts` holds both the executor and the schema cache (was `graphql.executor.ts` + `graphql.schema.provider.ts`: no own spec for the provider, not an entry point, together under 300 lines); `application/Graphql.constants.ts` from CR-gq-1. Merged away: `graphql.schema.provider.ts`. Moves use `git mv`, content edits in a separate commit (Q-CA4).
  - Tier: 1 (behavior-preserving; `graphql.spec.ts`).
  - Files: `apps/cms-api/src/modules/graphql/**`, `src/architecture/{layer-rules,source-paths}.constants.ts`, `docs/modules/graphql.md` (paths).

#### CR4: access core (core-builder, all Security gate: yes)

- [x] **CR-ac-1: access core `domain/`** · M · Deps: CR-pf-1, CR-pf-2, CR-pf-6, CR-dc-3 · core-builder · **Security gate: yes** · Findings AUD-CA1b-4 (domain part), AUD-CA1b-6, AUD-CA1b-7, CA1b L8 (core domain rows), handoff CA1b F2 · SPEC D3, D5, D6, §8.3
  - Acceptance: the pure rule files move per the CA1b L8 map: actor context, effective policy, subject catalog, policy evaluator, conditions rules, the validators, token-scope subset, field list, validation issue, field paths, field errors (`FieldAccess.errors.ts`), rank rules, record read access, `RecordSerializer`, `WriteAllowlist.rules.ts`, `FieldProjection.rules.ts`, `QueryFieldAccess.rules.ts` (was `query.guard.ts`), and `ApiTokenExpiry.rules.ts` (unchanged, ET1). `access.constants` is split into `domain/Access.constants.ts`, `http/AccessHttp.constants.ts` (`PERMISSION_METADATA_KEY`) and `application/VersionCache.constants.ts`; `api-token.constants` into `domain/ApiToken.constants.ts` and `http/BearerHeader.constants.ts`. The Kysely assembly stays in `domain/PolicyEvaluator.ts` and `domain/Conditions.rules.ts` (the named `LAYER_RULES` exception, Q-CA17), and the facade exports the opaque `RowFilter` type. `record-serializer.architecture.spec.ts` gets the new paths, and its rule 2 also keys on the `http/` folder (AUD-CA1b-7, handoff F2). `domain/Access.constants.ts` takes `ContentDocument` through the content-engine facade type (CA1b L8 exception 4). The throws switch in CR-ac-3.
  - Security note (CA1b N7, N8, N9, N10, AUD-CA1b-6): conditions use catalog column names via `sql.ref` and values as bind parameters only; an invalid condition grants nothing; `$actor.id` null stays a bind parameter; reviewers get the `is_reviewer_preset` media filter; the serializer builds output from the definition and keeps the brand cast in one file; masked values, `_maskedFields` and the omission of `createdBy` / `updatedBy` for anonymous and reviewer actors are unchanged; constant values move unchanged.
  - Verify: CR-SV; `test/integration/{field-masking,access-guard}.spec.ts` unchanged.
  - Target map (access core, with `roles/` and document auth: 41 today → 36-37 after CR-ac-6; this task builds `domain/`):
    - `domain/` (17): `Access.constants.ts` (the domain part of `access.constants.ts`, plus `PermissionAction.entity.ts` and `AccountStatus.entity.ts` from CR-pf-6; their two parity specs merge into `Access.constants.spec.ts`), `ActorContext.entity.ts`, `EffectivePolicy.rules.ts`, `SubjectCatalog.rules.ts`, `PolicyEvaluator.ts` and `Conditions.rules.ts` (names fixed by Q-CA17), `PermissionSet.rules.ts`, `TokenScope.rules.ts` (`token-scope.validator.ts` + `token-scope-subset.ts`), `FieldList.rules.ts` (takes in `validation-issue.ts`), `FieldPaths.rules.ts` (takes in `field-errors.ts`: the field-access errors), `FieldProjection.rules.ts` (kept alone: the named cross-module deep import and the `facade-reexports` pin), `Rank.rules.ts`, `RecordReadAccess.rules.ts`, `RecordSerializer.ts` (pinned by `record-serializer.architecture.spec.ts`), `WriteAllowlist.rules.ts`, `QueryFieldAccess.rules.ts`, `ApiToken.rules.ts` (`ApiTokenExpiry.rules.ts` with `isApiTokenExpired` unchanged, the token-hash rule of CR-ac-2 and the domain part of `api-token.constants.ts`). `roles/system-roles.ts` joins `Access.constants.ts` in CR-ac-6 if the file stays at or under 300 lines, otherwise it becomes `domain/SystemRoles.entity.ts`.
    - The splits of this task change: `access.constants.ts` goes to `domain/Access.constants.ts`, its `PERMISSION_METADATA_KEY` to `http/Permission.guard.ts` and its version-cache values into `application/VersionCache.service.ts` (no `http/AccessHttp.constants.ts` part unless several `http/` files share a value; no `application/VersionCache.constants.ts`); `api-token.constants.ts` goes to `domain/ApiToken.rules.ts` and `http/ApiToken.guard.ts` (no `BearerHeader.constants.ts`).
    - Merged away: `domain/{PermissionAction,AccountStatus}.entity.ts`, `validation-issue.ts`, `field-errors.ts`, `token-scope-subset.ts`, `ApiTokenExpiry.rules.ts`, `api-token.constants.ts` (after its parts move).
  - Tier: 1 (behavior-preserving moves).
  - Files: `apps/cms-api/src/modules/access/*` (domain rows), `src/modules/access/record-serializer.architecture.spec.ts`, `src/architecture/{source-paths,layer-rules}.constants.ts`, `src/contract/public-constants.ts` (paths), `docs/modules/access-control.md` (paths).

- [x] **CR-ac-2: access core `application/` and `adapters/`** · M · Deps: CR-ac-1, CR-pf-5, CR-pf-4 · core-builder · **Security gate: yes** · Findings AUD-CA1b-2 (core part), AUD-CA1b-3, AUD-CA1b-10, CA1b L6.2-3 · SPEC D2, D5, D6, D16
  - Acceptance: `application/VersionCache.service.ts` + `domain/TtlMap.entity.ts` + `application/AccountVersionSource.port.ts` + `adapters/PrismaVersionSource.repository.ts`; `application/AnonymousActor.service.ts` + `application/RoleLookup.port.ts` + `adapters/PrismaRoleLookup.repository.ts` (the shared `RoleLookup`, exported through the facade for identity, AUD-CA1b-10); `application/ApiTokenAuthentication.service.ts` (raw token in, actor out) + `application/ApiTokenLookup.port.ts` + `adapters/PrismaApiTokenLookup.repository.ts` + `domain/ApiTokenHash.rules.ts`; `application/RolePermissions.service.ts` + `application/Permission.port.ts` + `adapters/PrismaPermission.repository.ts` (`alsoInTransaction` takes a `UnitOfWork`; the cache drop uses `afterCommit`); `application/AccessPolicy.service.ts`. New unit specs: `VersionCache` expiry and the generation guard, `AnonymousActor` failing closed without a public role, and `ApiTokenAuthentication` for every 401 cause (closes the CA1b test gap).
  - Security note (CA1b N2 a-f, N5, N11): the length cap before hashing; lookup by SHA-256 hash only; one bare 401 for every cause (unknown, revoked, expired with `<=`, malformed scope, creator disabled / deleted / missing, role missing); a narrow `select` (never `tokenHash`); the raw `last_used_at` write that never fails a request and never moves `updated_at`; the log line carries `documentId` only. `VersionCache`: generation check, 5 s TTL, invalidation only after commit. `invalidateAccount` / `invalidateRole` stay synchronous `void` methods with no I/O (ADR 0006 §7.12), registered as `unit.afterCommit(() => versions.invalidateRole(roleId))`, never an `async` callback; the `VersionCache` unit spec asserts both return `undefined`. `replacePermissions` keeps the rank re-check under lock in the same unit.
  - Verify: CR-SV; `test/integration/{api-tokens,accounts-roles,access-guard}.spec.ts` unchanged.
  - Target map (access core `application/` and `adapters/`; replaces the four ports files, `TtlMap.entity.ts` and `ApiTokenHash.rules.ts` named above):
    - `application/` (6, 7 after CR-ac-6): `Access.port.ts` (`AccountVersionSource`, `RoleLookup`, `ApiTokenLookup`, `PermissionRepository` and their tokens), `AccessPolicy.service.ts`, `AnonymousActor.service.ts`, `ApiTokenAuthentication.service.ts`, `RolePermissions.service.ts`, `VersionCache.service.ts` (keeps the TTL map, TTL and cap inside: no `domain/TtlMap.entity.ts`); CR-ac-6 adds `RoleSeed.service.ts`.
    - `adapters/` (3): `PrismaRolePolicy.repository.ts` (role lookup, permissions, role policy version; later the role seed writes), `PrismaApiTokenLookup.repository.ts` (narrow select, the raw `last_used_at` write), `PrismaAccountVersion.repository.ts` (account token version; G6 if under 30 lines).
    - The token-hash rule goes into `domain/ApiToken.rules.ts` (CR-ac-1).
  - Tier: 1 (behavior-preserving; api-tokens, accounts-roles and access-guard integration specs).
  - Files: `apps/cms-api/src/modules/access/*` (application and adapter rows), `src/modules/access/index.ts`, `src/architecture/source-paths.constants.ts`.

- [x] **CR-ac-3: access core `DomainError` swap** · S · Deps: CR-ac-2 · core-builder · **Security gate: yes** · Findings AUD-CA1b-1 (core part), CA1b L2 (core tables) · SPEC §9, D5, D6
  - Acceptance: the field errors (13 call sites), rank rules (2), the bare 401s in the authenticator and anonymous actor (7) and `requireAccountActor` (bare 403) throw `DomainError`. `InvalidPolicyDataError` and `InvalidConditionError` stay plain errors (caught and mapped as today). A body-parity spec covers each core code and the bare 401 / 403 bodies.
  - Security note (CA1b N4, N2c, N9): `ACCESS_RANK_FORBIDDEN` 403 and the strict `<` comparison are unchanged; `requireAccountActor` still runs in every management handler and still answers 403; every authentication cause gives one identical 401 body; the field errors keep their codes and 400.
  - Verify: CR-SV.
  - Target map: no new files; the throws change inside the CR-ac-1 / CR-ac-2 files.
  - Tier: 1 (behavior-preserving; the body-parity spec and the integration specs).
  - Files: `apps/cms-api/src/modules/access/{domain,application}/**`.

- [x] **CR-ac-4: access core `http/` and the document-auth sub-module** · M · Deps: CR-ac-3 · core-builder · **Security gate: yes** · Findings AUD-CA1b-7, AUD-CA1b-8, CA1b L6.1, L8 (core http rows, hazards), AUD-CA4-1 · SPEC §2, D5
  - Acceptance: the guards, decorator, throttle-subject resolver (`ActorThrottleSubject.resolver.ts`), routes, rate limits and HTTP constants move to `http/` (`ApiToken.guard.ts` keeps header parsing and the `request.user` write and calls `ApiTokenAuthentication`). Document auth becomes `access/document-auth/<layer>/` (Q-CA15c) with its own `http/` and `index.ts`, replacing `document-auth.ts`; `documents` and `graphql` import that facade; `module-graph.ts` decides the three access nodes by folder (the file-name regex goes). The `controller-handlers.ts` and `contract/public-constants.ts` paths are updated. `MIGRATED_MODULES` adds the access core and document auth. New tests: a table test of `DocumentAuthGuard` per header shape (absent, `Bearer ak_live_…`, other bearer, malformed), and a check that no management handler lacks permission metadata.
  - Security note (CA1b N1, N3): header absent → anonymous; `Bearer ak_live_` → token; any other header → JWT; a present but invalid credential is 401 and never anonymous; "no `@RequirePermission` metadata → allowed" stays, so every controller keeps its class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` and every handler its `@RequirePermission`; the 401 / 404 / 403 order is unchanged.
  - Verify: CR-SV; `modules.architecture.spec.ts` green with the three nodes; a scratch import from access core to identity fails it.
  - Target map (access core `http/` and document auth):
    - `http/` (4): `Permission.guard.ts` (takes in `permission.decorator.ts` and `PERMISSION_METADATA_KEY`), `ApiToken.guard.ts` (with the bearer-header constants), `ActorThrottleSubject.resolver.ts` (own spec; G6), `AccessHttp.constants.ts` (`access.routes.ts`, whose groups the three management controllers use, and `access.rate-limits.constants.ts`).
    - `document-auth/` (3): `http/DocumentAuth.guard.ts`, `DocumentAuth.module.ts`, `index.ts` (replaces `document-auth.ts`).
    - Wiring (2): `Access.module.ts`, `index.ts`.
    - Merged away: `permission.decorator.ts`, `access.rate-limits.constants.ts` (into `AccessHttp.constants.ts`, which is the `git mv` of `access.routes.ts`), `document-auth.ts` (replaced by `document-auth/index.ts`).
  - Tier: 1 (behavior-preserving; guard tables and integration specs; the CR4 phase check is tier 3 with the access e2e specs).
  - Files: `apps/cms-api/src/modules/access/**` (http rows, `document-auth/`), `src/modules/{documents,graphql}/**` (facade import paths), `src/architecture/{module-graph.ts,module-sub-rules.ts,source-paths.constants.ts,layer-rules.constants.ts}`, `src/contract/public-constants.ts` (paths).

#### CR5: security-audit and identity (core-builder, all Security gate: yes)

- [x] **CR-sa-1: security-audit in layers with an `AuditLogWriter` port** · S · Deps: CR-pf-5, CR-ac-4 · core-builder · **Security gate: yes** · Findings CA1a L8 (security-audit), AUD-CA1a-2 (audit part) · SPEC D15
  - Acceptance: `application/SecurityAudit.service.ts`, `application/AuditLogWriter.port.ts` (`write(unit, entry)`), `domain/AuditActor.rules.ts` (`auditActorOf`, `selfActor`), `domain/SecurityAudit.constants.ts`, `adapters/PrismaAuditLog.repository.ts` (the `writeAuditLog` body moved unchanged, including the email HMAC), `SecurityAudit.module.ts`. `writeAuditLog(tx, entry)` stays on the facade as a transitional wrapper for not-yet-migrated callers (listed with removedBy CR-cl-1). `security-audit-provider.architecture.spec` green. `MIGRATED_MODULES` adds `security-audit`.
  - Security note (D15; CA1a note under finding 2): the writer always takes the caller's unit and never opens its own transaction, so audit rows commit with the change they record; the email HMAC (HKDF-derived key) is byte-identical (fixture test with a known input and output); `AuditMetadataValue` is unchanged.
  - Verify: CR-SV.
  - Target map (security-audit 4 → 5, or 6): `application/SecurityAudit.service.ts` (holds the `AuditLogWriter` port and its token: under 30 lines, G1; no `AuditLogWriter.port.ts`), `domain/SecurityAudit.constants.ts`, `domain/AuditActor.rules.ts` only if it reaches 30 lines (otherwise `auditActorOf` and `selfActor` go into `SecurityAudit.service.ts`, still exported from the facade), `adapters/PrismaAuditLog.repository.ts`, `SecurityAudit.module.ts`, `index.ts`.
  - Tier: 1 (behavior-preserving; the email HMAC fixture test and the integration specs that write audit rows).
  - Files: `apps/cms-api/src/modules/security-audit/**`, `src/architecture/source-paths.constants.ts` (`security-audit-provider` pin).

- [x] **CR-id-1: identity `domain/` and the constants split** · M · Deps: CR-sa-1, CR-pf-1, CR-pf-6 · core-builder · **Security gate: yes** · Findings AUD-CA1a-8, AUD-CA1a-1 (error constructors), CA1a L8 (domain rows) · SPEC §7
  - Acceptance: `identity-auth.constants.ts` is split into `http/IdentityHttp.constants.ts` (cookie, no-store header, express cookie types) and `domain/IdentityAuth.constants.ts` (TTLs, codes); `identity.constants.ts` → `domain/Identity.constants.ts`; `setup-token.ts` → `domain/SetupToken.rules.ts` by `git mv` only, with **no content change**. New `domain/LoginFailure.rules.ts` (`loginFailureReason`), `domain/RefreshRotation.rules.ts` (the grace / reuse decision over plain values) and `domain/IdentityAuth.errors.ts`: `DomainError` constructors for every identity code in the CA1a L2 tables, keeping the per-site status (`AUTH_INVALID_2FA_CODE` 401 at login and 403 when signed in as two constructors; `AUTH_INVALID_CREDENTIALS` 401 and 403 kept apart). The services switch to them in CR-id-3. `auth-constants.pin.spec.ts` runs against the new files.
  - Security note (CA1a finding 8, must-not-change "Setup token"): cookie flags (HttpOnly, Secure, SameSite, Path) and the no-store value are unchanged; the setup-token compare file is byte-identical (length cap first, hash both sides, `timingSafeEqual`).
  - Verify: CR-SV; `git diff -M` shows `SetupToken.rules.ts` as a 100% rename.
  - Target map (identity 44 → 42 after CR-id-4; the later identity tasks use this map):
    - `domain/` (4): `Identity.constants.ts` (`identity.constants.ts`, the domain part of `identity-auth.constants.ts`, `OtpPurpose.entity.ts` and `TwoFaMethod.entity.ts` from CR-pf-6 with their parity specs merged, and the constants of `two-factor.shared.ts`), `Authentication.rules.ts` (new: `loginFailureReason` and the refresh grace / reuse decision; replaces `LoginFailure.rules.ts` and `RefreshRotation.rules.ts`), `Identity.errors.ts` (the constructors named `IdentityAuth.errors.ts` above), `SetupToken.rules.ts` (100% rename; G6 pin).
    - `application/` (18): `Identity.port.ts` (Account, RefreshToken and OtpCode repositories, and the `reset-second-factor.ts` interface), `Auth.service.ts`, `Password.service.ts` (takes in `password-hasher.ts`, G2), `TwoFactorManagement.service.ts`, `TwoFactorLogin.service.ts`, `TwoFactorEmailCode.service.ts` (takes in `otp-mail.ts` if it is the only user, otherwise `Otp.service.ts` does), `AccessToken.service.ts` (signs with `jsonwebtoken` itself, G2), `RefreshToken.service.ts`, `Otp.service.ts` (OTP HMAC inside, G2), `Totp.service.ts` (`otplib` inside, G2), `SecretBox.service.ts` (was `crypto/secret-box.ts`, own spec), `TwoFactorChallenge.store.ts` (in memory: no port), `AccessSession.service.ts`, `OwnerSetup.service.ts`, `OwnerBootstrap.service.ts`, `TwoFactorReset.service.ts`, `SessionRevocation.service.ts`, `SeedAccount.service.ts`.
    - `adapters/` (3): `PrismaAccount.repository.ts`, `PrismaRefreshToken.repository.ts`, `PrismaOtpCode.repository.ts` (takes the select shape of `two-factor.shared.ts`).
    - `http/` (9): `Auth.controller.ts` (takes in `login.request.ts`), `Password.controller.ts`, `Password.requests.ts`, `TwoFactor.controller.ts`, `TwoFactor.requests.ts`, `OwnerSetup.controller.ts` (takes in `owner-setup.requests.ts`), `AllowedOrigin.guard.ts`, `Jwt.strategy.ts`, `IdentityHttp.constants.ts` (cookie, no-store value, `identity.routes.ts` and `identity.rate-limits.constants.ts`; `auth-constants.pin.spec.ts` and `rate-limit-policies` read it).
    - `cli/` (6): `OwnerBootstrap.command.ts`, `OwnerReset2fa.command.ts`, `Seed.command.ts`, `SeedAccount.command.ts`, `PasswordInput.client.ts` (terminal input, own spec), `IdentityCli.setup.ts` (takes in `read-owner-env.ts`; specs merge).
    - Wiring (2): `Identity.module.ts`, `index.ts`.
    - This task builds `domain/` and `http/IdentityHttp.constants.ts`. Merged away here: `domain/{OtpPurpose,TwoFaMethod}.entity.ts`, `identity-auth.constants.ts` (after its parts move). Later merges are listed in CR-id-2..4.
  - Tier: 3 (the cookie flags and the no-store value move: cookies are a tier 3 area).
  - Files: `apps/cms-api/src/modules/identity/*` (domain and constants rows), `src/contract/public-constants.ts` (paths), `src/architecture/source-paths.constants.ts`, `docs/modules/owner-setup.md` (paths).

- [x] **CR-id-2: identity token, OTP and TOTP services behind ports** · M · Deps: CR-id-1, CR-pf-5, CR-pf-4, CR-ac-2 (`RoleLookup`) · core-builder · **Security gate: yes** · Findings AUD-CA1a-2, AUD-CA1a-3, AUD-CA1a-4, CA1a L3, L5, L8 (token, OTP, TOTP rows) · SPEC §7, D2
  - Acceptance (file names revised 2026-10-25, G1 / G2): one ports file `application/Identity.port.ts` (Account, RefreshToken and OtpCode repositories); adapters `Prisma{Account,RefreshToken,OtpCode}.repository.ts`; services `application/{AccessToken,RefreshToken,Otp,Totp,SecretBox}.service.ts` and `application/TwoFactorChallenge.store.ts`. Argon2 hashing, JWT signing and verifying, the OTP HMAC, `otplib` and the SecretBox cipher are library calls without I/O: they stay inside the service that uses them, with no port and no adapter (was: `PasswordHasher`, `AccessTokenSigner`, `TotpEngine`, `TwoFactorChallenge` ports and the `Argon2PasswordHasher`, `Jwt`, `Otplib`, `OtpHmac`, `SecretBox` adapters; Q-R3). Refresh-token time comes from `Clock` (5 sites), with a frozen-clock spec: reuse after the grace window revokes the family. `revokeAllSessions` and `OtpService.issue` / `tryConsume` take a `UnitOfWork`; callers in access management and reviewer wrap theirs with `unitOfWorkFromPrismaTx` until CR-ac-5 / CR-rv-2. The refresh-token reuse drop (`versions.invalidateAccount`) becomes a synchronous `afterCommit` callback on the runner-owned unit (ADR 0006 §7.12). `revokeAllSessions` registers no callback itself: its callers own the drop (as today), because a caller in access management or reviewer may still pass a borrowed `unitOfWorkFromPrismaTx` wrap, whose `afterCommit` throws. No Prisma type is left in identity `application/` (enums from identity and access `domain/`).
  - Security note (CA1a findings 2-4, must-not-change): the OTP `timingSafeEqual` and the single-use and 5-check counters stay conditional `updateMany` with count checks; refresh rotation keeps its transaction, row lock, grace-vs-reuse family revoke and conditional claim; the TOTP replay guard stays `totpLastStep < step`; `algorithms: [JWT_ALGORITHM]` stays on every verify path and `kid` selection is unchanged; the stored formats stay byte-identical (refresh-token hash, OTP HMAC with pepper, SecretBox ciphertext format, version, separator, AAD `context:kid`), each with a fixture test; select shapes stay narrow (no hash or TOTP secret leaves an adapter toward `http/`).
  - Verify: CR-SV; `test/integration/{auth,two-factor,password}.spec.ts` unchanged.
  - Target map: the identity map in CR-id-1 (token, OTP, TOTP, SecretBox, challenge-store and repository rows). Merged away here: `two-factor.shared.ts` (constants to `domain/Identity.constants.ts`, select shape to `PrismaOtpCode.repository.ts` or `PrismaAccount.repository.ts`), `reset-second-factor.ts` (into `Identity.port.ts`), `crypto/` (then empty).
  - Tier: 1 (behavior-preserving; stored-format fixture tests and the auth, two-factor and password integration specs).
  - Files: `apps/cms-api/src/modules/identity/**` (token, OTP and TOTP rows, `crypto/`), call-site wrap edits in `modules/{access/management,reviewer}`, `src/architecture/source-paths.constants.ts`.

- [x] **CR-id-3: identity sign-in, password and two-factor use cases with `DomainError`** · M · Deps: CR-id-2 · core-builder · **Security gate: yes** · Findings AUD-CA1a-1, AUD-CA1a-6, AUD-CA1a-9, CA1a L2 tables · SPEC §7, §9
  - Acceptance: `application/{Auth,Password,TwoFactorManagement,TwoFactorLogin,TwoFactorEmailCode}.service.ts` use the ports and throw the `IdentityAuth.errors` constructors (36 sites). No HTTP exception factory is left below `http/`. The auth controller's refresh handler clears the cookie for every refused refresh, keyed on `DomainError` kind `unauthenticated` (and still on a Nest `UnauthorizedException` from a guard), with a new test asserting the `Set-Cookie` clear on a refused token. Logging goes through `AppLogger`.
  - Security note (CA1a findings 1, 6, 9, must-not-change "Login"): exactly one Argon2id verify (with the startup dummy hash) runs before any status check; `loginFailureReason` stays pure and runs after the verify; the `recordLoginFailure` order is unchanged; every login failure cause gives the same 401 body; re-auth failures stay 403 `AUTH_INVALID_CREDENTIALS`; `revokeAllSessions` runs in the same unit as the password or 2FA write, and the use case's `invalidateAccount` drop is a synchronous `afterCommit` callback (ADR 0006 §7.12); the reset and two-factor mails are sent after `run` resolves, never from an after-commit callback; a full challenge store → 429 with `TOO_MANY_REQUESTS`; a SecretBox error → the code check is false; no `errorCode` reveals account state.
  - Verify: CR-SV; integration specs unchanged.
  - Target map: the identity map in CR-id-1 (use-case rows). Merged away here: `password-hasher.ts` (into `Password.service.ts`), `otp-mail.ts` (into its one user).
  - Tier: 3 (the refresh handler's cookie clearing changes place: cookies are a tier 3 area); the full e2e suite includes `admin-auth`, `two-factor` and `password-reset`.
  - Files: `apps/cms-api/src/modules/identity/**` (use-case rows, `auth.controller.ts`).

- [x] **CR-id-4: identity `http/`, the JWT strategy split, owner setup and the CLIs** · M · Deps: CR-id-3 · core-builder · **Security gate: yes** · Findings AUD-CA1a-5, AUD-CA1a-7, AUD-CA1a-10, CA1a L6.1-2, L6.5, L8 (http and cli rows) · SPEC §7, D2
  - Acceptance: the controllers, requests, routes, rate limits and `AllowedOrigin.guard` move to `http/`. `jwt.strategy.ts` → `http/Jwt.strategy.ts` (passport glue only) + `application/AccessSession.service.ts` (token version, active account, role policy version, reviewer session row). Owner setup: `http/` checks the setup token first, then parses the body, and `application/OwnerSetup.service.ts` receives parsed values; the `SetupClosedError` → fake 404 mapping stays in the controller. `owner-bootstrap`, `two-factor-reset` and `session-revocation` become application services that take a unit; the `cli/seed-account.ts` use case moves to `application/SeedAccount.service.ts` (the CLI keeps argument parsing and the password read). The CLIs build use cases through `cli/IdentityCli.setup.ts` instead of calling `openPrisma` inside commands, and they are renamed `cli/*.command.ts`. `identity-cli.architecture.spec` green. `MIGRATED_MODULES` adds `identity`.
  - Security note (CA1a findings 5, 7, 10; must-not-change JWT, "Setup token", route decorators): every version check runs on every request, and the strategy never returns before calling the use case; the setup token is checked before the body is parsed; the closed-setup 404 keeps the unknown-route bytes; every route keeps its `AllowedOriginGuard` (refresh, logout), `JwtAuthGuard`, `Throttle` and no-store header (compare a decorator listing before and after); `assertSeedAllowed` stays, and no password appears in argv or logs; `revokeAllSessions` and `OtpService` stay the only cross-module entry points to session and OTP writes, and no repository is exported.
  - Verify: CR-SV; `test/integration/{owner-setup,identity-bootstrap,seed-account,bootstrap}.spec.ts` unchanged; `SMOKE_E2E=1 pnpm smoke` green (owner setup and seed CLIs run in the smoke stack).
  - Target map: the identity map in CR-id-1 (`http/`, strategy, setup and `cli/` rows; route groups and rate limits stay in `http/IdentityHttp.constants.ts` because the four controllers and the cookie constants share them). Merged away here: `login.request.ts` (into `Auth.controller.ts`), `owner-setup.requests.ts` (into `OwnerSetup.controller.ts`), `identity.routes.ts` and `identity.rate-limits.constants.ts` (into `IdentityHttp.constants.ts`), `cli/read-owner-env.ts` (into `cli/IdentityCli.setup.ts`). The CLI renames change the dist paths in `apps/cms-api/package.json` (`db:migrate`, `db:seed`, `owner:bootstrap`, `seed:account`) and in `scripts/lib/stack-seed.sh` / `scripts/smoke/*.sh` / `scripts/dev-stack.sh` where they name a file.
  - Tier: 3 (route guards with `AllowedOriginGuard`, cookies, and the seed / bootstrap CLIs that `db:migrate` and the stacks run).
  - Files: `apps/cms-api/src/modules/identity/**` (http, strategy, setup, cli rows), `apps/cms-api/package.json` (CLI dist paths), `scripts/` (only if a CLI path in a script changes), `src/architecture/source-paths.constants.ts`, `src/contract/public-constants.ts` (paths), `docs/modules/owner-setup.md` (paths).

#### CR6: access management, media, reviewer (core-builder, all Security gate: yes)

- [x] **CR-ac-5: access management `domain/`, `application/` and `adapters/`** · M · Deps: CR-id-4, CR-sa-1 · core-builder · **Security gate: yes** · Findings AUD-CA1b-1 (management part), AUD-CA1b-2, CA1b L6.4, L8 (management rows) · SPEC D5, D6, D15
  - Acceptance: per the CA1b L8 map: `management/application/{Accounts,Invitations,Roles,ApiTokens}.service.ts`, ports `{AccountAdmin,Role,ApiToken}.port.ts`, adapters `Prisma{Account,Role,ApiToken}.repository.ts` (row locks, the advisory lock and the P2002 → 409 mapping move here); `account-records.ts` is split into `domain/Account.errors.ts`, an application view function (`AccountView.rules.ts`) and the repository. The services use `CORE_TRANSACTION_RUNNER` with `afterCommit` for the cache drops, and the 19 sites throw `DomainError` (with `details` and dynamic codes where listed). `ClientMeta` comes from `common/types`. The `unitOfWorkFromPrismaTx` wraps from CR-id-2 are removed here. New unit specs for the four services (closes the CA1b test gap).
  - Security note (CA1b N5, N6, N11, N12): the `FOR UPDATE` / `FOR SHARE` lock, the rank check and the write stay in one unit, in that order, and `ROLE_CAP_LOCK` stays; self-target stays 403, and reviewer or deleted accounts stay 404; a non-owner sees only their own tokens, and another account's token is 404; the scope-subset check runs against the creator's current role, and the runtime intersection stays; cache invalidation happens only after commit, as synchronous `afterCommit` callbacks (ADR 0006 §7.12); the invite mail is sent after `run` resolves, never from an after-commit callback; every write keeps its audit row in the same unit; the invite mail failure log keeps the error name and code only; the raw API token is returned only by create, and views never carry `tokenHash`, a password hash or TOTP data; expired tokens stay 409 `API_TOKEN_EXPIRED` on update (ET1).
  - Verify: CR-SV; `test/integration/{accounts-roles,api-tokens}.spec.ts` unchanged.
  - Target map (access management 14 → 18 after CR-ac-6):
    - `domain/` (3): `AccessManagement.constants.ts` (`access-management.constants.ts` + `api-tokens.constants.ts`), `AccessManagement.errors.ts` (the 19 sites' constructors and the `Account.errors` part of `account-records.ts`; G5), `Account.entity.ts` (the account view types and the view function, named `AccountView.rules.ts` above).
    - `application/` (5): `AccessManagement.port.ts` (`AccountAdmin`, `Role`, `ApiToken` repositories; replaces three ports files), `Accounts.service.ts`, `Invitations.service.ts`, `Roles.service.ts`, `ApiTokens.service.ts`.
    - `adapters/` (3): `PrismaAccount.repository.ts`, `PrismaRole.repository.ts`, `PrismaApiToken.repository.ts`.
    - `http/` (5, CR-ac-6) and wiring (2).
    - Merged away: `api-tokens.constants.ts`; `account-records.ts` is moved with `git mv` to its largest part.
  - Tier: 1 (behavior-preserving; accounts-roles and api-tokens integration specs; the CR6 phase check is tier 3).
  - Files: `apps/cms-api/src/modules/access/management/**` (domain, application, adapter rows), `src/architecture/source-paths.constants.ts`, `src/contract/public-constants.ts` (paths).

- [x] **CR-ac-6: access management `http/` and the role seeds** · S · Deps: CR-ac-5 · core-builder · **Security gate: yes** · Findings CA1b L8 (management http rows, `roles/`) · SPEC D5, D6
  - Acceptance: the controllers, requests and constants move to `management/http/`; `roles/system-roles.ts` → `domain/SystemRoles.constants.ts`; both seeds become application services that take a port, and `identity/cli/IdentityCli.setup.ts` wires the Prisma adapters (a wiring edit in identity). `MIGRATED_MODULES` adds access management.
  - Security note (CA1b N3, N12): every management controller keeps its class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` and a `@RequirePermission` on every handler (compare a decorator listing); the raw API token stays create-only with `Cache-Control: no-store`; the seeded slugs, ranks and permissions are byte-identical (`system-role-literals.architecture.spec` green).
  - Verify: CR-SV; `test/integration/role-permissions-seed.spec.ts` unchanged.
  - Target map: management `http/` (5): `Accounts.controller.ts`, `Roles.controller.ts`, `ApiTokens.controller.ts`, `AccessManagement.requests.ts` (accounts and roles; own spec), `ApiTokens.requests.ts`; wiring `AccessManagement.module.ts`, `index.ts`. `roles/`: `system-roles.ts` joins `access/domain/Access.constants.ts` if that file stays at or under 300 lines, otherwise `access/domain/SystemRoles.entity.ts` (the role table is entity data; not a second constants file, G3); `system-roles.seed.ts` and `role-permissions.seed.ts` become one `access/application/RoleSeed.service.ts` (one use case: seed the system roles and their permissions) with its port in `access/application/Access.port.ts` and its writes in `access/adapters/PrismaRolePolicy.repository.ts`. Merged away: `roles/role-permissions.seed.ts` (into `RoleSeed.service.ts`), `roles/system-roles.ts` (if it joins `Access.constants.ts`), the then-empty `roles/`.
  - Tier: 3 (the role seeds run in `db:migrate` through the identity seed CLI: a migration / init entry point).
  - Files: `apps/cms-api/src/modules/access/{management,roles,domain,application,adapters}/**`, `src/modules/identity/cli/IdentityCli.setup.ts`, `src/architecture/source-paths.constants.ts` (`system-role-literals` pin), `src/contract/public-constants.ts` (paths).

- [x] **CR-md-1: media `domain/` and `http/` moves** · M · Deps: CR-ac-6 · core-builder · **Security gate: yes** · Findings AUD-CA2-4, AUD-CA2-5, AUD-CA2-10, CA2 L8 (media domain and http rows) · SPEC D12, §12-13
  - Acceptance: routes, rate limits, requests and the controller move to `http/`, and the controller builds the `UploadStream { headers, declaredLength, body }` input. The media constants are split into domain, adapter, upload-processing and jobs parts. `domain/Uuidv7.rules.ts` gets its time as an argument from `Clock`. `domain/MediaFileName.rules.ts` holds `sanitizeFileName` and one `normalizeAlt`, used by both the multipart field and the PATCH request; `domain/MediaTypeAllowlist.rules.ts` holds the allowlist and size caps; there is an `http/` view mapper. `MediaKind` moves from `infrastructure/media/media.constants.ts` into `media/domain/` (Q-CA14a).
  - Security note (CA2 N2, N3, AUD-CA2-10): the allowlist keeps `Object.hasOwn` (no prototype keys), with no SVG or HTML; the per-kind caps are unchanged; `sanitizeFileName` stays a display name only (path segments and control characters stripped); the alt rule keeps both bounds on the multipart path (busboy `fieldSize: ALT_MAX_BYTES` with the `valueTruncated` refusal, and the 500-character count), trim and empty-to-null; `MediaView` never carries the storage key or the internal id; every handler keeps `PermissionGuard` + `@RequirePermission`.
  - Verify: CR-SV; `test/integration/{media,media-update}.spec.ts` unchanged.
  - Target map (media 15 + 5 in `infrastructure/media` today → 19 after CR-md-3; the later media tasks use this map):
    - `domain/` (5): `Media.constants.ts` (the domain part of `media.constants.ts` plus `MediaKind` from `infrastructure/media/media.constants.ts`), `Media.entity.ts` (`MediaView`, `MediaPage` and the media `DomainError` constructors, G5), `MediaUpload.rules.ts` (`sanitizeFileName`, the one `normalizeAlt`, the type allowlist and size caps, `sha256Hex`; replaces `MediaFileName.rules.ts` and `MediaTypeAllowlist.rules.ts`), `MediaSlots.rules.ts` (CR-md-3), `Uuidv7.rules.ts` (own spec).
    - `http/` (1): `Media.controller.ts` with its routes, rate-limit policies, the request schemas (`media.requests.ts`, 18 lines) and the view mapper (G3, G4: one controller, nothing shared); `rate-limit-policies` reads the controller path.
    - The other media constants go to their one user (adapter, upload processing, job); no `adapters/*.constants.ts` or `jobs/*.constants.ts` unless several files share a value.
    - `application/` (5), `adapters/` (5), `jobs/` (1): see CR-md-2 and CR-md-3. Wiring (2): `Media.module.ts`, `index.ts`.
    - Merged away here: `media.routes.ts`, `media.rate-limits.constants.ts`, `media.requests.ts` (into `Media.controller.ts`), `infrastructure/media/media.constants.ts` (into `Media.constants.ts`).
  - Tier: 1 (behavior-preserving; media and media-update integration specs).
  - Files: `apps/cms-api/src/modules/media/**` (domain and http rows), `src/infrastructure/media/media.constants.ts` (moved, Q-CA14a), `src/architecture/source-paths.constants.ts`, `src/contract/public-constants.ts` (paths).

- [x] **CR-md-2: upload pipeline split** · M · Deps: CR-md-1, CR-pf-1 · core-builder · **Security gate: yes** · Findings AUD-CA2-3, AUD-CA2-4, CA2 "Upload pipeline" step table · SPEC D12, §12-13
  - Acceptance: following the 17-step table: `application/UploadMedia.service.ts` (steps 2, 12, 13, 15, 16), ports `application/Upload.port.ts` (`UploadReceiver`, `FileTypeDetector`, `ImageReencoder`), adapters `BusboyUploadReceiver.adapter.ts` (steps 3, 4, 7), `FileTypeDetector.adapter.ts` (step 5) and `SharpImageReencoder.adapter.ts` (step 10), plus a pure `sha256Hex` in `domain/`. The four pipeline error sites throw `DomainError` (`unsupported_media_type` 415, `too_large` 413, `invalid_input` 400) with the same codes and messages. `upload.pipeline.spec.ts` is rewired to feed the synthetic multipart fixtures to the receiver adapter: the same cases, the same expectations.
  - Security note (CA2 N1-N5, "Upload and media" must-not-change): the `Content-Length` precheck runs before any parsing; the busboy limits are unchanged (`fileSize: MEDIA_MAX_FILE_BYTES + 1`, parts limit one above the allowed count); one `file` part and an optional `alt` field only; the type is detected from magic bytes before any byte is written; images are re-encoded with `limitInputPixels`, `.rotate()` and no metadata, undecodable images give 415, and the port offers no "store as received" path for images; the stored hash and size are of the re-encoded bytes; the storage key is a server UUIDv7; a failed row write deletes the stored object; the temp directory is removed in `finally` on every path, including a client abort.
  - Verify: CR-SV; `test/integration/media.spec.ts` unchanged.
  - Target map (replaces the three pipeline ports and three pipeline adapters above, G1 / G5): `application/Media.port.ts` (the module's one ports file; here it gets `UploadProcessor` with `receive`, `detectType` and `reencodeImage`, the three steps that do stream, filesystem and native-image I/O), `application/UploadMedia.service.ts` (steps 2, 12, 13, 15, 16, plus the `upload` part of `media.service.ts`), `adapters/UploadProcessing.adapter.ts` (busboy steps 3, 4, 7; `file-type` step 5; `sharp` step 10; one adapter for the one temp-upload technology; the `sharp` part moves to `adapters/SharpImageReencoder.adapter.ts` only if the file would pass 300 lines). `sha256Hex` is in `domain/MediaUpload.rules.ts`. `upload.pipeline.spec.ts` feeds the synthetic multipart fixtures to `UploadProcessing.adapter.ts` (same cases, same expectations). Merged away: nothing (`upload.pipeline.ts` is moved with `git mv` to `UploadProcessing.adapter.ts`).
  - Tier: 1 (behavior-preserving; the pipeline spec and `media.spec.ts`).
  - Files: `apps/cms-api/src/modules/media/**` (pipeline rows).

- [x] **CR-md-3: media library use cases, storage port and purge job** · M · Deps: CR-md-2, CR-pf-5 · core-builder · **Security gate: yes** · Findings AUD-CA2-1 (other sites), AUD-CA2-2, AUD-CA2-6, AUD-CA2-7, AUD-CA2-9, AUD-CA2-11, CA2 F2 · SPEC D12, D15
  - Acceptance: `application/Media.port.ts` (`MediaRepository`), `application/MediaReference.port.ts` + `adapters/MediaReference.adapter.ts` (was `media-usage.ts`; pure SQL builder and its spec kept), `adapters/PrismaMedia.repository.ts` (the Prisma and Kysely queries, with the row filter as the opaque `RowFilter`), `application/{DeleteMedia,UpdateMediaAlt,MediaLibrary,DocumentMedia,PurgeDeletedMedia}.service.ts`; `domain/MediaSlots.rules.ts` (`mediaSlots`, `cloneTree`); delete uses `CORE_TRANSACTION_RUNNER`; the 7 other sites throw `DomainError`; `deletedAt` comes from `Clock`. `jobs/MediaPurge.job.ts` (Q-CA7) on the shared interval-job helper (created here in `src/infrastructure/scheduling/IntervalJob.adapter.ts`, reused by CR-rv-2). Per Q-CA14a: `infrastructure/media/*` → `media/application/MediaStorage.port.ts` + `media/adapters/{Cloudinary,Fake}.adapter.ts` with the factory map kept in `Media.module.ts` (removing the then-empty folder is reported for approval; the manager updates the high-risk path list in `project.md`). F2 hardening, behavior-preserving: `UpdateMediaAlt` applies the row filter in the write's `where` (or checks and writes in one unit), and the 404 answers stay identical. `MIGRATED_MODULES` adds `media`.
  - Security note (CA2 N6, N7, N8, F2, N5 storage flags): list, update, delete and the document reference check use the actor's media row filter on the same query that resolves the file; unknown, deleted and out-of-scope files give the same 404 `MEDIA_NOT_FOUND`; a bad reference gives the one `DOCUMENT_INVALID` text; `embed` returns no internal id; delete is one unit (`FOR UPDATE`, reference check, soft delete, audit row); `quoteIdentifier` on every registry name and the id bound as `$1`; the purge re-checks references, deletes the object first and the row second, and keeps unknown-type rows; the Cloudinary flags (`overwrite: false`, `use_filename: false`, `unique_filename: false`, `type: 'upload'`) are unchanged; the fake provider is still refused in production.
  - Verify: CR-SV; `test/integration/{media-delete,media-update,media-document-refs}.spec.ts` unchanged.
  - Target map (replaces the separate `Media.port.ts`, `MediaReference.port.ts`, `MediaStorage.port.ts` and the five services above):
    - `application/` (5): `Media.port.ts` (`MediaRepository`, `MediaReferenceChecker`, `MediaStorage`, and `UploadProcessor` from CR-md-2), `UploadMedia.service.ts`, `MediaLibrary.service.ts` (list, update alt and delete: the use cases of one aggregate; delete moves to its own `DeleteMedia.service.ts` only if the file would pass 300 lines), `DocumentMedia.service.ts` (facade export), `PurgeDeletedMedia.service.ts` (the job's use case, Q-CA7).
    - `adapters/` (5): `PrismaMedia.repository.ts` (the Prisma and Kysely queries, including the two document-media reads), `MediaReference.adapter.ts` (was `media-usage.ts`, own spec), `UploadProcessing.adapter.ts`, `Cloudinary.adapter.ts`, `Fake.adapter.ts`.
    - `jobs/` (1): `MediaPurge.job.ts` (with its interval constants).
    - `domain/MediaSlots.rules.ts` (`mediaSlots`, `cloneTree`). `Media.module.ts` takes in the storage factory map of `infrastructure/media/media-storage.module.ts`.
    - Merged away: `media-update.service.ts` and `media-delete.service.ts` (into `MediaLibrary.service.ts`, which is the `git mv` of `media.service.ts`), `infrastructure/media/{storage.port.ts,media-storage.module.ts}` (into `Media.port.ts` and `Media.module.ts`) and the then-empty folder.
  - Tier: 3 (the storage provider binding and its config read at startup move, and the production refusal of the fake provider is production-only behavior); e2e `media-library` and `media-attach` run in the full suite.
  - Files: `apps/cms-api/src/modules/media/**`, `src/infrastructure/media/**` (moves, Q-CA14a), `src/infrastructure/scheduling/IntervalJob.adapter.ts` (new, Q-CA7), `src/app.module.ts` (if the storage module import moves), `src/architecture/{layer-rules,source-paths}.constants.ts`.

- [x] **CR-rv-1: reviewer `domain/` and `http/`** · S · Deps: CR-md-3, CR-pf-1 · core-builder · **Security gate: yes** · Findings AUD-CA2-5, AUD-CA2-10, CA2 L6.1-2, L6.7-8, L8 (reviewer domain and http rows) · SPEC §7 (reviewer), D16
  - Acceptance: routes, rate limits, requests and the controller move to `http/`. The controller no longer catches `ReviewerIpLimitedException`: the use case throws `DomainError(rate_limited, REVIEWER_IP_LIMITED, …, retryAfterSeconds)` and the filter writes `Retry-After` (CR-pf-1). The constants are split into `domain/Reviewer.constants.ts`, `adapters/ReviewerStorage.constants.ts` (setting key, advisory lock id, HMAC parameters) and `jobs/ReviewerCleanup.constants.ts`; `domain/ReviewerAdmission.rules.ts` (cap, window, retry seconds, `isReviewerSessionActive`) and `domain/ReviewerSession.entity.ts` (views) are added; one `reviewer_settings` subject constant is used, after checking whether access already owns one.
  - Security note (CA2 N9, N10, N12, AUD-CA2-10): `REVIEWER_SESSION_LOCK` and the HKDF / HMAC inputs (digest, empty salt, info `abyss/reviewer-ip/v1`, length) are byte-identical; 429 keeps `Retry-After` (at least 1 s); all four routes keep their throttles and `Cache-Control: no-store`; owner routes keep `JwtAuthGuard + PermissionGuard` with `reviewer_settings` and `requireAccountActor`; `status` stays public; the subject string is the exact seeded value.
  - Verify: CR-SV; `test/integration/reviewer.spec.ts` unchanged (including the `Retry-After` check).
  - Target map (reviewer 9 + 4 in `infrastructure/turnstile` today → 13 after CR-rv-2; CR-rv-2 uses this map):
    - `domain/` (2): `Reviewer.constants.ts` (the domain part of `reviewer.constants.ts`), `ReviewerAdmission.rules.ts` (cap, window, retry seconds, `isReviewerSessionActive`, the session view types and the reviewer `DomainError` constructors; replaces `ReviewerSession.entity.ts`, G5).
    - `http/` (2): `Reviewer.controller.ts` (with `reviewer.routes.ts` and `reviewer.rate-limits.constants.ts`: one controller, G3), `Reviewer.requests.ts` (own spec).
    - The storage constants (setting key, advisory lock id, HMAC parameters) go to their one user in CR-rv-2 (`adapters/PrismaReviewer.repository.ts` or `application/ReviewerAccess.service.ts`), the cleanup constants to `jobs/ReviewerCleanup.job.ts`: no `adapters/ReviewerStorage.constants.ts` or `jobs/ReviewerCleanup.constants.ts`.
    - `application/` (3), `adapters/` (3), `jobs/` (1): see CR-rv-2. Wiring (2): `Reviewer.module.ts`, `index.ts`.
    - Merged away here: `reviewer.routes.ts`, `reviewer.rate-limits.constants.ts` (into `Reviewer.controller.ts`).
  - Tier: 1 (behavior-preserving; `reviewer.spec.ts` checks the 429 and `Retry-After`).
  - Files: `apps/cms-api/src/modules/reviewer/**` (domain and http rows), `src/contract/public-constants.ts` (paths), `src/architecture/source-paths.constants.ts`.

- [x] **CR-rv-2: reviewer `application/`, `adapters/` and the cleanup job** · M · Deps: CR-rv-1, CR-pf-5 · core-builder · **Security gate: yes** · Findings AUD-CA2-1 (reviewer), AUD-CA2-2, AUD-CA2-7, AUD-CA2-8, AUD-CA2-9, AUD-CA2-11, CA2 L3 · SPEC §7 (reviewer), D15, D16
  - Acceptance: `application/ReviewerAccess.service.ts` (status, toggle, create session, list); ports `application/Reviewer.port.ts` (`ReviewerSettingsRepository`, `ReviewerSessionRepository`, `ReviewerAccountGateway` (Q-CA9b: the account and role SQL stays here behind the port), `IpHasher`); adapters `PrismaReviewerSettings.repository.ts`, `PrismaReviewerSession.repository.ts`, `PrismaReviewerAccount.adapter.ts` and `HkdfIpHasher.adapter.ts` (key derived at wiring, so the use case no longer reads `APP_CONFIG`). `CORE_TRANSACTION_RUNNER` with `afterCommit` for the version-cache drops; the 5 sites throw `DomainError`. `application/ReviewerCleanup.service.ts` + `jobs/ReviewerCleanup.job.ts` (Q-CA7). Per Q-CA14a: `infrastructure/turnstile/*` → `reviewer/application/Turnstile.port.ts` + `reviewer/adapters/Turnstile.client.ts` (+ constants, module binding; removing the empty folder is reported for approval). The last `unitOfWorkFromPrismaTx` and `writeAuditLog` wrapper calls in reviewer are removed. `MIGRATED_MODULES` adds `reviewer`.
  - Security note (CA2 N9, N10, N11, N13, N14, "Reviewer" must-not-change): `createSession` keeps its order (availability, cheap DB refusals, Turnstile verify, then the unit with `pg_advisory_xact_lock` and the `FOR SHARE` re-check), with the two-call `assertAllowed` shape; switching off keeps the setting upsert, the role `policy_version` bump, the reviewer `token_version` bump and the audit row in one unit, and drops the cache after commit through synchronous `afterCommit` callbacks (ADR 0006 §7.12); the visitor IP is stored and audited only as the keyed HMAC, and `ipHmac` is never returned; Turnstile keeps its secret in the client (never logged), the 5 s timeout, the zod-parsed reply, the lowercased hostname check, `unavailable` on any network or parse error, and the unconfigured verifier as the default; cleanup deletes only reviewer-role accounts whose every session has expired, then invalidates the cache per account; the 201 body is the access token only.
  - Verify: CR-SV; `test/integration/reviewer.spec.ts` unchanged.
  - Target map (replaces the separate `Turnstile.port.ts`, `HkdfIpHasher.adapter.ts` and the settings / session repository split above, G1 / G2 / G5):
    - `application/` (3): `Reviewer.port.ts` (`ReviewerRepository` for settings and sessions, `ReviewerAccountGateway` (Q-CA9b), `TurnstileVerifier`), `ReviewerAccess.service.ts` (status, toggle, create session, list; the HKDF / HMAC IP hashing stays here as a library call, with the key derived once in `Reviewer.module.ts` and injected, so the use case still does not read `APP_CONFIG`), `ReviewerCleanup.service.ts`.
    - `adapters/` (3): `PrismaReviewer.repository.ts` (settings and sessions: one aggregate, one technology), `PrismaReviewerAccount.adapter.ts` (Q-CA9b), `Turnstile.client.ts` (with the turnstile constants and the unconfigured verifier, the default binding).
    - `jobs/` (1): `ReviewerCleanup.job.ts`. `Reviewer.module.ts` takes in the binding of `infrastructure/turnstile/turnstile.module.ts`.
    - Merged away: `infrastructure/turnstile/{turnstile.port.ts,turnstile.constants.ts,turnstile.module.ts}` (into `Reviewer.port.ts`, `Turnstile.client.ts` and `Reviewer.module.ts`) and the then-empty folder.
  - Tier: 3 (the Turnstile binding and its config read at startup move into the module); e2e `reviewer-dialog` and `reviewer-session` run in the full suite.
  - Files: `apps/cms-api/src/modules/reviewer/**`, `src/infrastructure/turnstile/**` (moves, Q-CA14a), `src/app.module.ts` (if the turnstile module binding moves), `src/architecture/{layer-rules,source-paths}.constants.ts`.

#### CR6b: consolidation of the modules moved before §4.4 (core-builder; added 2026-10-25)

Behavior-preserving merges only (ADR 0006 §7.13 "Supersedes"); one commit each; every rule of the CR revision (G1-G10) applies. Each task updates the pinned paths (`architecture/source-paths.constants.ts`, the lists in `architecture/layer-rules.constants.ts`, the exceptions in `apps/cms-api/eslint.config.mjs`), `contract/public-constants.ts` paths, `docs/modules/*.md` and test imports; the integration and architecture suites stay unchanged apart from paths.

- [x] **CR-cs-1: Consolidate `health` and `content-types`** · S · Deps: CR-rv-2 · core-builder · ADR 0006 §7.13 · SPEC §2
  - Acceptance:
    - `health` (8 → 5): `application/CheckReadiness.service.ts` takes in `application/DatabaseHealth.port.ts` (the port and its token, under 30 lines, G1) and `application/Health.constants.ts` (used only there); `http/Health.controller.ts` takes in `http/Health.routes.ts`; `adapters/PrismaDatabaseHealth.adapter.ts` stays (G6); `Health.module.ts`, `index.ts`.
    - `content-types` (8 → 5): `application/ContentTypes.service.ts` takes in `application/ContentTypes.constants.ts`; `domain/ContentTypeView.rules.ts` takes in `domain/ContentTypes.errors.ts` (G5); `http/ContentTypes.controller.ts` takes in `http/ContentTypes.routes.ts`; `ContentTypes.module.ts`, `index.ts`.
    - Merged away: `health/application/{DatabaseHealth.port.ts,Health.constants.ts}`, `health/http/Health.routes.ts`, `content-types/application/ContentTypes.constants.ts`, `content-types/domain/ContentTypes.errors.ts`, `content-types/http/ContentTypes.routes.ts`.
  - Verify: CR-SV; `test/integration/{health,content-types}.spec.ts` and `content-types.contract.spec.ts` unchanged apart from import paths; the 404 `CONTENT_TYPE_NOT_FOUND` and the `/health/*` bodies byte-identical.
  - Tier: 1 (behavior-preserving merges).
  - Files: `apps/cms-api/src/modules/{health,content-types}/**`, `apps/cms-api/test/integration/{health,content-types}*.spec.ts` (import paths), `src/architecture/{source-paths,layer-rules}.constants.ts`, `apps/cms-api/eslint.config.mjs`, `src/contract/public-constants.ts` (paths), `apps/cms-api/README.md` ("Module layout" checklist: point to §4.4 and the G rules).

- [x] **CR-cs-2: Consolidate the platform files of CR-pf-1..6** · S · Deps: CR-cs-1 · core-builder · ADR 0006 §7.3, §7.6, §7.7, §7.13 · SPEC §2, §9
  - Acceptance:
    - `common/errors/Domain.errors.ts` takes in `DomainErrorKinds.constants.ts` (`DOMAIN_ERROR_KINDS`, `DomainErrorKind`; the kinds are the type of `DomainError`).
    - `common/http/describe-http-exception.ts` takes in `DomainErrorHttpStatus.constants.ts` and `ErrorCodeByStatus.constants.ts` (it is their only importer; a missing kind still fails to compile).
    - `common/http/client-ip.resolver.ts` takes in `common/http/client-meta.ts` (`clientMetaOf`); `common/types/ClientMeta.entity.ts` stays (G6: the `pure` role of ADR 0006 §7.6 needs the type outside `common/http/`, and `application/` imports it). Every importer of `ClientMeta` reads it from `common/types/`; the re-export goes.
    - `common/http/request-parsing.ts` drops its re-exports of the names moved to `common/validation/SharedSchemas.rules.ts` once no importer uses them (each importer switches its path).
    - Unchanged, with the reason in the unit record: `infrastructure/logging/{AppLogger.port.ts,NestAppLogger.adapter.ts,Logging.module.ts}` (port role, adapter role and wiring are separate roles, G6), `infrastructure/database/{TransactionRunner.port.ts,PrismaTransactionRunner.adapter.ts,AfterCommitCallbacks.store.ts}` (each over 30 lines; ADR §7.12 names the store as the owner), `architecture/{layer-rules,source-paths}.constants.ts` and `layer-check.ts` (each over 100 lines, separate owners).
    - `common/` 26 → 22 source files. Merged away: `common/errors/DomainErrorKinds.constants.ts`, `common/http/{DomainErrorHttpStatus.constants.ts,ErrorCodeByStatus.constants.ts,client-meta.ts}`.
  - Security note (CR-pf-1, AUD-CA4-9): the 5xx rule (generic message, no `details`), `Retry-After` only on 429 and the kind-to-status table are unchanged; the parity and contract specs of CR-pf-1 pass unchanged apart from import paths.
  - Verify: CR-SV; `common/http/describe-http-exception.spec.ts`, `common/filters/http-exception.filter.spec.ts` and `architecture/error-contract.spec.ts` unchanged apart from import paths; `grep -rln "@nestjs" apps/cms-api/src/common/{constants,errors,types,validation}` prints nothing.
  - Tier: 1 (behavior-preserving merges; error bodies pinned by the specs).
  - Files: `apps/cms-api/src/common/{errors,http,types,validation}/**`, import-path edits in `src/modules/**`, `src/architecture/**` specs and `test/integration/**`, `src/architecture/{source-paths,layer-rules}.constants.ts`, `apps/cms-api/eslint.config.mjs`.

- [x] **CR-cs-3: Consolidate `content-engine`** · M · Deps: CR-cs-2 · core-builder · **Security gate: yes** (D3 masking pins and the content-migration entry point) · ADR 0006 §7.13 · Findings AUD-CA4-6 · SPEC D3, D10
  - Acceptance (content-engine 38 → 32; 31 after CR-ce-4):
    - `application/ContentEngine.port.ts` = `ContentRepository.port.ts` + `ContentTypeRepository.port.ts` (one ports file, G1); `application/ContentRegistry.service.ts` unchanged.
    - `adapters/ContentDatabase.adapter.ts` takes in `MigrationDb.adapter.ts` (`createMigrationDb`) and `ContentEnginePersistence.constants.ts` (26 lines, shared by the adapters); the other seven adapters stay (each over 30 lines; `TreeLoader.adapter.ts` stays apart from `KyselyContent.repository.ts` because together they would pass 300 lines).
    - `domain/ContentDocument.entity.ts` takes in `ContentEngine.errors.ts`; `domain/ContentEngine.constants.ts` takes in `SqlReservedWords.constants.ts` (one constants file per layer, G3); `domain/field-types/ValueParsers.rules.ts` takes in `ValuePatterns.constants.ts`. `ContentRowMapping.rules.ts` stays its own file (off the facade, in `UNMASKED_FILES`).
    - `cli/content-paths.ts` is not merged here: CR-ce-4 moves `DEFAULT_CONTENT_PATHS` into `adapters/MigrationFiles.adapter.ts` (ADR 0006 §7.14; revised 2026-10-26). `cli/generate.ts` and `cli/migrate.ts` keep their names: the `content:generate` and `content:migrate` scripts run their dist paths, and renaming a deploy entry point is out of scope.
    - Merged away: `application/ContentTypeRepository.port.ts` (`ContentRepository.port.ts` is moved with `git mv` to `ContentEngine.port.ts`), `adapters/{MigrationDb.adapter.ts,ContentEnginePersistence.constants.ts}`, `domain/{ContentEngine.errors.ts,SqlReservedWords.constants.ts}`, `domain/field-types/ValuePatterns.constants.ts`. `MigrationDb.adapter.spec.ts` merges into `ContentDatabase.adapter.spec.ts`.
  - Security note (AUD-CA4-6; CA1b N8; CR-ce-2): `KyselyContent.repository`, `TreeLoader` and `ContentRowMapping` stay off the facade; `Naming.rules.ts` and `quoteIdentifier` stay the only SQL-name sources; the pool parsers, the migration lock key and the not-migrated pg codes are unchanged; "not migrated → empty registry" still fails closed.
  - Verify: CR-SV; `facade-reexports`, `field-type-branches` and `layers` architecture specs green; `test/integration/{content-repository,content-migrations}.spec.ts` unchanged; `grep -rn "createMigrationDb" apps/cms-api/src` matches only `ContentEngine.module.ts`, `cli/ContentEngineCli.setup.ts`, `adapters/ContentDatabase.adapter.ts` and its spec.
  - Tier: 3 (the `content:migrate` composition (`createMigrationDb`, `DEFAULT_CONTENT_PATHS`) changes file: a migration entry point).
  - Files: `apps/cms-api/src/modules/content-engine/**`, import-path edits in `src/modules/{documents,access,graphql,content-types,media}/**` and `test/integration/**`, `src/architecture/{source-paths,layer-rules}.constants.ts`, `src/architecture/facade-reexports.architecture.spec.ts` (`UNMASKED_FILES` paths), `apps/cms-api/eslint.config.mjs`, `docs/modules/content-schema.md` (paths).

- [x] **CR-ce-4: `DEFAULT_CONTENT_PATHS` into the content-engine adapters** · S · Deps: CR-gq-2, CR-cs-3 · core-builder · ADR 0006 §7.14, §7.13 · SPEC D10
  - Acceptance: `DEFAULT_CONTENT_PATHS` (and its private `CONTENT_ROOT`) moves unchanged into `content-engine/adapters/MigrationFiles.adapter.ts`, next to `loadDefinitions`. `adapters/` sits at the same depth as `cli/`, so the `__dirname`-relative path resolves to the same `apps/cms-api/content` for ts-jest and the built CLI. The facade keeps exporting `DEFAULT_CONTENT_PATHS` (Q-CA14b), now from the adapter. The importers change path only: `cli/migrate.ts`, `cli/generate.ts`, `cli/generate.spec.ts` (and `cli/ContentEngineCli.setup.ts` if it imports it), `index.ts`, `test/integration/{content-repository,content-migrations,field-masking}.spec.ts`. The `KNOWN_LAYER_VIOLATIONS` entry `graphql/cli/print-schema.ts -> content-engine/cli/content-paths.ts` (removedBy CR-ce-4) is removed. `cli/content-paths.ts` becomes empty; its deletion is reported for approval.
  - Verify: CR-SV; `content:generate -- --check` and `graphql:print-schema -- --check` unchanged; `pnpm --filter cms-api content:migrate` against the dev DB reads the same schemas and migrations folders; `test/integration/{content-repository,content-migrations,field-masking}.spec.ts` unchanged apart from import paths; `layers.architecture.spec.ts` green with the entry gone.
  - Target map: content-engine 32 → 31 (merged away: `cli/content-paths.ts`).
  - Tier: 1 (behavior-preserving move of one constant; the CR6b phase check is tier 3).
  - Files: `apps/cms-api/src/modules/content-engine/{adapters/MigrationFiles.adapter.ts,cli/**,index.ts}`, `apps/cms-api/test/integration/{content-repository,content-migrations,field-masking}.spec.ts`, `src/architecture/{layer-rules,source-paths}.constants.ts`, `docs/modules/content-schema.md` (paths).

#### CR7: close (core-builder)

- [x] **CR-cl-1: Close the refactor: contract imports, ownership guard, transitional helpers** · S · Deps: CR-gq-2, CR-ac-6, CR-md-3, CR-rv-2, CR-cs-3, CR-ce-4 · core-builder · Findings AUD-CA4-7, AUD-CA4-13 · SPEC §2, §5
  - Acceptance: `contract/public-constants.ts` imports module constants through facades (each facade exports its contract constants additively) and no longer by file. `common-ownership.architecture.spec.ts` also covers `infrastructure/` (a port or adapter used by one module only fails). `unitOfWorkFromPrismaTx` and the transitional `writeAuditLog` wrapper are removed once no caller is left (`grep` returns nothing). `MIGRATED_MODULES` is replaced by "every module", and `KNOWN_LAYER_VIOLATIONS` is empty. ADR 0006 status notes "implemented" with the CR commit range. The SPEC §5 tree matches the code.
  - Bulk item errors (from CR-dc-3; added 2026-10-25): after CR-ac-3 and CR-md-3 no Nest exception reaches a bulk item. `documents/application/BulkItem.errors.ts` then reads only `DomainError` (an item error is a `DomainError` whose kind is not `unavailable`; anything else fails the request as today), and the item body (`statusCode`, `errorCode`, `message`, `details`) is built in `documents/http/Bulk.controller.ts` with `describeError`. The transitional `KNOWN_LAYER_VIOLATIONS` entry goes. The item bodies and the atomic failure body stay byte-identical (the `BulkItem.errors` spec cases and the documents bulk integration spec unchanged). Security note (AUD-CA3-2, AUD-CA4-9): a server error is never an item result, and a 5xx keeps the generic message.
  - Verify: CR-SV; `contract:print -- --check` unchanged; adding an unlayered scratch file to any module fails `layers.architecture.spec.ts` (then revert).
  - Target map: no new files; `MIGRATED_MODULES` and its list go from `layer-rules.constants.ts`.
  - Tier: 1 (behavior-preserving; contract check and integration specs). The CR7 phase check is tier 3.
  - Files: `apps/cms-api/src/contract/public-constants.ts`, module `index.ts` files (additive exports), `src/modules/documents/{application/BulkItem.errors.ts,http/Bulk.controller.ts}` and their specs, `src/architecture/{common-ownership.architecture.spec.ts,layer-rules.constants.ts}`, `src/infrastructure/database/PrismaTransactionRunner.adapter.ts`, `src/modules/security-audit/index.ts`, `docs/adr/0006-cms-api-clean-architecture-layers.md`.

## Direct request: expired API tokens are not editable (ET) — PROPOSED 2026-10-25

User decision (handoff, from the CA1b security review): an expired API token is treated like a revoked one; `PATCH /api-tokens/:id` on an expired token is `409` and never sets a new `expiresAt`. SPEC §7 D5 updated. Flat list (one feature); build order ET1 -> ET2 -> ET3. SV is the R-phase SV in "Refactor: Audit fixes" above.
Open questions (user): **Q-ET1** error code of the 409 (recommended: new `API_TOKEN_EXPIRED`); **Q-ET2** are name and scope edits blocked too (recommended: yes, the whole PATCH); **Q-ET3** may an expired token still be revoked (recommended: yes, `204`, unchanged). The tasks below are written with the recommended answers; a different answer changes only the lines marked (Q-ET*).

Design (module ownership, names, extension path):
- Owner of "is this token expired": `access` core, one pure function `isApiTokenExpired(expiresAt: Date | null, nowMs: number): boolean` (`expiresAt !== null && expiresAt.getTime() <= nowMs`) in a new file `apps/cms-api/src/modules/access/ApiTokenExpiry.rules.ts` (ADR 0008 name per the accepted FN2 default: new files follow the rule now; the CR refactor moves it into `access/domain/` unchanged). Today the same `<=` test is written three times (`ApiTokenAuthenticator.authenticate` in `api-token.guard.ts`, `ApiTokensService.view` and `ApiTokensService.checkedExpiry`); all three call the function after ET1, so the 401 at authentication, the `expired` list status and the PATCH 409 agree to the millisecond.
- Owner of the token status and of "which statuses may be edited": `access/management` (`api-tokens.constants.ts` already owns `API_TOKEN_STATUSES`). `ApiTokensService` derives the status once with a private `statusOf(row)` (used by `view` and `update`); `update` rejects every status except `active` through one map `UPDATE_BLOCKED_BY_STATUS: Record<Exclude<ApiTokenStatus, 'active'>, () => ConflictException>` (revoked -> `API_TOKEN_REVOKED`, expired -> `API_TOKEN_EXPIRED`). Extension path: a new inactive status (for example `suspended`) is one entry in `API_TOKEN_STATUSES` and one entry in this map; the type makes a missing entry a compile error.
- `revoke` keeps its revoked-only check (Q-ET3). Body validation (400) still runs before the lock, so a past `expiresAt` in the body is `400` whatever the token state (unchanged order; 404 for a token the actor cannot see still wins over 409).

- [x] **ET1: cms-api rejects PATCH on an expired API token (409) with one shared expiry rule** · S · Deps: Q-ET1, Q-ET2 · core-builder · **High-risk path (`modules/access`) · Security gate: yes** · SPEC §7 D5, §9 (API tokens)
  - Acceptance:
    - New `apps/cms-api/src/modules/access/ApiTokenExpiry.rules.ts` exports `isApiTokenExpired(expiresAt, nowMs)` (no Nest, Prisma or I/O import) with a unit spec: `null` is never expired; `expiresAt === now` is expired; one millisecond later than now is not.
    - `api-token.guard.ts` (`ApiTokenAuthenticator.authenticate`) uses it in place of its inline test; nothing else in the authenticator changes (same bare 401 for every cause, same order, same `select`; security note N2 in `findings/CA1b-security.md`).
    - `management/api-tokens.service.ts`: `checkedExpiry` uses `isApiTokenExpired` too (an expiry that would already be expired is the existing 400 "must be in the future", unchanged); `view` takes its status from the private `statusOf(row)`; `update` throws from `UPDATE_BLOCKED_BY_STATUS` when the locked row is not `active`, before the subset check and before any write or audit row. An expired token: `409 { errorCode: 'API_TOKEN_EXPIRED', message: 'The API token is expired.' }` (Q-ET1) for any body: name only, scope only, `expiresAt` only (future date or `null`) (Q-ET2). A revoked token keeps `409 API_TOKEN_REVOKED`. `revoke` of an expired token stays `204` and audited (Q-ET3).
    - `management/access-management.constants.ts`: `MANAGEMENT_ERROR_CODES.TOKEN_EXPIRED = 'API_TOKEN_EXPIRED'` and its message, with a doc comment like `TOKEN_REVOKED`'s; the `TOKEN_REVOKED` comment becomes "Update or revoke of a revoked token".
    - `test/integration/api-tokens.spec.ts` "update": a token made expired in the DB (same setup as "an expired token gives 401") is `409 API_TOKEN_EXPIRED` for a rename, a scope change, a future `expiresAt` and `expiresAt: null`; after each the row's `name`, `scope` and `expires_at` are unchanged and no `api_token.updated` audit row exists; the list still shows it `expired`; and its bearer still gets 401. "revoke": an expired token revokes with 204 and then lists as `revoked`.
    - Docs: `apps/cms-api/README.md` API tokens notes (next to "A revoked token cannot be updated") name the expired case and its code; `docs/modules/access-control.md` file table lists `ApiTokenExpiry.rules.ts`.
  - Verify: SV for cms-api (`lint`, `typecheck`, `test:unit`, `test:integration` with Docker running); `grep -n "getTime() <=" apps/cms-api/src/modules/access` matches only `ApiTokenExpiry.rules.ts`; the unit record shows the new integration test failing on the old code (expired rename returned 200). security-qc reviews before ET2.
  - Files: `apps/cms-api/src/modules/access/ApiTokenExpiry.rules.ts` (new) + `ApiTokenExpiry.rules.spec.ts` (new), `apps/cms-api/src/modules/access/api-token.guard.ts`, `apps/cms-api/src/modules/access/management/api-tokens.service.ts`, `apps/cms-api/src/modules/access/management/access-management.constants.ts`, `apps/cms-api/test/integration/api-tokens.spec.ts`, `apps/cms-api/README.md`, `docs/modules/access-control.md`.

- [x] **ET2: cms-admin hides Edit on expired tokens and handles 409 API_TOKEN_EXPIRED** · S · Deps: ET1 · ui-builder · SPEC §7 D5
  - Acceptance:
    - `api-token-columns.tsx`: the Edit button renders only for `active` tokens; an `expired` token keeps its Revoke button (Q-ET3); a `revoked` token shows neither (unchanged). The "not revoked" doc comment is updated.
    - `config/http.constants.ts`: `API_ERROR_CODES.API_TOKEN_EXPIRED`. `use-token-submit.ts`: on that code it refreshes the list and ends with a new outcome `expired-meanwhile`; `ApiTokensPage.tsx` shows an info notice from new copy `apiTokens.alreadyExpired` ("That token has expired. Create a new token to restore access. The list is updated." or the copy owner's wording) in `config/copy/access.copy.ts`; `copy.snapshot.json` updated.
    - Tests in `ApiTokensPage.test.tsx`: an `expired` row has no Edit button and has Revoke; a mocked `409 API_TOKEN_EXPIRED` on edit submit closes the dialog with the expired notice and refetches.
  - Verify: SV for cms-admin (`lint`, `typecheck`, `test`, `build`).
  - Files: `apps/cms-admin/src/features/access/{api-token-columns.tsx,use-token-submit.ts,ApiTokensPage.tsx,ApiTokensPage.test.tsx}`, `apps/cms-admin/src/config/http.constants.ts`, `apps/cms-admin/src/config/copy/access.copy.ts`, `apps/cms-admin/src/config/copy/copy.snapshot.json`.

- [x] **ET3: e2e for the expired-token edit conflict** · S · Deps: ET2 · qc · SPEC §7 D5
  - Acceptance: `apps/e2e/tests/api-tokens.spec.ts` "Edit: revoked or deleted meanwhile" loop gains `['API_TOKEN_EXPIRED', 409, tokens.alreadyExpired]` (mocked PATCH, same pattern as the revoked case). Same test count or more; no other spec changes.
  - Verify: `pnpm e2e:spec tests/api-tokens.spec.ts` on a kept stack, then `SMOKE_E2E=1 pnpm smoke` green.
  - Files: `apps/e2e/tests/api-tokens.spec.ts`.

## Direct request: architecture guards move to `test/architecture/` (ARCH) — APPROVED 2026-10-27

User answers (2026-10-27, DESIGN ARCH-1): (1) the two module-level guards move too; (2) the folder is `apps/cms-api/test/architecture/`; (3) ARCH-1 runs after FN-lint-api, so the two FileNames guard files are deleted there and never moved; (4) the `SRC_ROOT` cleanup is part of the task. Why: `src/architecture/` is test tooling, yet `tsconfig.build.json` compiles its analyzers and constants into `dist/architecture/` (shipped in the image), the layer and literal guards need exemptions for it (`LAYER_EXEMPT_ROOTS`, four `NON_ROLE_LITERAL_FILES` entries, the `src/architecture/**` ESLint ignore), and 11 specs each recompute `SRC_ROOT`. ADR 0006 "Addendum ARCH-1" records the decision; SPEC §5 tree and ADR 0008 already name the new folder.

- [x] **ARCH-1: Move the cms-api architecture guards and analyzers from `src/architecture/` to `test/architecture/`; one `SRC_ROOT`** · M · Deps: FN-lint-api · core-builder · SPEC §2 "Module directions (cms-api)", §5 · ADR 0006 "Addendum ARCH-1" · Security gate: yes (moves `RecordSerializer.architecture.spec.ts` out of `src/modules/access`; the record-serializer and permission guards must keep scanning the same files)
  - Acceptance:
    - Commit 1, moves only (`git mv`, no content change; Q-CA4): every file left in `apps/cms-api/src/architecture/` after FN-lint-api (26 files: the `*.architecture.spec.ts` guards, `*.analyzer.ts` and their specs, `*.constants.ts`, `ErrorBody.contract.spec.ts`) -> `apps/cms-api/test/architecture/` with the same file name; `src/modules/access/RecordSerializer.architecture.spec.ts` and `src/modules/graphql/Graphql.architecture.spec.ts` -> `test/architecture/` (same names). `src/architecture/` no longer exists. `git show -M --stat` shows 28 renames and nothing else.
    - Commit 2, edits: relative imports into product code gain the `../../src/` prefix (e.g. `../common/...` -> `../../src/common/...`; in the two module guards `../../architecture/X` -> `./X`).
    - One `SRC_ROOT`: `test/architecture/SourcePaths.constants.ts` exports `SRC_ROOT = join(__dirname, '..', '..', 'src')` (owner: the file whose paths are already "relative to `src/`"). `ModuleGraph.analyzer.ts` no longer defines or exports it and imports it from there; the 11 specs that declare their own `const SRC_ROOT = join(__dirname, ...)` and the 3 that import it from `ModuleGraph.analyzer` all import it from `SourcePaths.constants.ts`. `git grep -n "SRC_ROOT = " apps/cms-api` finds one line.
    - Exemptions that existed only because the guards lived in `src/` go: `LAYER_EXEMPT_ROOTS` in `LayerRules.constants.ts` is `['contract']`; the four `join('architecture', ...)` entries leave `NON_ROLE_LITERAL_FILES`; `apps/cms-api/eslint.config.mjs` drops `'src/architecture/**'` from the deep-import-ban `ignores` (`src/modules/**` and `src/contract/**` stay). The `nodeOfFile` doc comment and the `assertPinnedPathsExist` message in `ImportGraph.analyzer.ts` name `test/architecture/SourcePaths.constants.ts`.
    - `apps/cms-api/jest.config.cjs`: the `unit` project's `roots` is `['<rootDir>/src', '<rootDir>/test/architecture']`; the `integration` project is unchanged. `tsconfig.build.json` is unchanged (it already excludes `test`).
    - Same checks, same counts: every guard scans `src/` exactly as before (no list or snapshot update; scanned-file counts and offender lists unchanged). Only the guards' own files leave the scans (they are not product code).
    - Docs: `apps/cms-api/README.md` (module layout checklist, steps 4-5), `docs/modules/access-control.md` (analyzer path), `scripts/docs/architecture/lib.py` (the folder it reads) and `build.py` (page text, the `architecture/` row moves from `src/` to `test/`); regenerate the pages with `pnpm docs:architecture`. The builder re-runs `git grep -n "src/architecture" -- apps scripts docs/modules` before commit 2; any other hit outside `docs/adr/` and history is edited in the same commit and listed in the unit record.
  - Verify:
    - Before commit 1, record `pnpm --filter @abyss/cms-api test:unit` suite and test counts. After commit 2, `pnpm --filter @abyss/cms-api lint typecheck test:unit` green with the same suite and test counts; `Layers`, `Modules`, `RecordSerializer`, `Graphql`, `PermissionMetadata` and `RateLimitPolicies` architecture specs run from `test/architecture/` and pass.
    - `git ls-files apps/cms-api/src | grep -c architecture` prints `0`; `pnpm --filter @abyss/cms-api build` then `test ! -e apps/cms-api/dist/architecture` succeeds (nest build deletes `dist/` first).
    - Guards still bite: a scratch import of `../../access/domain/PolicyEvaluator` from a `src/modules/health/` file makes `test:unit` fail in `Modules.architecture.spec.ts` (removed after).
    - Prettier on changed files; `pnpm format:check` green; `git grep -n "src/architecture" -- apps scripts docs/modules` finds nothing.
  - Files: `apps/cms-api/src/architecture/*` (26 `git mv` -> `apps/cms-api/test/architecture/`), `apps/cms-api/src/modules/access/RecordSerializer.architecture.spec.ts` and `apps/cms-api/src/modules/graphql/Graphql.architecture.spec.ts` (`git mv` -> `apps/cms-api/test/architecture/`), `apps/cms-api/jest.config.cjs`, `apps/cms-api/eslint.config.mjs`, `apps/cms-api/README.md`, `docs/modules/access-control.md`, `scripts/docs/architecture/lib.py`, `scripts/docs/architecture/build.py`, regenerated `docs/architecture/*.html`.
  - Checks: qc-cli tier 1 (no runtime code changes; the build output only loses `dist/architecture/`) + security-qc (path-only review: the RecordSerializer, PermissionMetadata, SessionOwnership and IdentityCli guards scan the same files with the same pinned paths). Risk: normal. Not in parallel with another cms-api task that edits `SourcePaths.constants.ts` or `LayerRules.constants.ts`.
