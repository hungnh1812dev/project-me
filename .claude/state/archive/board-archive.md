# Board archive

Finished phases and the old log, moved out of board.md (2026-10-22). Grep, do not read in full.

## Phase 0: Walking skeleton

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T01 | Monorepo + tooling isolation | root, packages/prettier-config | done | 0b07779 |
| T02 | cms-api skeleton (config, pipeline, health) | apps/cms-api | done | 309f84a |
| T03 | @abyss/form-commons (dist-only) + first components | packages/form-commons | done | a0b372e |
| T04 | cms-admin & web skeletons + Dockerfiles + proxy smoke | apps/cms-admin, apps/web, apps/cms-api | done | 51d36ea |

Checkpoint 0: ✅ passed (user approved start of Phase 1, 2026-10-20).

## Phase 1: Content engine spike

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T05 | JSON schema format + definition validator | apps/cms-api | done | 25ad860 |
| T06 | SQL migration generator + content:migrate (Kysely) | apps/cms-api | done | b83a01e |
| T07 | Content tree repository | apps/cms-api | done | 9a5ae67 |

Checkpoint 1: ✅ passed (user approved Phase 2).

## Phase 2: Identity

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T08 | Core Prisma schema, system roles seed, owner:bootstrap | apps/cms-api | done | 84357f5 |
| T09 | Login, JWT, refresh rotation, logout | apps/cms-api | done | d9790b8 |
| T10 | Rate limiting + client IP resolution | apps/cms-api | done | 5fd928c |
| T10a | Max-keys cap on in-memory rate-limit store (fail closed, 429) | apps/cms-api | done | 24e7e52 |
| T11 | Admin login slice | apps/cms-admin, apps/e2e | done | f06c0e2 |
| T11a | Multi-tab refresh race: browser coordination + server grace window | apps/cms-admin, apps/cms-api, apps/e2e | done | 6ae11a7 |
| T12 | OTP service + password lifecycle | apps/cms-api, apps/cms-admin, apps/e2e | done | 5c88026 |
| T13 | Two-factor authentication (TOTP + email OTP) | apps/cms-api, apps/cms-admin, apps/e2e | done | 7310308 |
| T13a | 2FA recovery: owner:reset-2fa CLI (break-glass, revokes sessions) | apps/cms-api | done | 441baac |

Checkpoint 2: ✅ passed (user approved Phase 3 on 2026-10-21, based on green smoke + e2e).

## Phase 3: Access control

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T14 | Roles/permissions model + policy evaluator + conditions DSL | apps/cms-api | done | b10c98c |
| T15 | Revocation versions in JWT guard (VersionCache, tv/pv) + access wiring | apps/cms-api | done | a21905c |
| T16 | Field projection, masking serializer, write allowlist | apps/cms-api | done | fe3a20e |
| T17 | Accounts & roles management API + security audit | apps/cms-api | done | b834e91 |
| T17a | Re-enable account + resend invite + invite rate limit (API) | apps/cms-api | done | 5bf6206 |
| T17b | Read-only content types API (GET /content-types, /:slug) for matrix pickers | apps/cms-api | done | 6c1dc56 |
| T17c | Pagination for GET /accounts + custom role cap | apps/cms-api | done | 9a7f04c |
| T18 | Accounts/roles/permissions admin UI | apps/cms-admin, packages/form-commons, apps/e2e | done | f38201d |
| T18a | Admin UI for enable, resend invite and accounts pagination | apps/cms-admin, apps/e2e | done | bfec616 |
| T18b | Smoke-only login rate-limit override (env, defaults unchanged) so e2e can run | apps/cms-api, docker-compose.smoke.yml | done | 4420ce9 |
| T18c | Smoke-only refresh rate-limit override (same pattern as T18b) so the T18a e2e run passes | apps/cms-api, docker-compose.smoke.yml | done | 8842d5a |
| T19 | API tokens (API + UI) | apps/cms-api, apps/cms-admin, apps/e2e | done | 8caf8b7 (API), 4c58203 (UI + e2e) |

Checkpoint 3: ✅ passed (user approved Phase 4 on 2026-10-21).

## Phase 4: Documents

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T20 | Document read API | apps/cms-api | done | fe23633 |
| T21 | Create/update with OCC + masked 409 | apps/cms-api | done | 9f84724 (+ 61436c8 fail-closed create conditions) |
| T22 | Publish/unpublish with deep clone + delete | apps/cms-api | done | 37155e5 |
| T23 | Dynamic form renderer (scalar inputs) | apps/cms-admin, packages/form-commons | done | 8357db3 |
| T24 | Richtext with server-side sanitize | apps/cms-api, apps/cms-admin | done | 992c9a2 |
| T25 | Conflict diff/merge modal | apps/cms-admin | done | 9e34ccb |
| T26 | Presence API + banner | apps/cms-api, apps/cms-admin | done | 3aba2ba |

## Phase 5: Media

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T27 | Upload pipeline + Cloudinary adapter + list | apps/cms-api | done | d4a3394 |
| T28 | Safe delete + purge job | apps/cms-api | done | 854b479 |
| T29 | MediaInput + media library UI | apps/cms-admin, packages/form-commons | done | 9a33089 |


## Log
- docs: SPEC.md + tasks/ committed @ 29a91de
- T01 done @ 0b07779 (TS pinned 6.0.3, ADR 0001); worker ~62k tokens, continuing
- T02 done @ 309f84a. User accepted: env names DATABASE_URL/PORT/JWT_ACCESS_SECRET, MAIL_PROVIDER=console|smtp, prod secret list grows per task, deps pg + ts-jest, oxlint 1.88.0 pin. Worker ~121k tokens.
- T03 done @ a0b372e. Worker at ~180k tokens → session reset before T04.
- worker session reset after T03 (~183k tokens); fresh worker resumes from handoff for T04
- T04 done @ 51d36ea. User accepted ADMIN_ORIGIN, copy.constants per app, dev ports 5173/5174, smoke port 8080, react-query/axios/react-hook-form deps. Worker ~157k tokens → reset before next task.
- Follow-ups noted: X-Powered-By header (→T36); Button loading drops keyboard focus (form-commons, low); smoke compose must gain SMTP keys when mail task adds them (T12).
- worker session reset after T04 (~157k tokens); handoff updated. Next worker starts fresh from handoff. Waiting on user Checkpoint 0 review before T05.
- T05 done @ 25ad860. User accepted all T05 format decisions (documented in docs/modules/content-schema.md). Worker ~127k tokens, continuing with T06.
- T06 done @ b83a01e. User: bookkeeping in content._migrations/_content_types (SPEC §6/§8.1 to be aligned), decimal = numeric (no precision), Dockerfile content/ copy folded into T07. Pending: media/accounts FKs once T08/T27 tables exist. Worker ~186k → reset before T07.
- worker session reset after T06 (~186k tokens); fresh worker resumes from handoff for T07
- T07 done @ 9a5ae67 (user accepted all tree-shape/partial-update decisions). SPEC alignment docs @ 9127c92. Follow-up for T20: pg date type parser (OID 1082 → string). Worker ~133k tokens.
- Phase 1 complete → Checkpoint 1 review with user pending.
- T08 done @ 84357f5 (ADR 0002 accepted: accounts.role_slug + composite FK; pg-database-health.ts deleted with approval). Content created_by/updated_by FKs deferred to T21. SPEC §8.1 role_slug edit pending a docs commit. Worker ~237k → reset before T09.
- worker session reset after T08 (~237k tokens); fresh worker resumes from handoff for T09
- T09 worker stopped by user mid-task; awaiting user direction (partial changes may be in working tree)
- Worker init slimmed (user request): worker.md tool allowlist + no preloaded skills (load on demand); handoff.md split into short state (2 KB) + on-demand .claude/state/conventions.md; session-handoff skill updated; briefs now quote SPEC excerpts. Backups in scratchpad. T09 restarted with fresh worker.
- T09 worker stopped by user again mid-task (was editing env schema); partial uncommitted changes may exist; awaiting user direction
- T09 resumed (same worker, partial work kept)
- T09 done @ d9790b8 (user accepted WEB_ORIGIN, JWT_ACCESS_KID, typ claim, refresh/logout semantics, /me shape, passport/jsonwebtoken/cookie-parser deps). SPEC role_slug @ 602a5f3. Worker slimming @ e4d99a0. Worker ~103k tokens (incl. reviewing partial work) → continuing with T10.
- Open TODOs in code: T15 tv/pv check (jwt.strategy.ts), T17 audit hooks (auth.service.ts), T13 temp-token verify.
- T10 decisions (user): limits login 10/15m IP + 5/15m email, OTP req 5/15m IP, 2FA verify 10/15m IP, refresh 30/min IP, 429 + Retry-After; in-memory store (single replica), documented swap point.
- T10 done @ 5fd928c (user accepted in-house limiter, TOO_MANY_REQUESTS, fixed windows, header fallback, no limit on logout/me). Follow-up T10a: max-keys cap on in-memory store (requested by user). Worker ~152k → reset before T10a.
- worker session reset after T10 (~153k); fresh worker for T10a. User: when cap is full → refuse new keys with 429 (fail closed).
- T10a done @ 24e7e52 (cap 50,000 keys ≈12 MB, constant; user accepted). Worker ~83k → continuing with T11.
- T11 answers: Retry-After exposed via CORS within T11; e2e wiring OK (SMOKE_E2E=1 pnpm smoke, root test skips e2e); multi-tab race → T11a later. Worker ~200k but mid-task → finish T11, then reset.
- T11 done @ f06c0e2 (Retry-After exposed via CORS; deps RTK/react-redux/react-router 8.4/@playwright/test 1.64). Worker ~206k → reset before T12.
- worker session reset after T11 (~208k). T12 decisions (user): generic SMTP via nodemailer (Gmail = smtp.gmail.com + App Password); Mailpit in smoke stack for e2e; emails carry 6-digit code only (no links); English copy.
- T12 worker stopped by user mid-task; awaiting direction
- T12 restarted 2026-10-20 with a fresh worker (working tree was clean; no partial work kept). Flagged to worker: tv check vs T15, TOTP seam for T13.
- T12 answers (user accepted all worker recs): SMTP_HOST/PORT/SECURE/USER/PASSWORD + MAIL_FROM, nodemailer 10.1.7, request-otp {email} always 202, change → 204 + logout everywhere, minimal tv check in jwt.strategy now (pv/cache → T15), PASSWORD_SUBMIT 10/15m IP (change 5/15m), per-email OTP limit 5/h, TOTP seam fails closed until T13, Mailpit via mail.<SMOKE_DOMAIN>.
- T12 done @ 5c88026. Notes: e2e rate-limit budget tight (owner 4/5 logins, OTP 4/5 per IP → CI retry may 429); change-password UI → T13 security settings page; common auth.constants imports identity password-length constants (layering smell, low). Worker ~244k → reset before T13.
- worker session reset after T12 (~244k); fresh worker resumes from handoff for T13.
- T13 answers (user accepted all recs): TOTP key = current + 1 previous (TOTP_ENC_KID, TOTP_ENC_PREVIOUS_KEY/KID, HKDF), otplib 13.5.0 + qrcode.react 4.2.0, in-memory temp-token challenge store, email/send-code endpoint, re-auth failures → 403 (password/change moves 401→403), seeded e2e-2fa account, /settings/security. Recovery → T13a.
- New manager session 2026-10-21: T13 code in working tree, commit gate pending; fresh worker started to re-verify and re-issue report.
- T13 done @ 7310308 (re-verified by fresh worker: lint/typecheck/unit/integration/smoke+e2e all pass; no defects). Worker ~93k, continuing. Follow-up (chore, low): .prettierignore should list apps/e2e/playwright-report and test-results.
- User: next order T13a → T11a → Checkpoint 2. T13a = CLI only (owner:reset-2fa), no recovery codes. Dispatched to same worker.
- T13a answers (user accepted recs): --email flag, TTY prompt [y/N] or --yes when no TTY (else exit 1), smoke check with failing inputs only (unknown email + owner w/o 2FA). Unknown/2FA-off → exit 1. revokeAllRefreshTokens extracted (accepted). Note: password.spec.ts timing test flaked once under parallel load (follow-up). Worker ~124k.
- T13a done @ 441baac (user accepted). Worker ~149k (≤150k) → kept for T11a; reset after T11a.
- T11a decision (user): both layers (browser single-flight across tabs + server grace window ~10s for just-rotated token). Dispatched.
- T11a done @ 6ae11a7 (user accepted grace response = access token only, no cookie; 10 s constant). Worker ~202k → reset before next task.
- worker session reset after T11a (~202k); handoff updated 2026-10-21. Fresh worker starts at the next task (after Checkpoint 2).
- Checkpoint 2 approved by user (no manual demo). Fresh worker started for T14.
- T14 answers (user accepted all worker recs): default matrix seeded idempotently (owner short-circuit; admin content*/accounts/roles/api_tokens/media CRUD, no audit/reviewer_settings; editor content* no delete + media r/c/u; guest none; reviewer/public content* read published); system subjects accounts/roles/api_tokens/media/audit_logs/reviewer_settings; content wildcard `*`; draft read = read+update; DSL fields = readable root scalars + createdBy/updatedBy/documentId, PERMISSION_INVALID_CONDITION; token scope {permissions:[...]} content-only, ∩ creator perms.
- T14 done @ b10c98c (user accepted worker interpretations: dotted field paths, field lists per action, * conditions system-fields only, no json in DSL, ne = IS DISTINCT FROM, multi-row union/OR, anonymous actor). Worker deleted gitignored dist without asking (rebuilt) → reminded. Not yet wired into Nest (T15/T20). Worker ~145k (≤150k) → kept for T15 (S); reset after.
- T15 done @ a21905c (user accepted: pv never 401, lazy registry load, CLI/other-process tv bumps apply within 5 s TTL, cache cap 1,000, unknown slug 404). Worker ~207k → reset before T16.
- worker session reset after T15 (~216k); handoff updated. Fresh worker started for T16.
- T16 answers (user): createdBy/updatedBy hidden for public/anonymous/reviewer (done in T16 serializer + QueryGuard); component write needs whole component writable; _maskedFields root list dotted no index; other system fields always readable; partial-readable component shows items with masked sub-fields.
- T16 done @ fe3a20e. Notes for T20/T21: build RecordReadAccess via recordReadAccess(); strip version before WriteAllowlist.apply; run assertTreeInput after apply (componentUid unchecked). Worker ~155k → reset before T17.
- worker session reset after T16 (~159k); handoff updated. Fresh worker started for T17.
- T17 answers (user accepted all recs): role delete in use → 409 ROLE_IN_USE (all accounts incl. soft-deleted count), system roles immutable; no email edit; audit names <domain>.<event>, metadata names only; unknown-email login audited with keyed email HMAC; :id = document_id; no re-enable/resend in T17 (→ T17a), dup invite → 409 ACCOUNT_EMAIL_TAKEN; self-target 403 incl. owner.
- T17 done @ b834e91 (user accepted: public/reviewer not assignable, non-owner can't grant system perms it lacks, slugs immutable, manageable flag, invitationSent:false on mail failure). Follow-ups → T17a. T19 must audit token create/revoke; T27/T31 media-delete + reviewer-toggle audit. Worker ~239k → reset before T18.
- worker session reset after T17 (~242k); handoff updated. Fresh worker started for T18.
- T18 answers (user): field source = new task T17b (content-types API) first; conditions = JSON textarea (Advanced, server-validated); hide actions by deriving caller's perms from own role in GET /roles; Dialog = shadcn Radix (@radix-ui/react-dialog approved), migrate Modal only if clean. Same worker (~57k) doing T17b, then resumes T18.
- T17b done @ 6c1dc56 (user accepted: roles:update/owner see full catalog; 404 for unknown+unreadable). Worker ~114k → kept, resuming T18.
- T22 done @ 37155e5 (user: accept activity port + none adapter; publish also checks the replaced published row's conditions). Security pass after fix. Follow-ups: activity database adapter + create/update events (new task to schedule); bulk T34 reuses PublishService.
- T23 done @ 8357db3 (e2e 14/14 after notice fix; security pass). Limits: real server masking for a restricted role untested in e2e (no seeded account); partial sub-field write access gets 400 on component edit (fails closed). Follow-ups: e2e README test table for content-form.spec.ts; e2e owner login budget with full suite.
- T24 done @ 992c9a2 (e2e 39/39; security pass; pnpm audit only pre-existing dev-path advisories). Open: (1) low: keys right after a toolbar click can be lost in RichtextInput (e2e waits 300 ms as workaround); (2) paste of script/img-onerror not e2e-covered; (3) public web render of richtext must sanitize again (later unit). Lockfile at root pnpm-lock.yaml.
- T25 done @ 9e34ccb (e2e 28/28 incl. real masked role; security pass). Open: owner login budget may be hit by full smoke run (content-conflict adds one owner login); apps/e2e/README.md does not list content specs yet.
- T26 done @ 3aba2ba (e2e 57/57 full smoke; security pass after fix: accountId = public UUID, found by security + e2e).
- Checkpoint 4 approved by user (2026-10-21). Phase 5 (Media) rows added to board; T27 started.
- T27 done @ d4a3394 (integration + smoke pass; security pass). Follow-ups: fake adapter rows stored as provider=cloudinary (approved); upload concurrency/memory limit (sharp at 50M px ~200 MB) to size in deployment.
- T28 done @ 854b479 (security pass twice; purge id-ordered walk). Known limit: reference-check vs delete race (24 h grace). Full-run flaky password.spec.ts again.
- T29 done @ 9a33089 (API PATCH alt, attach contract, profile type; UI library, MediaInput, picker; e2e 73/73 on fresh stack; security pass API + UI). Open: manual DevTools walk and empty/error picker states not covered; real upload only with real Cloudinary creds; the library spec stubs POST /media; the attach spec seeds rows via docker exec (smoke only). Stack abyss-smoke still up (SMOKE_KEEP) - tear down when told.

## Ad-hoc

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| DB1 | cms-api DB connection from DB_* env (replaces DATABASE_URL) | apps/cms-api | done | 9f8cf59 |


## Phase 6: Public web & reviewer
Base: 9f8cf59 · Phase checks: qc pass (regression e2e 106/106) · security pass · Checkpoint: pending user review

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| GQ1 | GraphQL schema builder + SDL print | apps/cms-api | done | b6a7f75 |
| GQ2 | GraphQL endpoint + resolvers over document read path | apps/cms-api | done | e49cd9a |
| GQ3 | GraphQL limits, production hardening, docs | apps/cms-api | done | e4c9956 |
| T30a | Migrate apps/web to Next.js (same features) | apps/web | done | 343f528 |
| T30b | Smoke stack for Next.js web | root files | done | 808a309 |
| T30 | Web CV showcase (Server Components via GraphQL) | apps/web, apps/cms-api | skipped (user) | |
| T31 | Reviewer backend | apps/cms-api | done | 32146d0 |
| T32 | Reviewer UX (web + admin) + owner log | apps/web, apps/cms-admin, apps/cms-api, apps/e2e | done | 3988610 |
| T33 | Web login + session sharing | apps/web, apps/e2e, scripts | done | afd13a3 |
| T33a | /auth/me returns caller's permissions (for web privileged check) | apps/cms-api | done | dfbc7a4 |
| T34 | Bulk API | apps/cms-api | done | 7af2130 (+ 4b6ffaa GraphQL endpoint wiring) |
| T35 | Bulk UI | apps/cms-admin, packages/form-commons, apps/e2e | done | b8b2f13 |
| T36 | Security headers + prod config audit | apps/web, apps/cms-admin, apps/cms-api, packages/form-commons, scripts | done | 490773d (cms-api), 3434fd8 (web, admin, form-commons, smoke) |
| T37 | Umbrella: Playwright consolidation + CI (T37a-T37f) | see sub-rows | done | see sub-rows |
| T37a | cms-api init container command (deploy:migrate), smoke init service | apps/cms-api, docker-compose.smoke.yml, scripts | done | efcf36c |
| T37b | CI checks + build from template (no e2e) | .github, turbo.json, docs | done | 07347df |
| T37c | web image numeric non-root user | apps/web | done | 1a8d2fc |
| T37d | Playwright consolidation + success-criteria map | apps/e2e, docs | done | 8423adf |
| T37f | CI e2e on a docker-run stack of the built images (no compose) | .github, scripts, apps/e2e | done | a2897da |
| T37e | Image publish + deploy bump from template | .github, docs | done | 612da2b |
| T38 | Deployment guide (init + main containers) | docs | done | 1a6998f |

