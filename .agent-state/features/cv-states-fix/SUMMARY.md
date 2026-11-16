# CV states and single-type mocks
Done: 2026-11-16 · Commits: 8e758c97..9000c370 · Apps / packages: cms-api, web, e2e, scripts (smoke stack), docs

## Overview
`/cv` no longer fails for its own content: when the main CV, the profile or the common labels are missing or unreadable, the page shows the right state (the CV without labels, or the no-CV-live state with HTTP 200 and noindex) instead of a 404 or 500. Mocks back the single types (header, sign-in, not-found, status, `/cv`) on dev, and the content type `page-cv-text` is renamed to `cv-common-text`. The web server fetch now runs on three levels: Next.js `fetch`, a RESTful layer, and `executeGraphql` with a per-query mock.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Single-type mocks | A single type that answers null gets its mock on dev and smoke | CSF-1 |
| Common CV text type | `page-cv-text` renamed to `cv-common-text`; migration 0016 drops the old tables, no data carried over | CSF-2 |
| CV labels | `/cv` labels its sections from `cv-common-text`; a missing label is left out | CSF-3 |
| No-CV-live state | `/cv` answers 200 with noindex when there is no CV, never 404 or 500 for its content | CSF-4 |
| Server fetch layers | One RESTful request function; `executeGraphql` with a per-query mock and `resolveData` | CSF-7, CSF-8 |
| Seed and e2e | smoke and dev stacks seed `cv-common-text`; the e2e suite follows it | CSF-5, CSF-6 |
| Header load | The site header loads once per request, a 404 included (ADR 0023) | CSF-9 |
| Checkpoint | Tier 1, tier 2 dev stack and tier 3 scoped run passed | CSF-A |

## Structure
- `apps/cms-api/`: `content/migrations/0016_content.sql`, `snapshot.json`, `schema.graphql`, `test/integration/ContentRepository.integration.spec.ts`
- `apps/web/src/apis/`: `server/restful/` (ServerApi, CmsApi, tests), `server/graphql/` (Graphql, MockFallback, `mocks/MockView.ts`, `mocks/PageCv.mock.ts`, fixtures and tests), `GraphqlResponse.rules*`, `WebApi.errors*`
- `apps/web/src/features/`: `auth/SignIn.*`, `not-found/NotFoundPage.*`, `site-header/SiteHeader.*`, `status/ModuleStatus.*`
- `apps/web/src/views/cv/`: `PageCv.*` (data, graphql, client, tests), `CvSection`, `ContactCard`, `ExperiencesSection`, `EducationsSection`, `ProjectsSection` (and tests)
- `apps/web/src/configs/LastResort.constants.ts`, `apps/web/README.md`
- `apps/e2e/`: `src/Apps.contract.ts`, `src/E2e.constants.ts`, `tests/CvPage.e2e.spec.ts`, `tests/FeatureRegistry.e2e.spec.ts`
- `scripts/`: `smoke.sh`, `smoke/SeedContent.mjs`; `docker-compose.smoke.yml`
- `docs/`: `modules/MODULES.md`, `modules/content-schema.md`, `modules/graphql.md`, `modules/web/` (apis-server, auth, not-found, site-header, status, views-cv), `global/reference/project-structure.md`, `guidelines/local-run.md`
- `CHANGELOG.md`

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| CSF-A-qc-3 | `CvSection.tsx` used `createContext` without `'use client'`, and the server component `PageCv.tsx` imported `Richtext` from it, so every page failed to compile. | `/`, `/cv` and not-found returned 500 on the dev stack and would fail `next build`; unit tests (jsdom) did not show it. | A context-using module was imported by a server component; no build check ran in tests. | Added `'use client'` to `CvSection.tsx` (`Richtext` stays a props-only component usable from the server page); `next build` passes. |
