# header-restructure

## Overview
The site header and the not-found text moved to a new structure (app name, navs, sub navs, module-not-found) without losing stored data. `content:generate --data-step` carries data before destructive statements, migration 0017 maps the old header into the new shape, and the web header and not-found page read the new fields. Base `c7f7c35e`, head `754c4137`.

Commits: 9af6d52a, 11c238aa, 9a87331a, 5fbc2386, 1f54678f, b03484db, e60585b9, fd07e3b0, 61b8d840, 754c4137 (head). ADR 0026 status: implemented.

## Sub-features
- Data-step generation (`content:generate --data-step`): declared data steps run between additive and destructive statements; undeclared destructive changes are refused.
- Migration 0017: header name, sub navigations, CV link and not-found text carried over; out-of-range stored role or skill values stop the migration.
- Web header: reads appName, navs and subNavs; public entries show to every viewer.
- Not-found page: reads moduleNotFound title and description.
- Smoke seed and CHANGELOG Unreleased entry for the header restructure.
- Test updates in cms-api, cms-admin and e2e, plus a cms-admin Prettier pass (DR1).

## Structure
- apps/cms-api: content (schemas, migrations), src (content-engine, content-types), test (integration)
- apps/cms-admin/src: components, features/content, views (formatting and schema tests)
- apps/web/src: features/site-header, features/not-found, app layout, RoleDisplay
- apps/e2e/tests: header and CV e2e specs
- scripts/smoke: seed; docs: ADR 0026 (local, git-ignored), public-site and content-schema module docs; CHANGELOG.md

## Major issues
None recorded.
