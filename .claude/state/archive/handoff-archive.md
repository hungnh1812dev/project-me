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
