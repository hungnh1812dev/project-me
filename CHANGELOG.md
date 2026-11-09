# CHANGELOG

Every release of the repository, newest first. Each entry gives the repo version, the version of each app and package, the changes (new features, changes, bug fixes) and the DevOps patches the deploy repo must apply for it. How a release is versioned and recorded: [docs/global/FLOW.md](docs/global/FLOW.md) "Versions and change log".

Versions follow [Semantic Versioning](https://semver.org/). The repo version names the release; an app's version changes only in a release that changes that app.

## Unreleased

### New features

- scripts: build and push the three app images to a local k3d registry ([local-registry.md](docs/deployments/local-registry.md)).
- web: content API layers (server RESTful, server GraphQL with `APP_API_TOKEN`, client RESTful); page text and CV data come from cms-api in three queries with a 180 s per-call cache, and a local mock fallback through `MockView.ts` (WEB-1..WEB-8).

### DevOps patches

- web 0.2.0: `API_INTERNAL_URL` is renamed `APP_API_URL`, `APP_API_TOKEN` is added to `web-secrets`, `WEB_REVALIDATE_SECONDS` is dropped; create the token as a `guest`-role account (not owner or admin) and run the post-deploy `_maskedFields` check; release web only after the cms-api release that serves the page text types ([patch-web-0.2.0.md](docs/apps/web/patch-web-0.2.0.md)).

### Changes

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
- root: qc and security-qc run an access preflight before every tier 2 or 3 run: they list the commands, MCP tools, `.localEnv.agent` keys and stack actions the rows need, probe the stack, and stop with `status: preflight` when something is not allowed yet; the manager asks the user once, then sends `GO` (`test-tiers` "Access preflight").
- root: `break-check` blocks a session break while `handoff.md` is behind, snapshots the feature state at each session end, and gates checkpoint pass and feature close.

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
