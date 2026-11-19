# CV private link
Done: 2026-11-19 · Commits: 841fc76b..73851ce4 · Apps / packages: web, e2e, scripts (smoke, demo seed), docs, CHANGELOG

## Overview
The CV is reachable only by its link, `/cv/<documentId>`. The old `/cv` returns not-found, the header no longer links to it, and crawlers and shared caches are kept away from it. Scope was changed to the web app only on 2026-11-19; the CMS list-closing part was removed and is not built.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Transports | GraphQL variables, route params, BFF_NOT_FOUND | CPL-1 |
| CV page by id | /cv/<documentId> with not-found and no-CV-live states | CPL-2 |
| BFF CV route | GET /api/v1/cv/{documentId}; one not-found answer for every miss | CPL-3 |
| Crawler and cache | noindex, private no-store headers, robots.txt, sitemap leaves /cv out | CPL-4 |
| Smoke seed and docs | page-cv-a smoke seed, changelog | CPL-5 |
| e2e | CV page, BFF route, crawler and cache headers | CPL-e2e-A |

## Structure
- apps/web: `src/app/cv/` (by id, layout, page), `src/app/api/v1/cv/[documentId]/`, `src/views/cv/`, `src/apis/server/bff/` and `graphql/` (errors, mocks), `src/features/crawler-files/`, `src/configs/` (endpoints, security headers), `src/components/layouts/` (header tests), `next.config.ts`, `README.md`
- apps/e2e: `tests/CvPrivateLink.e2e.spec.ts`, `tests/CvPage.e2e.spec.ts`, `tests/CvEducations.e2e.spec.ts`, `src/Api.endpoints.ts`
- scripts: `smoke/SeedContent.mjs`, `lib/demo-seed.sh`
- docs: `adr/0018-web-bff.md`, `modules/web/` (apis-server, crawler-files, site-header, views-cv), `CHANGELOG.md`

## Major issues
None.
