# CHANGELOG

Every release of the repository, newest first. Each entry gives the repo version, the version of each app and package, the changes (new features, changes, bug fixes) and the DevOps patches the deploy repo must apply for it. How a release is versioned and recorded: [docs/global/FLOW.md](docs/global/FLOW.md) "Versions and change log".

Versions follow [Semantic Versioning](https://semver.org/). The repo version names the release; an app's version changes only in a release that changes that app.

## Unreleased

### DevOps patches

- Tag-driven release ([ADR 0016](docs/adr/0016-tag-driven-release-ci.md)): images are built and pushed only by a repo tag `v<x.y.z>` made by the `release-tag` skill, and tagged with the app version (`APP_IMAGE_TAG` changes from `main-<sha7>` to `<x.y.z>`); the deploy repo `staging` branch is no longer bumped by CI. Patch notes: [cms-api](docs/apps/cms-api/patch-cms-api-0.0.2.md), [cms-admin](docs/apps/cms-admin/patch-cms-admin-0.0.2.md), [web](docs/apps/web/patch-web-0.0.2.md).

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
