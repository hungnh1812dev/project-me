# CHANGELOG

Every release of the repository, newest first. Each entry gives the repo version, the version of each app and package, the changes (new features, changes, bug fixes) and the DevOps patches the deploy repo must apply for it. How a release is versioned and recorded: [docs/global/FLOW.md](docs/global/FLOW.md) "Versions and change log".

Versions follow [Semantic Versioning](https://semver.org/). The repo version names the release; an app's version changes only in a release that changes that app.

## Unreleased

### Changes

- web: the BFF moved from `/bff/v1` to `/api/v1`; `/bff/v1` is removed with no alias or redirect.

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

- Tag-driven release ([ADR 0016](docs/adr/0016-tag-driven-release-ci.md)): images are built and pushed only by a repo tag `v<x.y.z>` made by the `release-tag` skill, and tagged with the app version (`APP_IMAGE_TAG` changes from `main-<sha7>` to `<x.y.z>`); the deploy repo `staging` branch is no longer bumped by CI. Patch notes: [cms-api](docs/apps/cms-api/patch-cms-api-0.0.2.md), [cms-admin](docs/apps/cms-admin/patch-cms-admin-0.0.2.md), [web](docs/apps/web/patch-web-0.0.2.md).
- cms-api integration tests (Testcontainers) moved out of the Checks job into their own job that runs only on `v<x.y.z>` tags and gates the cms-api publish.
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

- Content engine: content types as JSON schemas (root plus up to 3 component levels), generated and reviewed SQL migrations in schema `content`, the type registry ([content-modeling](docs/flows/content-modeling/SPEC.md)).
- Documents REST API: list with filter, sort and paging, read, create, draft save with a version check and a masked `409` diff, publish and unpublish, bulk actions on collections, presence ([content-editing](docs/flows/content-editing/SPEC.md)).
- Read-only GraphQL API over published document reads, with the same authorization and masking as REST ([public-site](docs/flows/public-site/SPEC.md)).
- Access control: system and custom roles with a rank rule, field-level permissions with `***` masking, conditions, API tokens limited to the creator's current permissions ([access-admin](docs/flows/access-admin/SPEC.md)).
- Identity: sign-in with refresh token rotation and reuse detection, two-factor by TOTP or email code, invitations, password reset and change, one-time owner setup page and CLI ([sign-in](docs/flows/sign-in/SPEC.md), [password](docs/flows/password/SPEC.md), [two-factor-setup](docs/flows/two-factor-setup/SPEC.md), [owner-setup](docs/flows/owner-setup/SPEC.md)).
- Media library: upload with magic-byte checks and image re-encoding, replace in place, alt text, delete while unreferenced, purge job; stored file names `<stem>_<hash8>.<ext>` ([media](docs/flows/media/SPEC.md)).
- Reviewer sessions: self-service 24 h read-only sessions behind a Turnstile check, the owner switch and session log, the deploy switch `REVIEWER_FEATURE_ENABLED` ([reviewer](docs/flows/reviewer/SPEC.md)).
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

- cms-api: a rejected upload answered 502 or lost its 403; the Node `requestTimeout` is 5 min and rejected uploads close cleanly.
- cms-admin, form-commons: uploads were cut by the 10 s client timeout, the progress bar showed 100 % too early, long file names lost their extension, `MediaInput` had no frame.
- cms-api, cms-admin, e2e: refresh races across browser tabs signed users out.
- cms-api: updating an expired API token is refused; create permissions with conditions count as not granted; the purge keeps deleted media of another storage provider; document reads include the media `sha256`.
- cms-admin: Zod runs jitless so its eval probe breaks no CSP; backup status loads on demand; focus returns to the trigger after a dialog closes; the collection table stays inside its card at 375 px; emoji stay whole in avatar initials.
- web: masked CV fields show "Hidden" for reviewers.

### DevOps patches

Apply these to the deploy repo for this release (staging first, then production):

- [docs/apps/cms-api/patch-cms-api-0.0.1.md](docs/apps/cms-api/patch-cms-api-0.0.1.md): port key, `/api` on the bare domain, the reviewer switch key, removed keys, rollout order.
- [docs/apps/web/patch-web-0.0.1.md](docs/apps/web/patch-web-0.0.1.md): port key, image and overlay names, TCP probes, template keys.
- [docs/flows/media/patch-media-0.0.1.md](docs/flows/media/patch-media-0.0.1.md): Traefik read timeout, the `api-upload` route and its two middlewares.
