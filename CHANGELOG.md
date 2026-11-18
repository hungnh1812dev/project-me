# CHANGELOG

Every release of the repository, newest first. Each entry gives the repo version, the version of each app and package, the changes (new features, changes, bug fixes) and the DevOps patches the deploy repo must apply for it. How a release is versioned and recorded: [docs/global/FLOW.md](docs/global/FLOW.md) "Versions and change log".

Versions follow [Semantic Versioning](https://semver.org/). The repo version names the release; an app's version changes only in a release that changes that app.

## Unreleased

### New features

- cms-api: new field types `biginteger`, `float`, `double`, `time`, `enumeration`, keys `unsigned` and `options`, GraphQL scalars `BigInt` and `Time`; document writes check `unsigned` and `options`, and the content type view lists `options`.
- cms-admin: schema builder Number, Datetime picker and Enum fields with a properties popup; JSON inputs with line numbers.
- cms-api: the image runs the nightly backup job, with client tools and script ([backups flow](docs/flows/backups/SPEC.md)).
- web: `/cv` is built from the main `page-cv-a`, the `profile` and `pageCvText` in `views/cv` (queries `PageCv` and `PageCvVisitor`); the new projects section is shown, no main CV answers 404, and `features/cv` is gone (WPQ-9).
- web: `/status` page, and the module status on `/`, come from one `ModuleStatus` part (query `ModuleStatus`, field `moduleStatus`) in place of the `StatusPage` query (WPQ-13).
- root: the smoke stack publishes the header, sign-in, status, CV text, profile and `page-cv-a` content (built from the web mocks by `scripts/smoke/SeedContent.mjs`) before web starts, so the staging web renders real cms-api text.
- cms-api: new content type `page-cv-a` (migration `0013_content.sql`; a collection of CV pages with skills, experiences with roles, projects and educations; no web reader yet) (WPQ-7).
- e2e: every `tests/*.e2e.spec.ts` carries app tags (`@cms-admin`, `@web`, `@cms-api`) and flow tags, checked against `docs/apps` and `docs/flows` by `src/SpecTags.contract.test.ts`; qc selects a test scope with `--grep`.
- scripts: build and push the three app images to a local k3d registry ([local-registry.md](docs/deployments/local-registry.md)).
- scripts: `local-registry-push.sh --no-cache` builds the app images without the Docker layer cache.
- scripts: `pnpm dev:stack:seed` adds one media file and one document with a draft to a running dev stack, so the media and diff screens can be checked at tier 2.
- web: content API layers (server RESTful, server GraphQL with `APP_API_TOKEN`, client RESTful); page text and CV data come from cms-api in three queries with a 180 s per-call cache, and a mock fallback through `MockView.ts` that is on only where `APP_ENV` is not `production` (WEB-1..WEB-9).
- cms-admin: premium SaaS look (indigo primary, rounded cards, sticky sidebar and header, soft focus halo) and toasts for the outcomes of content, media, access and security actions (ADM-1..ADM-10).
- form-commons: theme tokens for the premium look, a `Card` component and a `Toast` provider; web is unchanged.

### Bug fixes

- web: `/cv` never answers 404 or 500 for its content: with no published main `page-cv-a`, or a failed read with no mock (production), it shows the no-CV-live state (`cv-common-text` `noCvText`, or the last-resort text); an unpublished `cv-common-text` shows the CV without labels; in development and staging a failed read or a single type that answers null gets its mock, a collection that answers empty never does; `/cv` runs three queries (`PageCvA`, `Profile`, `CvCommonText`) (public-site PS-2, Q-PS2c, Q-PS2e, WEB-5).
- cms-api: the content type `page-cv-text` is renamed `cv-common-text` with a new field list including `noCvText` (destructive migration, no data carried over; public-site PS-3, Q-PS7).
- cms-api: accepts `NODE_ENV=staging` (the staging cluster's cms-api crashed at boot on it); the production guards still need `NODE_ENV=production`.
- e2e: the type check passes again (`jsx` and the `@apis/*` path in `tsconfig.json`; explicit presence checks in three specs).

### DevOps patches

- cms-api 0.2.0: backup CronJob runs the cms-api image; time set by Secret `postgres-backup-schedule`; `NODE_ENV=production` in `postgres-backup` ([patch](docs/apps/cms-api/patch-cms-api-0.2.0.md)).
- root: `SMOKE_WEB_PRODUCTION=1 pnpm smoke` builds and runs web with `APP_ENV=production` and its default data cache window (`SMOKE_WEB_APP_ENV`, `SMOKE_WEB_REVALIDATE_SECONDS` in `docker-compose.smoke.yml`); the default stays staging with no cache.
- scripts: the smoke and dev stacks seed the new content types (`header`, `module-auth`, `module-status`, `page-cv-text`, `profile`, `page-cv-a`) from the web mocks; `pnpm dev:stack demo` runs `SeedContent.mjs` instead of `scripts/demo/content/`, and the start check reads `pageCvAList` and `experiences.company`. No deploy-repo change (WPQ-10).
- web 0.2.0: `API_INTERNAL_URL` is renamed `APP_API_URL`, `APP_API_TOKEN` is added to `web-secrets`, `WEB_REVALIDATE_SECONDS` is dropped, `APP_ENV` is added to `web-secrets` and as the GitHub variable `APP_ENV` for the image build, which must be `production` (the `production` Environment refuses any other value; the two must match); create the token as a `guest`-role account (not owner or admin) and run the post-deploy `_maskedFields` check; release web only after the cms-api release that serves the page text types ([patch-web-0.2.0.md](docs/apps/web/patch-web-0.2.0.md)).
- web 0.2.0, local k3s cluster: remove the cms-api route on the web host (Ingress `cms-api-staging`, IngressRoute `cms-api-staging-upload`) so the web BFF answers `/api/v1/*`, and rebuild the web image from a clean commit; the old image logs the server env, so rotate those values if reused ([patch-web-0.2.0.md](docs/apps/web/patch-web-0.2.0.md)).

### Changes

- root: the dependency audit ignores GHSA-fc5q-39xc-vjpf (picomatch, lint-only path, no fixed release) until a fix is published.
- cms-api: the backup job uploads only with `NODE_ENV=production`, the image default; other clusters set their own value ([backups flow](docs/flows/backups/SPEC.md)).
- web, cms-admin: spec: the public site serves `/robots.txt` (production: disallow `/api/`; other stacks: disallow `/`), `/sitemap.xml` (a static list of `/` and `/status` on `WEB_ORIGIN`, no `lastmod`) and `/favicon.ico` (a letter mark of the app name in palette A); robots and sitemap are built per request with a one-hour public cache, and none of the three gets the nonce CSP; the cms-admin host serves a `robots.txt` that disallows `/` ; the web `robots.txt` keeps Next.js's `User-Agent:` field-name case (public-site PS-4, Q-PS8..Q-PS15, criterion 28; user 2026-11-16).
- web: the server fetch layers are simpler (user 2026-11-16): the server RESTful layer is one `request` function plus `get`, `post`, `put`, `patch`, `delete` and `options`, each with `headers`, `body`, `resolveData` and Next.js `next` (`revalidate`, `tags`) options; the server GraphQL layer is one `executeGraphql(query, options)` with a `mock` key, `resolveData`, `next` and a visitor `accessToken`; a failed query is mocked as a whole by its key (`page-cv-a`, `profile`, `cv-common-text`, `site-header`, `sign-in`, `not-found-page`, `module-status`) where `APP_ENV` is not `production`, and no root field is retried alone (WEB-1, WEB-5, Q-WFL1..Q-WFL7).
- cms-api: `page-cv-a.educations` is a repeatable list (`[PageCvA_Education!]`); migration `0015_page_cv_educations.sql` has no DDL (the child table already exists), the snapshot and `schema.graphql` are regenerated (DR1).
- web: the header reads its nav label and CV link from the cms-api `header`, the account menu reads Open CMS, signed-in and sign-out failure text from `moduleAuth` through the sign-in query, and the not-found page reads its text from `header`; `siteText` and `moduleSignIn` are no longer queried (WPQ-12, PS-1, Q-PS4).
- web, cms-api: spec: every web page is a route file that renders one page view (`Page<Name>.tsx` loads the data, `.data.ts` for a load that is not simple, `.graphql.ts` the query, `.client.tsx` the browser part); the CV data moves from `features/cv` into `views/cv`; `/cv` answers 404 when no main CV is published; `/` and a new `/status` page show the module status; the web reads `header`, `module-auth` (was `module-sign-in`), `module-status` (was `module-page-status`), `profile`, `page-cv-text` (was `cv-page-text`) and `page-cv-a`, the `site-text` fields move to `header` and `module-auth`, and `cv-page`, `cv-contact`, `resume` and `site-text` are removed (WEB-11, public-site PS-1, PS-2, PS-3, criteria 16 and 25; user 2026-11-15).
- web: the root layout renders the new server `SiteHeader` (header and sign-in text loaded in parallel) and the not-found page loads its own text; nav, account menu, sign-in dialog, two-factor step and Turnstile widget take their text as props and `features/site-shell` with its text context is removed (PS-1, PS-2, Q-PS1b).
- web, cms-api: spec: each part fetches its own text: the header (`SiteHeader`), the sign-in dialog (`SignIn`) and the not-found page (`NotFoundPage`) run their own queries and pass the text to their client components as props; the shared `SiteShell` query, its text context and the `site-shell` feature go; the error page always uses the built-in last-resort text, so cms-api `siteText` drops `errorTitle`, `errorDescription` and `errorRetry`; a failed sign-in text hides only the sign-in button (public-site PS-1, PS-2, WEB-3, WEB-6; Q-PS1a, Q-PS1b, user 2026-11-15).
- cms-api: migration `0014_content.sql` reshapes the public-site content types: it drops `cv-contact`, `cv-page`, `resume`, `site-text`, `module-sign-in`, `module-page-status` and `cv-page-text` with their rows (no data carried over), creates `module-auth`, `module-status` and `page-cv-text`, adds `navLabel`, `navCvLink`, `notFoundTitle` and `notFoundDescription` to `header`, makes `profile` a single without `photo`, and marks `page-cv-a` `experiences.company` sensitive; reseed the stacks and enter the production content again in cms-admin (WPQ-8).
- cms-api: migration `0012_content.sql` drops the `site_text` columns `error_title`, `error_description` and `error_retry` (the `siteText` fields are gone from the content schema and GraphQL schema; their text is not kept) (WPQ-1).
- cms-api: no longer accepts `NODE_ENV=test`; its tests run with `development` (API-2).
- scripts: `local-registry-push.sh` tags images with a UTC timestamp by default instead of the commit hash (`LOCAL_IMAGE_TAG` still overrides); the build context is unchanged.
- root: spec: the first production deploy makes the site public (Q-OPS4), so the launch gate's live check runs on a local k3s cluster with the production config before it, and a read-only check of the public site follows the deploy; the backup secrets are set in production only, so the real backup download is checked there (Q-OPS6).
- web: the mock fallback is switched by `APP_ENV` (`development`, `staging`, `production`; read at build and at runtime, which must match) instead of `ALLOW_MOCK_FALLBACK`; mocks fill only server GraphQL content reads, on an error, by key; the server, browser and BFF layers raise one error shape `WebApiError` (WEB-9, WEB-10).
- web: spec for `APP_ENV` (`development`, `staging`, `production`, at build and at runtime) as the one switch of the mock fallback, replacing `ALLOW_MOCK_FALLBACK`; mocks only for server GraphQL content reads, only on an error (GraphQL `errors` with HTTP 200 included), chosen by key, loaded by dynamic import and never cached; and one API error shape `WebApiError` for the server and browser layers and the BFF (WEB-5, WEB-9, WEB-10).
- cms-api: `POST /content-types/validate` (owner only) checks a content type definition against the registered types and returns the errors of the submitted definition; it stores nothing (flow schema-builder, SB-10).
- cms-admin: the owner-only schema builder page `/schema-builder` with a field palette, canvas, property panel, live check, JSON import and copy or download; adds the `@dnd-kit` dependency (flow schema-builder, SB-1..SB-14).
- cms-admin, cms-api: spec for the schema builder: an owner-only cms-admin page (`/schema-builder`) that creates or updates a content type schema with a drag-and-drop field palette and canvas (components up to 3 levels), a property panel, live checks through a new owner-only `POST /content-types/validate`, and copy or download of the JSON file; nothing is written on the server, `content:generate` stays a manual step; `@dnd-kit` added to cms-admin only (flow schema-builder, SB-1..SB-14, D24; Q-SB1..Q-SB5 answered by the user 2026-11-12, as recommended).
- web, cms-api: spec: the sign-in text and the status page text are the cms-api single types `module-sign-in` and `module-page-status` (root fields `moduleSignIn`, `modulePageStatus`); web reads them under the aliases `signInText` and `statusPageText`, so its response keys, text types and mocks stay (public-site PS-1, web Q-WCA10; user 2026-11-12).
- cms-api: the content types `sign-in-text` and `status-page-text` are renamed `module-sign-in` and `module-page-status` (GraphQL root fields `moduleSignIn` and `modulePageStatus`). Data migration (D10): `0011_content.sql` drops the old tables without copying their rows; enter the sign-in and status page text again in cms-admin after the deploy. No deploy repo change (flow content-modeling, SCB-11).
- cms-admin: spec for the premium SaaS look: indigo primary with a soft coloured shadow, rose destructive, slate zoning, rounded cards without hard borders, sticky sidebar with an active indicator, sticky header, toasts for action outcomes, a 3 px focus halo with a solid edge, 200/300 ms transitions; tokens stay in form-commons with a `premium` theme block, web keeps its look (ADM-1..ADM-10, D23).
- cms-admin: spec: a dialog closes at once; only its backdrop fades out and takes no clicks while it fades (ADM-9).
- cms-admin: spec: the sidebar shows only the pages the role may read; a role with no read permission sees a Welcome sidebar ("Welcome to the system", "Contact the administrator to be granted access."); no API change, reviewer role out of scope (ADM-11).
- cms-admin: spec: empty states (no rows yet, backups not configured) sit in a card like the loading skeleton; forbidden and load-error notices stay alerts outside cards (ADM-7).
- cms-api: test-stack-only overrides `ACCOUNT_INVITE_RATE_LIMIT_IP`, `ACCOUNT_INVITE_RATE_LIMIT_ACTOR`, `OTP_ISSUE_RATE_LIMIT_ACCOUNT`, `PASSWORD_SUBMIT_RATE_LIMIT_IP` and `PASSWORD_CHANGE_RATE_LIMIT_IP` (same opt-in as the other rate-limit overrides), raised on the smoke and dev stacks so the full e2e suite no longer hits the invite and per-account email-code limits; production defaults are unchanged.
- web: spec for the content API layers (server RESTful, server GraphQL with `APP_API_TOKEN`, client RESTful), page text from cms-api in three queries, per-call cache (180 s default), local mock fallback through `MockView.ts`, a role-display extension point, and `APP_API_URL` replacing `API_INTERNAL_URL` (WEB-1..WEB-8, public-site PS-1..PS-2); the public-site rules now say the homepage shows only the service status view (Q-BFF2); `site-shell` is a base web feature (web RULES "Layers").
- web: spec names the scope of the web API token: `*` `read`, created by a read-only account, on every stack and in production (WEB-2, Q-WCT1).
- root: `docs/deployments/web.md` is the DevOps deployment guide for the web service (image, env keys, routing, release, checks), linked from the DevOps runbook.
- cms-api: every finished request leaves one log line (method, path without query, status, duration in ms), a warning above 1000 ms; the health probes are skipped (API-1).
- root: the dev and smoke stacks keep the test account logins (`STACK_*`) in `.localEnv.agent`, generated once and reused on every start; `stack_load_accounts` replaces `stack_generate_credentials` (ADR 0020).
- cms-api, cms-admin, web: a ticked "Keep me signed in" keeps the sign-in for 30 days (sliding); an unticked one ends with the browser session; existing sessions get 30 days at their next rotation.
- cms-api: `TWO_FACTOR_EMAIL_RATE_LIMIT_IP` overrides the `2fa-email:ip` limit (test stacks only, same opt-in as the other rate-limit overrides); smoke and dev stacks raise it.
- cms-api: `TWO_FACTOR_MANAGE_RATE_LIMIT_IP` overrides the `2fa-manage:ip` limit the same way; the 2FA e2e spec restores its stored account on a kept stack.
- web: `BFF_AUTH_RATE_LIMIT_IP` and the opt-in `ALLOW_BFF_RATE_LIMIT_OVERRIDE=smoke` are set to 10000 on the smoke and dev stacks only; deploy docs list both as never set in production.
- web: the BFF moved from `/bff/v1` to `/api/v1`; `/bff/v1` is removed with no alias or redirect.
- web: imports use `@/` tsconfig path aliases, resolved by Vitest too; base-config: Prettier groups `@/styles/global.css` alone.
- root: `session-gate` breaks checklist sessions only after 40k tokens of growth; the manager resumes from `Next:`; `tokstats` reports per-job tokens.
- root: `session-gate` denies a CHECK or RECHECK naming several tiers; `tokstats` groups Bash output by command after a leading `cd`.
- root: `session-gate` breaks the manager session past 95K tokens of context, under the 100K prompt size Haiku bills at 5x.
- root: `session-gate` names the in-progress feature and its `Next:` line at session start, so the manager skips scanning state.
- root: `session-gate` keeps its state under the project root, so a session that changes folder no longer forks it.
- root: `session-gate` takes the first non-zero context size as the session baseline; a 0 read at the first dispatch counted the whole startup context as growth and broke checklist sessions after about 2k tokens of work.
- root: the manager breaks a session only when `session-gate` denies a dispatch, at a board `Breaks:` point, or after a passed checkpoint or closed feature, never on its own estimate.
- root: qc, security-qc and the builders wait on a long command in bounded steps under 170 s (no open `until` / `pgrep` / `sleep` loop, no turn ended to wait) and report `blocked` after 10 min with no new log line; the manager names the usual length of a tier 2 or 3 checker run.
- root: `test-tiers` keeps only the tiers, when each runs, who does what and missing commands; the checklist format, access preflight and progress file move to `checklist-runs` (planner, qc, security-qc), `.localEnv.agent` and scratch git to `local-env` (builders, qc, security-qc), and the manager's preflight and progress steps to `manager.md`, so the manager and builders preload about 1.1–1.3k fewer tokens.
- root: the planner writes `SPEC`, `PLAN`, `DESIGN` and phase or feature `REPLAN` changes as a draft in `.agent-state/drafts/<name>/` (`.claude/bin/draft start`), revises it in place and reports a summary instead of the drafted text; the manager shows `draft diff --stat` and, on the user's word, runs `draft apply` (refused when a repo file changed since the start; `draft rebase` merges it in 3-way) or `draft drop`.
- root: qc and security-qc run an access preflight before every tier 2 or 3 run: they list the commands, MCP tools, `.localEnv.agent` keys and stack actions the rows need, probe the stack, and stop with `status: preflight` when something is not allowed yet; the manager asks the user once, then sends `GO` (`test-tiers` "Access preflight").
- root: `break-check` blocks a session break while `handoff.md` is behind, snapshots the feature state at each session end, and gates checkpoint pass and feature close.
- root: a phase checkpoint's tier 3 runs only the e2e specs the feature can affect, and the feature checks run no tier 3 and no final run: passed phase rows are carried as `pass` and a tier 3 only feature row is `n/a` with a note, which `break-check --close` accepts (ADR 0022 and its amendment).
- root: one full stack per tier 3 run: only qc starts it for a checklist run (kept mode without e2e; the full suite only when the user asks), a running stack on the same `HEAD` is reused and stays up across a session break (`Stack:` line in `handoff.md`), builders never start it, and a re-test round runs only the failed specs plus the scope of the fix commits.
- root: the manager triages a question about the code, spec or project through `request-validator` instead of answering it or saying it does not know; the validator returns `route: answer` with file:line evidence, and the manager shows it to the user verbatim.
- root: builders, qc and security-qc ask the user (report `blocked`) before adding, changing or deleting anything that affects a database: schema, migrations, seeds, DB config, or data reset and bulk changes, local included (`local-env` "Database changes").
- root: `docs/global/reference/env-vars.md` lists every app's environment variables with purpose, required at start, default and scope.

## 0.1.0 (2026-11-05)

Repo 0.1.0, cms-api, cms-admin and web 0.1.0, e2e 0.0.2: the web BFF, the content schema moves to component paths, admin labels and widths, and the fixes since 0.0.1.

### Versions

| Part               | Version | Changed in this release |
| ------------------ | ------- | ----------------------- |
| repo               | 0.1.0   | yes                     |
| `@abyss/cms-api`   | 0.1.0   | yes                     |
| `@abyss/cms-admin` | 0.1.0   | yes                     |
| `@abyss/web`       | 0.1.0   | yes                     |
| e2e                | 0.0.2   | yes                     |

### New features

- web: BFF sign-in with Turnstile and sealed session cookies; CV page on `/cv` ([ADR 0018](docs/adr/0018-web-bff.md)).
- cms-api: content fields take `displayName` and `width`; component field names may be SQL reserved words.
- cms-admin: document form shows title-case labels, text inputs and field widths.

### Changes

- web: the root layout renders the new server `SiteHeader` (header and sign-in text loaded in parallel) and the not-found page loads its own text; nav, account menu, sign-in dialog, two-factor step and Turnstile widget take their text as props and `features/site-shell` with its text context is removed (PS-1, PS-2, Q-PS1b).
- cms-api: content fields take `component`, `displayName` and `width`; five schemas move to the new format ([content-schema](docs/modules/content-schema.md)).
- cms-api: migration `0006_content.sql` renames two component tables and drops old cv-page columns and tables.
- cms-api: `identifier.reserved` still applies to every field except a component field's name.
- cms-api: cv-page field `referees` is renamed `references`; migration `0007_content.sql` holds comments only.
- cms-api: cv-page `experiences.company` and `references.phone` are sensitive; migration `0008_content.sql` holds comments only.
- cms-admin: field labels, widths and inputs follow the new content definitions (CPS-6, pending).
- web: the browser no longer calls cms-api; a BFF in web holds sessions and checks Turnstile ([ADR 0018](docs/adr/0018-web-bff.md)).
- web: the reviewer button and the `/status` page are removed; `NEXT_PUBLIC_API_BASE_URL` is gone.
- cms-api, cms-admin: cms-api is served on `admin.<domain>` only; the dev server proxies `/api`.
- root: smoke and dev stacks serve cms-api on the admin host only; CI no longer reads `NEXT_PUBLIC_API_BASE_URL`.
- root: agent hooks `session-gate` and `read-guard` gate agent sessions and large reads ([global FLOW](docs/global/FLOW.md)).
- root: the planner sizes each feature small, medium or large; medium and large break after the plan.
- root: specs keep no change log; each fact is written once and referred to by id.
- cms-admin: screen text is read through locales; copy files move to `configs/locales/en`.

### Bug fixes

- cms-api: `cv-page` `references.phone` and `experiences.company` are masked for `public` and `reviewer`.
- cms-admin: a failed screen text load shows a retry state; the conditional-use warning is gone.
- web: unmatched BFF paths get a static CSP; unlisted methods answer `405` with `Allow`.
- root scripts: smoke and dev stacks route the admin `/api` path and set the web origin and secret.
- e2e: specs follow cv-page names and routes; stale reviewer specs removed.

### DevOps patches

- web-bff-hardening: web secrets and env, and the API route moved to the admin host ([web](docs/apps/web/patch-web-0.1.0.md), [cms-api](docs/apps/cms-api/patch-cms-api-0.1.0.md), [cms-admin](docs/apps/cms-admin/patch-cms-admin-0.1.0.md)).
- web-bff-hardening rollout: web first, then the route move and cms-admin.

## 0.0.2 (2026-11-04)

Repo 0.0.2 and cms-api 0.0.2: tag-driven release CI and the cms-api integration tests on release tags.

### Versions

| Part               | Version | Changed in this release |
| ------------------ | ------- | ----------------------- |
| repo               | 0.0.2   | yes                     |
| `@abyss/cms-api`   | 0.0.2   | yes                     |
| `@abyss/cms-admin` | 0.0.1   | no                      |
| `@abyss/web`       | 0.0.1   | no                      |

### DevOps patches

- Tag-driven release ([ADR 0016](docs/adr/0016-tag-driven-release-ci.md)): `v<x.y.z>` tags build `<x.y.z>` images; CI stops bumping the deploy repo ([cms-api](docs/apps/cms-api/patch-cms-api-0.0.2.md), [cms-admin](docs/apps/cms-admin/patch-cms-admin-0.0.2.md), [web](docs/apps/web/patch-web-0.0.2.md)).
- cms-api integration tests (Testcontainers) run in their own job, only on `v<x.y.z>` tags, gating the cms-api publish.
- Test coverage for the tag refusal when `release-apps.sh` fails.

## 0.0.1 (2026-11-04)

First versioned release: everything built up to this date.

### Versions

| Part               | Version | Changed in this release |
| ------------------ | ------- | ----------------------- |
| repo               | 0.0.1   | yes (first version)     |
| `@abyss/cms-api`   | 0.0.1   | yes                     |
| `@abyss/cms-admin` | 0.0.1   | yes                     |
| `@abyss/web`       | 0.0.1   | yes                     |

### New features

cms-api:

- Content engine: JSON-schema content types (root plus up to 3 component levels), reviewed SQL migrations, the type registry ([content-modeling](docs/flows/content-modeling/SPEC.md)).
- Documents REST API: list, read, create, versioned draft save with masked `409` diff, publish, unpublish, bulk actions, presence ([content-editing](docs/flows/content-editing/SPEC.md)).
- Read-only GraphQL API over published document reads, with the same authorization and masking as REST ([public-site](docs/flows/public-site/SPEC.md)).
- Access control: ranked system and custom roles, field permissions with `***` masking and conditions, scoped API tokens ([access-admin](docs/flows/access-admin/SPEC.md)).
- Identity: rotating refresh tokens with reuse detection, TOTP or email 2FA, invitations, password reset, owner setup ([sign-in](docs/flows/sign-in/SPEC.md), [password](docs/flows/password/SPEC.md), [two-factor-setup](docs/flows/two-factor-setup/SPEC.md), [owner-setup](docs/flows/owner-setup/SPEC.md)).
- Media library: magic-byte-checked uploads, image re-encoding, replace, alt text, delete when unreferenced, purge job, files stored as `<stem>_<hash8>.<ext>` ([media](docs/flows/media/SPEC.md)).
- Reviewer sessions: self-service 24 h read-only access behind Turnstile, owner switch, session log, `REVIEWER_FEATURE_ENABLED` switch ([reviewer](docs/flows/reviewer/SPEC.md)).
- Owner-only backup download: list the nightly encrypted dumps and get a 60 s link after password plus 2FA ([backups](docs/flows/backups/SPEC.md)).
- Always-on security audit log ([security-audit](docs/flows/security-audit/SPEC.md)); health probes; production config guards; separate database roles with TLS `verify-full`.

cms-admin:

- Sign-in with the two-factor step, owner setup, invitation (set password), forgotten password, profile, password change, two-factor settings.
- Accounts, roles and the permission matrix, API tokens.
- Content: collection lists with bulk actions, the document editor with draft, publish, version-conflict merge and presence.
- File Library: search, filter, upload with honest progress, replace, alt text, delete.
- Reviewer switch and session log, Backups page, home status card.

web:

- Public CV page from published content over GraphQL, with sensitive fields masked and richtext sanitized.
- Sign-in dialog with the two-factor step, reviewer access dialog, `/status` page; CSP with a per-request nonce.

Repository:

- CI on GitHub Actions: checks per affected app, images on GHCR, the image tag bump in the deploy repo.
- Pre-commit formatting with husky and lint-staged.
- Licensed under AGPL-3.0-only ([LICENSE](LICENSE), [NOTICE](NOTICE)).
- Docs organized as global, app and flow specs, module docs, DevOps docs and local guides ([SPEC.md](SPEC.md)).

### Bug fixes

- cms-api: rejected uploads no longer answer 502 or lose their 403; `requestTimeout` is 5 min.
- cms-admin, form-commons: uploads outlast the 10 s client timeout; progress, long file names and the `MediaInput` frame are fixed.
- cms-api, cms-admin, e2e: refresh races across browser tabs signed users out.
- cms-api: expired tokens can't be updated; conditional create counts as ungranted; purge keeps other providers' media; reads include media `sha256`.
- cms-admin: jitless Zod keeps CSP; backup status loads on demand; dialog focus returns; tables fit 375 px; emoji initials intact.
- web: masked CV fields show "Hidden" for reviewers.

### DevOps patches

Apply these to the deploy repo for this release (staging first, then production):

- [docs/apps/cms-api/patch-cms-api-0.0.1.md](docs/apps/cms-api/patch-cms-api-0.0.1.md): port key, `/api` on the bare domain, the reviewer switch key, removed keys, rollout order.
- [docs/apps/web/patch-web-0.0.1.md](docs/apps/web/patch-web-0.0.1.md): port key, image and overlay names, TCP probes, template keys.
- [docs/flows/media/patch-media-0.0.1.md](docs/flows/media/patch-media-0.0.1.md): Traefik read timeout, the `api-upload` route and its two middlewares.
