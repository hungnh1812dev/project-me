# Handoff
Updated: 2026-10-22 after T32 (trimmed to open work; history in archive/handoff-archive.md)

## In progress / next
- T32 Reviewer UX (web + admin) + owner log - ready-for-checks; next: qc (browser: reviewer flow on rebuilt smoke, needs internet) + security-qc (Risk high: apps/web/src/features/auth). Provisional: no CvView refetch (T30 skipped); web reviewer button hidden unless NEXT_PUBLIC_TURNSTILE_SITE_KEY set and status on; reviewer session has no refresh (reload ends it); admin has no entry path for a reviewer token yet; no Turnstile nonce (T36).
- T32 user answers: visitor roles Recruiter, Peer / colleague (+ Other, free text); purpose tags Hiring, Project scoping, Networking (+ Other, free text); Cloudflare public Turnstile test keys in docker-compose.smoke.yml and the smoke web build only; production keys come from the user.
- T35 Bulk UI - awaiting checks/commit; next: qc (browser: list, select 5 -> publish, delete confirm, import) on a rebuilt smoke stack. Provisional: selection is per page; actions run non-atomic; import non-atomic by default and trims succeeded items from the text; list shows drafts only (no published-state column); no nav link to `/content/:slug` yet; columns = first 3 root scalar fields.
- T36 Security headers - cms-api, web, admin nginx and smoke assertions all ready-for-checks; next: qc (smoke passes; browser: web CV/login/reviewer dialog and admin show no CSP violations in the console) . The task's 'prod config refinements' list was not defined beyond the acceptance text.
- T37a deploy:migrate init container - awaiting checks/commit; next: qc-cli, then T37b (CI).
- T37c web image numeric non-root user - awaiting checks/commit; next: T37e uses it.
- T37b CI checks + build - awaiting checks/commit; next: qc-cli, then T37f (e2e), T37e (publish).
- T37f e2e in CI on docker-run stack - awaiting checks/commit; next: qc-cli, then T37e (publish; gate on e2e per Q-T37-8).
- T37e Image publish + deploy bump - awaiting checks/commit (Risk high; security-qc before commit); next: qc-cli, then T38. First real publish unverified until the user pushes and creates the Environments (docs/ci-cd.md "Publish").
- D1 done @ bfa3455 (user committed; docs only). Open: SOPS flow untested on a cluster; try once on a scratch namespace. cms-api does not load .env itself (guide uses set -a; . ./.env).
- D2 step B (ui) built - blocked on deleting apps/{cms-admin,web}/.oxlintrc.json and packages/form-commons/.oxlintrc.json (approval); next: user approves, run pnpm lint, then step C (qc).
- Phase 5 (Media): checkpoint still pending user review.
- Next: Phase 6 phase checks (T38 done); Phase 5 checkpoint still pending.

## Follow-ups
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

- T37f: apps/e2e hardcodes the DB container `abyss-smoke-db-1` (src/constants.ts SMOKE_DB_CONTAINER; reviewer.spec.ts, seed-media.ts run `docker exec` psql), so e2e-stack.sh names its Postgres container that too (cannot run beside `pnpm smoke`) -> qc: read the name from an env var, then e2e-stack.sh can use `abyss-e2e-db`.
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
