# Handoff archive

Snapshot of handoff.md taken 2026-10-22 before trimming to open work only. Grep, do not read in full.

# Worker Handoff
Updated: 2026-10-22 after T32

Current state only. Stable facts, user decisions and gotchas: `.claude/state/conventions.md` (read only the section you need).

## Done
- T01-T13a, T11a: see git log (0b07779 .. 6ae11a7); decisions in conventions
- T14 Policy evaluator + conditions DSL + default role seed - b10c98c
- T15 Revocation versions (VersionCache) + permission guard + AccessModule wiring - a21905c
- T16 Field projection, masking serializer, write allowlist, query guard - fe3a20e (decisions: conventions "T16 (accepted)" + docs/modules/access-control.md)
- T17 Accounts & roles API + security audit - b834e91 (API + audit rules: apps/cms-api/README.md "Accounts and roles" / "Security audit", docs/modules/access-control.md)
- T17b Read-only content types API (`src/modules/content-types/`): GET /content-types(/:slug), Field shape + visibility rules in apps/cms-api/README.md "Content types"; roles:update sees full catalog; hidden = unknown = 404 CONTENT_TYPE_NOT_FOUND - 6c1dc56
- T18 Accounts/roles/permissions admin UI - f38201d
- T17a Enable account + resend invite + ACCOUNT_INVITE throttle (API) - 5bf6206
- T17c Accounts pagination + custom role cap (API) - 9a7f04c
- T18a Admin UI enable/resend/pagination (cms-admin part; e2e pending e2e-tester) - awaiting commit
- T18b Login rate-limit env overrides + smoke compose - 4420ce9
- T18c Refresh rate-limit override REFRESH_RATE_LIMIT_IP + smoke compose - 8842d5a
- T19 API tokens, cms-api part (routes, D5 subset check, ApiTokenGuard, audit) - 8caf8b7
- T19 API tokens, cms-admin part (ApiTokensPage, one-time token reveal) - 4c58203
- T20 Document read API (list/detail, anonymous + JWT + token, filter/sort/page, masking) - fe23633
- T21 Document create/update with OCC + masked 409 (cms-api) - awaiting commit
- T22 Publish/unpublish/delete + activity port (cms-api) - 37155e5
- T23 Dynamic form renderer (form-commons inputs + cms-admin features/content + DocumentEditPage) - 8357db3
- T24 Richtext (cms-api sanitize + Tiptap RichtextInput) - 992c9a2
- T25 Conflict diff/merge modal - 9e34ccb
- T26 Presence API + banner - 3aba2ba
- T27 Upload pipeline + Cloudinary adapter + list - d4a3394
- T28 Safe delete + purge job (cms-api) - 854b479
- DB1 DB_* env replaces DATABASE_URL in cms-api - awaiting commit; root docker-compose.smoke.yml + scripts/smoke.sh also edited (approved), smoke passed
- T29 cms-api part (PATCH /media/:id alt) - awaiting commit; ui-builder split 1 (MediaInput, /media page, nav) awaiting commit; ui-builder split 2 (registry wiring, MediaField, MediaPickerDialog) awaiting commit; next e2e-tester: upload + attach via 'profile' type, MEDIA_IN_USE
- GQ1 GraphQL schema builder + SDL print (cms-api) - b6a7f75
- GQ2 GraphQL endpoint + resolvers (cms-api) - awaiting commit; checks: security
- GQ3 GraphQL limits + production hardening + docs (cms-api) - awaiting commit; checks: security

- T30a Web migrated to Next.js 16 (apps/web, ADR 0004) - awaiting commit; deps next 16.4.2 etc.; docker image checked locally; next T30b (smoke stack; root files)
- T30b Smoke compose + smoke.sh for Next.js web (root files) - awaiting commit; smoke green (73 e2e), stack torn down; next T30 (needs GQ2 committed)
- T34 Bulk API (cms-api) - awaiting commit; checks: security. Provisional choices: out-of-scope rows are per-item 404 (not 403, as T22); atomic failure = the item's own status + `details {index, details}`; non-atomic always 200 `{atomic, succeeded, failed, results}`; bulk returns ids/versions only; no bulk throttle. Next T35 (UI).
- T31 Reviewer backend (cms-api) - awaiting commit; checks: security. Provisional: reviewer gets a 24 h access token only (no refresh token/cookie); env `TURNSTILE_SECRET_KEY` only (optional, unset = 503, no fake mode; tests override TURNSTILE_VERIFIER); visitorRole/purposeTags are free labels (no enum); last_active_at never updated; GET /reviewer/status returns the stored toggle only. Next T32 (UI, needs T30 skipped decision + T33).
- T33 Web login + session (apps/web) - awaiting commit; checks: e2e + security (both security findings fixed; probe swapped for /auth/me permissions; e2e web-session.spec signs in as owner and must be reworked: owner is privileged, needs a reader-role account). Provisional: new optional build-time env NEXT_PUBLIC_ADMIN_URL for "Open CMS" (unset hides link; not set in smoke compose, root file); no GraphQL refetch (T30 skipped); no Bearer-refresh interceptor yet (web makes no other authed calls). Next T32 uses `useWebSession().getAccessToken()`.
- T33a /auth/me `permissions: string[]` (cms-api) - awaiting commit; checks: security. Format `subject:action` (e.g. `article:update`); T33 can swap its probe for this field.
- T32 Reviewer UX (web dialog + admin page/banner) - awaiting commit; checks: e2e + security. Provisional: no CvView refetch (T30 skipped; reviewer view = the session itself); web reviewer button hidden unless NEXT_PUBLIC_TURNSTILE_SITE_KEY set and status on; reviewer session has no refresh, reload ends it; admin has no entry path for a reviewer token yet (banner is role-based); no Turnstile nonce (T36). Next e2e-tester: reviewer flow on rebuilt smoke (needs internet); T35 UI.

## In progress / next
- T19: cms-api committed (8caf8b7); cms-admin UI built, awaiting checks (e2e: token list/create/reveal/edit/revoke, security: raw token exposure) and commit. No e2e written yet (e2e-tester owns apps/e2e).
- T18a e2e done (bfec616). User answers Q1-Q4 applied (content-types API, JSON conditions textarea, caller access from own role in GET /roles, Radix Dialog; Modal not migrated).
- Q5 provisional (confirm at T30): sensitive = reference.phone, company (root + experience), github, email. Do NOT edit cv-page.json until T30. No `ui.width` hint in the format yet.

- T17a/T17c/T18a planning answers (user accepted all recommendations): Q7 re-enable -> active if password else invited; Q8 resend needs accounts:create; Q9 invite throttle 10/h per actor + 20/h per IP, shared by invite and resend, in memory; Q10 offset paging page (default 1) + pageSize (default 20, max 100) + meta.total; Q11 roles not paginated, custom roles capped at 50 (409 ROLE_LIMIT_REACHED); Q12 no list filters in v1; Q13 no confirm on enable/resend (disable keeps confirm). Task split accepted: T17a (API), T17c (API pagination), T18a (UI + e2e, after T17a, T17c, T18).

- T18b BUILT (awaiting checks/commit): env LOGIN_RATE_LIMIT_IP/EMAIL + smoke compose; next e2e-tester re-runs smoke, restores the "disabled account cannot sign in" check, T18a re-check. Original ask: add optional env overrides for login:ip (default 10) and login:email (default 5) per 15 min in apps/cms-api limits constants, read at startup with validation (invalid = fail start); defaults unchanged; set high values only in docker-compose.smoke.yml (root file, approved for this task). Production unchanged. Then T18a e2e re-check; restore the "disabled account cannot sign in" e2e check (removed in T18a run).
- T18a: UI built (cms-admin); e2e findings in .claude/state/findings/T18a-e2e.md (login limit only, behaviour OK).

## T22 answers (user)
- Activity: accepted port + `none` adapter for T22. `database` adapter and create/update activity events -> follow-up task (manager to schedule).
- Publish: the existing published row must also pass the actor's `publish` conditions; otherwise publish returns 404 and changes nothing (same all-rows rule as delete). Security review pass otherwise. Builder: apply this, then re-run checks.

- GQ3 built (413 uses the GraphQL error shape per manager note; graphql.md updated, was REST shape). Next: T30 needs GQ2 + T30b.

## Follow-ups
- T32: T36 CSP must allow challenges.cloudflare.com (script-src, frame-src) and nonce the Turnstile script; decide how a reviewer reaches the admin console (token is web-memory only) -> manager/T36.
- T31 questions for user: (1) Turnstile env names: API `TURNSTILE_SECRET_KEY`; web site key proposed `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (ui-builder, T32); values from user. (2) Allowed visitor roles / purpose tags lists (T32 dialog) - API accepts any short label. (3) e2e/smoke has no Turnstile stub: smoke cms-api has no TURNSTILE_SECRET_KEY (root compose, needs approval) and would need Cloudflare's public test secret + internet, or a stub URL env; decide at T32.
- A body over Nest's 100 KB parser on non-bulk routes answers 500 (body-parser 413 not mapped by HttpExceptionFilter) -> manager/T36.
- Flaky e2e: media-attach.spec.ts 'uploading in the field attaches...' failed once at line 229 (r.json()), passed on rerun -> manager/e2e-tester.
- T27: docker-compose.smoke.yml now sets MEDIA_PROVIDER=cloudinary with dummy CLOUDINARY_* (smoke passes). User must supply real Cloudinary env values for real uploads. PATCH /media/:id built in T29 (cms-api). Dockerfile must install sharp's platform binary (pnpm install on the target arch).
- T23 gaps for manager: (1) content-types API has no `required`, labels or writable info: required errors come from the server; consider adding `required` (and per-field `writable`) to `Field` in cms-api. (2) Media (T29) renders read-only and is never sent: wire it in the registry. (3) DocumentEditPage is minimal (draft only, no publish, no nav); T34 owns list + nav. (4) Presence: T26.
- T24 committed @ 992c9a2 (checks passed).
- Writes are not throttled (only anonymous reads are); consider at T36.
- T28 done (media.deleted audit). T31: audit reviewer toggle (same pattern). T28 purge hard-deletes the row after removing the object (provisional; no schema change); in-process hourly interval, no scheduler dep.
- T20/T21: use `@UseGuards(ApiTokenGuard, PermissionGuard)` (module must import AccessModule) for token-accepting content routes; combine with a JWT path (a route accepting both needs a guard that tries the `ak_live_` prefix first).
- T21 (done in T20 for reads): build `recordReadAccess(actor, fieldsFor().readable)` for every read; pass it to selectedColumns(projectTable(...)), QueryGuard.assert (before SQL) and RecordSerializer.serialize (every record body: list, detail, 409, bulk, audit, error details). Writes: strip `version` from the body, then WriteAllowlist.apply(tree, fieldsFor()), then assertTreeInput (componentUid unchecked until then), then replaceTree/insertTree.
- T22 (done): see conventions "T22". Activity `database` adapter (SPEC D15 `none | database`) not built: needs a table + migration; manager to schedule. T34 bulk publish/unpublish/delete should reuse `PublishService` logic (per-item savepoints). T21 (done): reused `DocumentAuthGuard` for writes (it also allows anonymous; PermissionGuard denies non-read), `ContentDbProvider` for transactions, and the read helpers in documents/. Writes must not trust `status` semantics of draftAndPublish:false types (see conventions T20).
- Anonymous document reads are throttled 120/min/IP (T20). Reviewer actor not wired into DocumentAuthGuard until T32.
- T21 did NOT add the created_by/updated_by FKs -> public.accounts (not in acceptance; needs generator support + a content migration, db:migrate before content:migrate): manager to schedule. T27: media FKs -> file_library (names in naming.ts).
- Scale-out: VersionCache, rate-limit store, TwoFactorChallengeStore are in-memory (one replica).
- Flaky: password.spec.ts timing test ("same time for known and unknown emails") under parallel load -> manager to schedule.
- T36: `X-Powered-By: Express` still sent.
- form-commons: Button `loading` drops keyboard focus (low). Shared Radix Dialog exists (T18); TwoFactorModal still uses native src/components/Modal.tsx (migrate when touched).
- Optional CI: `content:generate --check`.

## T27 answers (user)
- Deps approved: sharp + file-type (SPEC §3; sharp build script approved), busboy + @types/busboy (streaming, per-type limits image 10 MB / pdf 20 MB / video 100 MB), cloudinary SDK, uuidv7() as an in-repo helper (no dep).
- Env: MEDIA_PROVIDER=cloudinary|fake (fake only when NODE_ENV is not production; default dev/tests). CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET required only when MEDIA_PROVIDER=cloudinary (fail-fast in production); CLOUDINARY_FOLDER optional. Names only in .env.example; the user supplies values.
- Scope: fake adapter stores provider=cloudinary (no schema change); POST /media rate-limited per actor (named constant); reviewer-preset rule on GET /media via policy row-filter extension for the media subject (not a role check).

## T29 answers (user)
- Attach: documents accept the media uuid and map it to the internal file_library id server-side; document reads embed the file {id (uuid), fileName, url, thumbnailUrl, provider, alt, size, createdAt}. Add provider to MediaView. Internal integer id stays private. No GET /media/:id needed for previews.
- Test type: a new small schema (name 'profile', one media field) for the e2e attach test. cv-page.json stays untouched (Q5/T30).
- Split: independent UI now (MediaInput, library page with upload/alt/delete with MEDIA_IN_USE, nav); registry wiring + picker after the API part.
- T29 embed policy (user): once a non-preset file is attached to a document, public and reviewer readers see it (url, fileName, size, alt, provider) by following the document field's read permission. Confirmed as intended.
- T29 upload e2e (user): stand-in /media in the library spec (context.route) is acceptable for now; real upload covered by cms-api integration tests. Add a real-upload e2e once Cloudinary credentials exist. Do not change docker-compose.smoke.yml for this. Shared smoke stack: only one agent runs pnpm smoke at a time; no docker teardown without the manager's word.
- T29 e2e (user): approved resetting the smoke owner password hash in the throwaway abyss-smoke DB (only that stack, via the cms-api container, to a known test value). Approved seeding file_library rows with docker exec for the attach spec. The e2e-tester owns apps/e2e/tests/media-*.spec.ts. Do not touch any other stack.
- T29 done @ 9a33089

## Web on Next.js (user answers)
- Q-W1 App Router. Q-W2 Node standalone SSR. Q-W3 anonymous server fetch from API_INTERNAL_URL, cache 60 s prod / 0 smoke (WEB_REVALIDATE_SECONDS). Q-W4 nonce CSP via proxy.ts (D17 change in SPEC §7, needs SPEC update before T36; style-src fallback unsafe-inline not yet confirmed). Q-W5 React context + Query, no Redux on web (note in SPEC §3). Q-W6 DOMPurify on server and client. Q-W7 deps approved: next (>=16.2.5 pinned), server-only, @tailwindcss/postcss, @next/eslint-plugin-next, dompurify, jsdom (runtime); remove vite and @tailwindcss/vite from apps/web; NEXT_TELEMETRY_DISABLED=1. Defaults taken (planner recommendations): Q-W8 trailing-slash 308 default; Q-W9 web-side 'use client' imports only, form-commons unchanged; Q-W10 ui-builder owns T30b root files with explicit approval at that time.
- Q5 CONFIRMED: sensitive = reference.phone, company (root + experience), github, email.
- Pending before T30a: SPEC edits (§3 web row, §5 web layout, D17 nonce CSP, §13 approval of D17) by planner.

## DB config change (user request)
- apps/cms-api: connect to PostgreSQL from separate env vars DB_HOST, DB_NAME, DB_USERNAME, DB_PASSWORD, DB_PORT instead of DATABASE_URL (replace, do not keep DATABASE_URL). Values must not be guessed; the password must be passed safely (no URL-encoding bugs). Update env schema, .env.example, tests and README. Root docker-compose.smoke.yml still sets DATABASE_URL: builder must report the exact lines needed, not edit the root file without approval.

## GraphQL (user decision)
- Add GraphQL support to cms-api (has filter and pagination). apps/web fetches its server data through GraphQL (replaces the REST fetch planned for the CV page: anonymous server fetch, cache 60 s prod / 0 smoke still applies). Planner to design the schema, authz, limits and tasks, and update SPEC (web row, layout, D17, GraphQL) before any builder starts. Previous spec update stopped; restarted.

## GraphQL answers (user)
- Q-G1 graphql-js only (exact pin, in-house handler). Q-G2 queries + document reads only; admin stays REST. Q-G3 offset paging like REST. Q-G4 limits 32 KiB / 2000 tokens / depth 8 / 5 root fields / 500 nodes. Q-G5 introspection off in production for everyone, no playground. Q-G6 no web client library (fetch; graphql devDep for SDL contract test). Q-G7 public CV = published with isMain=true, newest updatedAt if several, empty state if none. Q9 add github and email as root string fields with sensitive: true to cv-page.json (content migration generated and reviewed in T30). Q-W4 style-src: nonce + style-src-attr 'unsafe-inline'.
- GQ2 security (user): hidden content types are invisible to that actor (incl. Filter and component types); validation errors match unknown ones. Committed SDL stays the full owner schema. Medium finding (hidden root field vs unknown error count) must be fixed; test compares error arrays.
- T30a approved by user (go): delete apps/web vite entry files listed in the migration plan (index.html, vite.config.ts, nginx.conf, src/main.tsx, src/vite-env.d.ts, src/config/env.ts, src/app/App.tsx if replaced). Deps approved (Q-W7).
- T30a cleanup (user, answered 'Approve all' to the cleanup question): delete apps/web/AGENTS.md (untracked, from a next dev run), the stale ignored apps/web/dist/, and apps/web/src/app/App.test.tsx (replaced by page.test.tsx); add .next/ and next-env.d.ts to the root .prettierignore.
- T30b approved by user: root docker-compose.smoke.yml and scripts/smoke.sh may be changed for the Next.js web (owner: ui-builder per Q-W10).
- T30 stopped by user ("Stop implement cv page"); board back to todo. Partial API work (cv-page.json github/email, migration) may be in the working tree: not committed, not reverted.
- T30 skipped by user; its partial cv-page.json edit was reverted to HEAD by the T34 builder on the manager's instruction.

## T31 answers (user, 2026-10-22)
- Turnstile env: TURNSTILE_SECRET_KEY (cms-api, optional; unset = 503 REVIEWER_UNAVAILABLE) and NEXT_PUBLIC_TURNSTILE_SITE_KEY (web, T32). User supplies values.
- Smoke/e2e: use the Cloudflare public test secret in docker-compose.smoke.yml only (root file change approved for T31/T32 smoke; never in production config). Apply when the e2e-tester/builder needs it for T32.
- cv-page.json: restore from HEAD (was deleted in working tree; not an approved deletion). Restore, do not delete.
- Security findings (T31): audit rows for reviewer sessions store the HMAC of the IP, not the raw IP (no raw IP anywhere in the reviewer flow). Reviewer-role accounts are blocked from the accounts API (update, resend invite, any management); the reviewer module alone creates and cleans them up.
- T33 web session (user, 2026-10-22): limit the web session for privileged roles. The web silently refreshes and shares the session for reader roles only; Owner/Admin get public data only on the web (sign in on the admin). Keeps SPEC D14 isolation. Confirm exact role list with the builder (reader = no admin/write permissions).
- T33a done @ dfbc7a4 (user committed; security pass). Next: resume build-T33 to swap the probe for `permissions` on /auth/me, then full e2e + security recheck on T33. Follow-ups: flaky cms-api integration test (failed once, passed on reruns; not investigated); web-session.spec depends on two-factor.spec state (make self-contained).
- T33a (user, 2026-10-22): add the caller's effective permissions to GET /auth/me (cms-api), so the web can decide privileged = has any write or management permission (editor included). Shape: `permissions: string[]` (existing permission strings, no new secrets; public/reviewer/guest stay read-only). Then T33 swaps the endpoint probe for this field. Privileged token dropped in memory on sign-in and refresh; the refresh cookie still rotates (user accepted).
- T31 done @ 32146d0 (user committed; security pass after round 1; checks: 1345/1345 cms-api). Next: T32 needs T33 and T30 status check (T30 skipped), so the next unit is T33.
- TURNSTILE_EXPECTED_HOSTNAME (cms-api, optional) approved: a Turnstile pass must report this hostname; unset = old behaviour.
- Slip (accepted by user): builder ran prettier --write on ../../.env (repo-root .env) by mistake; no change per git status. Never touch .env* files: the builder must check the path before running any tool on it.
- Schema files (user): move the untracked common-text.json, cv-contact.json, cv-page-new.json, header.json out of content/schemas into .claude/state/parked/ (moved, not deleted; owner finishes them later). Restore profile.json from HEAD.

## Phase 6-7 answers (user)
- Q4 CLIENT_IP_HEADER optional, unset by default (T31).
- T30 skipped; T32 and T33 proceed without the CV page dependency.
- Q6 owner reviewer-session log reuses the existing audit log (T32).
- T34 provisional choices: bulk per-item 404 (not 403) for rows outside row conditions; atomic failure returns the failing item's status/errorCode; non-atomic always 200 with per-item results; bulk returns ids and versions only; no bulk throttle (like T21).
- Follow-up: non-bulk body over Nest 100 KB answers 500 not 413 (predates T34).

- 2026-10-22 manager: T33a closed (committed dfbc7a4). current.md had been overwritten by the T33a record, so the T33 record was lost; reset to "No unit in progress." and asked build-T33 to rewrite its record. T33 stays in-progress; findings T33-security.md (2 low) still open.
- T33 (manager, 2026-10-22): previous build-T33 agent is gone and its record was lost. Fresh ui-builder must (1) verify the working tree in apps/web: the 2 findings in findings/T33-security.md (backslash/tab link validation in require-env.ts; failed sign-out must surface an error) are fixed or fix them, with tests; (2) swap the probe for permissions on GET /auth/me (T33a, dfbc7a4): privileged = any permission not action read; web shares session for reader roles only (user answer 2026-10-22); (3) rewrite current.md for T33 and report ready-for-checks (checks: e2e + security).
- T33 round 2 (manager, 2026-10-22): builder reports ready-for-checks. Both findings in findings/T33-security.md were already fixed (link rejects backslash/control chars; failed sign-out keeps session and shows error), with tests. Privilege = `permissions` from GET /auth/me, any action other than read is privileged, missing list = privileged. For e2e: apps/e2e/tests/web-session.spec.ts "the owner signs in on the web" is now refused (owner is privileged); change it to a reader-role account and add a privileged-refusal case. Security: verify the 2 findings and delete the findings file on pass.
- T33 user answer (2026-10-22): on a refused privileged web sign-in (owner/admin/editor), the web calls logout (best-effort) to revoke the shared refresh family, so no admin session stays live on that browser. Security round 2 pass (findings file deleted). Next: fix round for this, after e2e finishes.
- T33 fix round (manager, 2026-10-22): e2e findings in findings/T33-e2e.md (run pass 78 with a patched smoke). Fix list: (a) user decision: on a refused privileged web sign-in, call logout best-effort so no admin session stays live; (b) copy.constants.ts "Owner and admin accounts" must also name editors (refused too); (c) reader accounts E2E_READER_EMAIL/PASSWORD and E2E_READER_2FA_EMAIL/PASSWORD must be seeded by scripts/smoke.sh (root file, outside the T33 apps/web scope; the e2e spec cannot start without it). Seeding approach: use the patched copy the e2e agent describes (scratchpad smoke-reader.sh, diff against scripts/smoke.sh, drop its hardcoded ROOT_DIR line); do not run that copy from the repo. Confirm reader seeding with the user only if it needs a new role.
- T33 done @ afd13a3 (user accepted commit; security pass x3, e2e 78/78). Refused privileged web sign-in calls logout best-effort; silent refresh does not. scripts/smoke.sh seeds reader guest accounts (approved out-of-scope). Residual: if best-effort logout fails, the new refresh family stays valid until expiry (accepted by design).

## T32 answers (user, 2026-10-22)
- Visitor roles offered in the dialog: Recruiter, Peer / colleague (plus Other, free text).
- Purpose tags offered: Hiring, Project scoping, Networking (plus Other, free text).
- Smoke/e2e: Cloudflare public Turnstile test secret and site key in docker-compose.smoke.yml and the smoke web build only; production keys come from the user. Approved for T32.


---

# Snapshot 2026-10-23 before trimming to open work (completed tasks: R1-01..R1-14, AU1-AU6, T32-T38, D1-D3, S1, F1, OS1-OS4)

# Handoff
Updated: 2026-10-23 after AU0 state cleanup (trimmed to open work; history in archive/handoff-archive.md)

## In progress / next
- OS4 browser walk: the user walks the open-state steps (wrong token, validation, valid submit, owner sign-in, /setup redirect after setup, storage/URL check) on a fresh smoke stack. Do not work around the qc browser typing block.
- Phase 5 (Media): checkpoint still pending user review.
- Phase 6: phase checks not run yet (T38 done).
- D1 open: SOPS flow untested on a cluster; try once on a scratch namespace. cms-api does not load .env itself (guide uses set -a; . ./.env).
- Audit (approved 2026-10-23): AU1a, AU1b, AU1c, AU2, AU3, AU4, AU5, then AU6 (merge and propose R1-R4). Read-only runs writing `.claude/state/findings/AUDIT-<area>.md`.

- R1-01 Resolved-import architecture specs - awaiting checks (security gate)/commit; next: R1-02 / R1-07.
- R1-02 Permission-metadata guard - awaiting checks (security gate)/commit; next: R1-03.
- R1-03 Module dependency guard - awaiting checks (none, test-only)/commit; next: R1-04, R1-06, R1-08, R1-13.
- R1-04 Extract security-audit module - awaiting checks (security gate)/commit; next: R1-05, R1-06, R1-09.
- R1-05 System roles owned by access - awaiting checks (security gate)/commit; next: R1-06, R1-09, R1-10, R1-16.
- R1-06 common/http helpers - awaiting checks (security gate)/commit; next: R1-08, R1-10.
- R1-08 Identity auth constants out of common - awaiting checks (security gate)/commit; next: R1-09, R1-10.
- R1-09 Identity owns sessions - awaiting checks (security gate)/commit; next: R1-10.
- R1-10 Access core/management split - awaiting checks (security gate)/commit; next: R1-11, R1-12.
- R1-11 Identity and access facades - awaiting checks (security gate)/commit; next: R1-12, R1-14.
- R1-12 DocumentAuthGuard moves to access - awaiting checks (security gate)/commit; next: R1-14.
- R1-13 Media owns its reference error code - awaiting checks (security gate)/commit; next: R1-14.
- R1-14 Remaining facades, zero known violations - awaiting checks (security gate)/commit; next: R1-15.
- R1-15 Error codes and single-module files leave common - awaiting checks (security gate)/commit; next: R2-02, R2-07, R2-13.
- R1-07 Pin security constants - awaiting checks (security gate)/commit; next: R1-03, then R1-08.

## Follow-ups
- R1-15: `uuidv7.ts` was git mv'd and then edited (pattern export dropped, per acceptance), so the commit mixes move and edit; smoke e2e not run by the builder -> manager/qc.
- R1-15: richtext sanitizer is allowlisted in `common-ownership.architecture.spec.ts` until R2-02; remove the entry then -> R2-02.
- R1-14: `content-types` and `media` modules no longer import `IdentityModule` (SPEC §2 auth-guard-only); `JwtAuthGuard` has no deps, the strategy comes from the app-level IdentityModule. A qc smoke run confirms authenticated media and content-types calls -> qc.
- R1-14: `SPEC.md` §2 line 75 still lists the known violations as pending; update when the planner edits SPEC (list is now empty) -> planner.
- R1-13 qc gap: no test for a media file the actor cannot read, none asserting an identical message across causes -> unscheduled.
- R1-09: the reviewer switch-off raw SQL (`UPDATE accounts SET token_version ...`) stays in reviewer, allowlisted in session-ownership spec; move into identity if reviewer should hold no session writes -> unscheduled.
- T37a security (pass, static): for production (T37e/T38), give `content:migrate` a DB-only config loader so the init container gets only DB secrets; consider a DDL-capable migration role separate from the API runtime role (both use DB_USERNAME today). Owner decision pending.
- T37a done @ efcf36c (user committed; qc smoke 104/104; security pass static). Commit scope: `apps/cms-api/src/modules/content-engine/cli/generate.ts` (`--check` flag) and `apps/e2e/playwright.config.ts` are pre-existing uncommitted changes that belong to T37b / T37d, not T37a. Keep them out of the T37a commit.
- Nav entry / content-type index page to reach `/content/:slug` (and a link from DocumentEditPage back to the list) -> unscheduled.
- Playwright 'select 5 -> publish' spec (T35 Verify) -> qc / T37.
- T36: CSP must allow challenges.cloudflare.com (script-src, frame-src) and nonce the Turnstile script; nonce CSP via proxy.ts + style-src-attr 'unsafe-inline' (Q-W4); remove `X-Powered-By: Express`; non-bulk body over Nest's 100 KB parser answers 500 instead of 413; consider throttling writes.
- T36 / design: how a reviewer reaches the admin console (token is web-memory only).
- Flaky tests -> T37: media-attach.spec.ts 'uploading in the field attaches...' (line 229 r.json()); cms-api password.spec.ts timing test under parallel load; one cms-api integration flake (not investigated); web-session.spec depends on two-factor.spec state (make self-contained).
- e2e gaps -> T37: apps/e2e/README lacks the content specs; owner login budget with the full suite; real-upload e2e once real Cloudinary credentials exist (library spec stubs POST /media); richtext paste of script/img-onerror not covered; media picker empty/error states not covered.
- Cloudinary: user must supply real CLOUDINARY_* values (sharp binary loads in the image, checked in T38; memory limits are in the guide as starting points).
- Content-types API has no `required` / per-field `writable` (required errors come from the server) -> unscheduled.
- DocumentEditPage is minimal (draft only, no publish, no nav) -> unscheduled (T35 covers bulk only).
- Activity `database` adapter (SPEC D15) + create/update activity events -> unscheduled.
- created_by/updated_by FKs -> public.accounts and media FKs -> file_library (generator support + content migration) -> unscheduled.
- Public web render of richtext must sanitize again -> when the CV page (T30, skipped) returns.
- Low: form-commons Button `loading` drops keyboard focus; TwoFactorModal still on native Modal.tsx (migrate when touched); RichtextInput may lose keys right after a toolbar click; common auth.constants imports identity password constants (layering).
- T37b: `_publish.yml`, `image-user.sh`, `bundle-check.sh` come from the template in T37e; `ci.yml` still resolves per-branch matrices/environment for it. Local `pnpm format:check` warns on gitignored apps/e2e report artifacts (absent in CI).
- Parked schema files in .claude/state/parked/ (common-text, cv-contact, cv-page-new, header): owner finishes them later.
- T32 done @ 3988610 (user committed; QC recheck 92/92 e2e; security pass). Reviewer token is web-memory only, so the admin reviewer banner/read-only mode is unit-tested only (no path in yet). Follow-up: media-attach locator fixed for the new fieldset.
- T35 done @ b8b2f13 (user committed; QC recheck 103/104, the one failure was the flaky media-attach test, passed on re-run; focus-return fixed). Tooling chore (e2e:spec runner, smoke.sh kept-stack env) committed separately after review.
- T36 done (user committed 2 commits: cms-api headers, then web/admin CSP nonces + smoke). QC recheck 2 passed 104/104; admin style nonce via nginx + meta, Radix and Tiptap styles covered; no hash (scrollbar width varies).

- T37f (superseded by T37g, e2e-stack.sh goes away): apps/e2e hardcodes the DB container `abyss-smoke-db-1` (src/constants.ts SMOKE_DB_CONTAINER; reviewer.spec.ts, seed-media.ts run `docker exec` psql), so e2e-stack.sh names its Postgres container that too (cannot run beside `pnpm smoke`) -> qc: read the name from an env var, then e2e-stack.sh can use `abyss-e2e-db`.
- T37f: actionlint 1.7.12 runs via docker (`rhysd/actionlint`), clean on .github (also closes the T37b open item). CI run itself unverified until the user pushes.

## T37 answers (user, 2026-10-22)
- No branch push: T37 "CI green on a branch" is verified locally only (the user pushes and checks CI). Do not push.
- core-builder owns the CI workflow (.github/workflows/ci.yml) and its docs.
- CI is built from the template folder `.github_template/` (workflows + scripts at the repo root, not inside `.github/`). Use it as the base and adapt it to this repo.
- cms-api ships as two containers: init container = parse / migrate / merge the content-type schema and update the database through Prisma; main container = run the cms-api service. (Overlaps T38's migration Job order: `db:migrate` -> `content:migrate`; planner to reconcile.)
- Untracked `.github/workflows/ci.yml` (64 lines, 2026-10-22 14:57) has an unknown origin; whether to keep or replace it is open (ask the user).

### T37 planner questions, answered (user, 2026-10-22)
- Q-T37-1 Init container applies committed migrations only: `db:migrate` then `content:migrate`. CI fails on a missing migration (`content:generate --check`). No `content:generate` at deploy time.
- Q-T37-2 `owner:bootstrap` stays a manual one-time step (kubectl exec), not in init.
- Q-T37-3 Triggers: keep the template's branches (develop/staging/main). User chose this over the recommendation (main only). Builders must not assume staging/develop exist.
- Q-T37-4 Overwrite the untracked `.github/workflows/ci.yml` with the template-based entrypoint.
- Q-T37-5 Per-app jobs (Checks + Build for cms-api, cms-admin, web; images for those three) plus one repo-wide job (format:check, audit) and one e2e job that runs when any app is affected.
- Q-T37-6 Keep the admin bundle check, adapted to `VITE_API_BASE_URL` (always set).
- Q-T37-7 Registry: GHCR under this repo, lowercase names, keep the template's variable and secret names, web/admin build args as GitHub Environment variables. Follow-up answer: owner/repo/deploy layout = same as the template (`ghcr.io/hungnh1812dev/project-me`, template variable and secret names, overlay with `APP_IMAGE_TAG`). No git remote is configured in this repo.
- Scope: core-builder also owns `.github/`, `turbo.json`, `docker-compose.smoke.yml`, `scripts/`, `docs/ci-cd.md` (project.md updated).
- Planner's re-scope: T37a-T37e in tasks/todo.md and tasks/plan.md (planner note says Phase 8; the board has T37/T38 under Phase 6, reconcile on the board).

## T37 correction (user, 2026-10-22)
- docker-compose is for local testing only. CI does not run compose and does not need to test it. Production uses a separate image per service (cms-api init, cms-api main, web, cms-admin).
- `.github/workflows/` must be updated from `.github_template/` now, not left as the old untracked ci.yml. T37b's "Playwright on the compose stack" acceptance is superseded: e2e needs a different way to run against the built images or the services (planner to propose).

### T37 re-scope answers (user, 2026-10-22)
- Q-T37-8 Publish and deploy are gated on e2e passing (`needs: [<app>, e2e]`).
- Q-T37-9 One cms-api image, run as init (`deploy:migrate`) and as main. No separate init image.
- Q-T37-10 CI e2e runs on a `docker run` stack of the built images (Traefik routing, init first, shared seeding), not from source.
- Q-T37-11 Static cms-api env moves to `scripts/stack/cms-api.env`, read by compose via `env_file:`.
- Committed: T37c 1a8d2fc (web numeric user).
- T37b done @ 07347df (user committed; qc-cli pass). Open: actionlint not installed locally, so the workflow YAML is not linted yet; CI is the first real run. Install actionlint and run it before T37e.
- T37d done @ 8423adf (user committed; qc-cli pass, smoke 106/106 on two back-to-back runs). Flakes media-attach and web-session fixed; select-5-publish spec exists in content-bulk.spec.ts. Still open: cms-api password.spec.ts timing flake and one cms-api integration flake (not in e2e).
- T37f ready-for-checks (qc-cli running). Follow-up for qc: apps/e2e hardcodes the DB container name `abyss-smoke-db-1` (src/constants.ts, reviewer.spec.ts, seed-media.ts). Read it from an env var so e2e-stack.sh can use `abyss-e2e-db` and run beside `pnpm smoke`. Until then the two stacks must not run together.
- T37f done @ a2897da (user committed; qc-cli pass). Flake to watch: two-factor.spec.ts:68 TOTP sign-in failed once in smoke (Sign out not seen after TOTP); passed on rerun. Owner of apps/e2e to check freshTotpCode timing.
- T37e: for production, the template's actions are pinned by major tag, not SHA; cms-api production needs sharp platform binary check (see Cloudinary follow-up) -> T38. bundle-check.sh now takes the full VITE_API_BASE_URL (template split origin + /api/v1 does not fit).
- T37e security review (findings, file .claude/state/findings/T37e-security.md): medium - docs/ci-cd.md must restrict each Environment to its branch and keep DEPLOYMENT_REPO_TOKEN as an Environment secret (fine-grained, deploy repo only); low - checkout keeps the token in .git/config. User decision: pin all actions to commit SHAs. Fix round sent to the T37e builder; RECHECK security after.
- T37e done @ 612da2b (user committed; security re-check pass; qc-cli pass). Open: spot-check that each pinned action SHA matches its version comment (security had no network access); confirm GitHub Environments (staging, production) and secrets are set up before the first real run.
- T38 done @ 1a6998f (user committed; docs only, no checks). Open from the guide's "not run" list: k8s manifests and real Traefik/Cloudflare client IP untested (no cluster); rclone off-site upload, SOPS/sealed-secrets, readOnlyRootFilesystem on admin untested. Gap: deploy:migrate loads full app config, so the init container needs the same Secret as main (DB-only loader is a follow-up, see T37a).

## Ad-hoc D1 answers (user, 2026-10-22)
- Write a local-run guide and a k3s secret-configuration guide, in English.
- k3s secrets: use SOPS (encrypted secret files in the deploy repo). Document the env contract per app, which keys are secret, and how to create and rotate the encrypted files.
- Docs only; do not commit, the user reviews first.

## Base config (user request, 2026-10-22)
- Request: rename `packages/prettier-config` to `packages/base-config` with exports `prettier` (Prettier config), `eslint` (ESLint config), `oxlint` (Oxlint config). Use it in all apps and packages.
- Typo "pretter" in the request read as "prettier".
- Answer Q1 (ESLint/Oxlint): "Base + local extend". The shared configs hold the common rules. Each app/package imports them and adds its own plugins and rules (React, Next, Nest, e2e).
- Answer Q2 (cleanup): "Remove old files". Delete the old folder and duplicate config files (`eslint.config.ts`, `eslint.config.mjs`, `oxlint.config.ts`) after the move. Each deletion needs user approval before it runs.
- Answer Q3 (name): `@abyss/base-config`. Update every `@abyss/prettier-config` reference: `.prettierrc.cjs`, `package.json` deps, `package.json` root, `abyss.code-workspace`, `SPEC.md` tree and §, `tasks/todo.md` refs, package README, tests.
- Scope: packages/base-config is core-builder; apps/cms-admin, apps/web and packages/form-commons are ui-builder (after core-builder); apps/e2e is qc's scope, so its config change goes to core-builder's scope or a dedicated step. Planner to decide the split and state it in the task.
- Answers to Q-BC1 to Q-BC4 (all recommended): Prettier keeps today's values, no new plugins. ESLint base = shared rules only (no React, Prettier-as-lint, Jest globals or loosened rules). Oxlint base = typescript plugin, correctness, suspicious, unused-vars pattern, shared ignores (no React). Format = TS sources loaded directly, no build step; fall back to .mjs / oxlint.json only if a tool cannot load them.
- D2 deletion approval (user, 2026-10-22): approved all three. Delete `packages/prettier-config/` (whole folder, incl. untracked drafts), `apps/cms-api/.oxlintrc.json`, `apps/e2e/.oxlintrc.json`. Then one `pnpm install`, then finish step A checks and report.
- D2 step A committed as 76d9058 (user approved). Step B next.
- D2 step B committed as 1018286. Step C qc CLI pass. Docker builds not run (daemon down).
- User decision (2026-10-22): build `@abyss/base-config` to JS with a `dist/` folder and export from dist. This replaces Q-BC4 (TS direct, no build). Needs a new task (REPLAN D2 -> D3); core-builder owns packages/base-config.
- D3 answers (user, 2026-10-22): exports get `types`, `import` and `default` (all to dist/), so the seven .prettierrc.cjs files stay unchanged. No install hook: build with turbo and the root format scripts, and the README says to run `pnpm --filter @abyss/base-config build` once after a fresh clone.
- Root start scripts (user, 2026-10-22): `start:dev` runs dev for cms-admin and web in parallel (cms-api excluded). cms-api starts with its existing `start` script (no new dev script). Root package.json scripts: start:dev, start:cms-admin, start:web, start:cms-api. Ad-hoc S1, core-builder scope (root package.json).
- User decision (2026-10-22): e2e does NOT run in GitHub CI. Remove the CI e2e job (T37f scope: no e2e in CI). Image publish (T37e) is NOT gated on e2e; publish after CI checks (lint, typecheck, unit tests, build) pass. e2e stays local only (`pnpm smoke`, `pnpm e2e:spec`). Replan T37 (e2e job removed; T37e gate changed; Q-T37-8 and Q-T37-10 are resolved by this).
- T37g answers (user, 2026-10-22): delete `.github/workflows/e2e.yml`, `scripts/e2e-stack.sh` and `scripts/stack/web-build.env` (approve each deletion when it comes up). Publish does NOT wait for the repo job (format:check and audit); it waits only for the app checks, as in T37e/T37g.
- Fix request (user, 2026-10-22): `pnpm format:check` fails on gitignored apps/e2e report output (playwright-report/, test-results/). Fix: add these output folders to `.prettierignore` (root config, core-builder). Ad-hoc F1.
- Owner creation on k3s (user, 2026-10-22): the user rejects `kubectl exec` and the one-shot Job. Chosen: a one-time setup page (like Strapi), open only while no owner exists, guarded by a setup token from a k8s secret. This reverses Q2 (invite-only) and success criterion 1 ("no HTTP route creates an owner"). Needs a spec change (planner DESIGN), then a task, then a security-qc review (high risk: identity module). Keep owner:bootstrap CLI as a fallback unless the user says otherwise.
- Owner setup answers (user, 2026-10-22): Q-OS1 login page after setup (no direct sign-in). Q-OS2 status route needs no token. Q-OS3 no completed marker (setup closed by owner row + removing token). Q-OS4 smoke creates owner via the setup route. ADR 0005 accepted.
- OS1 security answers (user, 2026-10-22): closed response keeps the same body as an unknown route; headers may differ (no-store, throttle 429 stay). Add a 100-character cap on displayName in the shared rule (setup route and CLI).
- OS2 answers (user, 2026-10-23): the login 'Set up the owner account' link stays secondary (one primary per view; this overrides the spec's primary). On status-call failure the setup page shows a warning with Try again and no form.
- OS4 browser walk (user, 2026-10-23): the user will walk the remaining open-state steps (wrong token, validation, valid submit, owner sign-in, /setup redirect after setup, storage/URL check) themselves on a fresh smoke stack. The permission block on the qc browser typing step is not to be worked around.
