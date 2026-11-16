# Crawler files
Done: 2026-11-16 · Commits: 70c8368d..e6aa3e34 · Apps / packages: apps/web, apps/cms-admin, apps/e2e

## Overview
The public site answers `/robots.txt`, `/sitemap.xml` and `/favicon.ico` itself, and the admin host answers a `robots.txt` that disallows every crawler. Production allows `/` and disallows `/api/`; other environments disallow everything.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Favicon | "A" letter-mark favicon at `/favicon.ico` | CRF-1 (959abdb1) |
| Robots and sitemap | Per-request `robots.txt` and `sitemap.xml` on the public site | CRF-2 (d93d4049) |
| Admin robots | cms-admin `robots.txt` disallowing every crawler | CRF-3 (84934940) |
| CMS admin test repair | Test fix after the cv-page schema rename (direct request) | DR1 (35898b95) |
| E2E coverage | Scoped e2e spec for the three files and the admin host | CRF-A (e6aa3e34) |

## Structure
- `apps/web/`: `README.md`, `next.config.ts` (changed); `public/favicon.ico` (new), `public/.gitkeep` (removed); `src/app/robots.ts`, `src/app/sitemap.ts` (new); `src/configs/Api.endpoints.ts`, `src/configs/Http.constants.ts`, `src/proxy.ts`, `src/proxy.test.ts` (changed); `src/features/crawler-files/` (new: `CrawlerFiles.server.ts`, `CrawlerFiles.server.test.ts`)
- `apps/cms-admin/`: `README.md` (changed); `public/robots.txt` (new); `src/features/content/` tests, `src/views/document-edit/DocumentEditPage.test.tsx`, `src/views/schema-builder/SchemaJson.rules.test.ts`, `test/CvPage.fixture.ts` (changed)
- `apps/e2e/`: `tests/CrawlerFiles.e2e.spec.ts` (new)
- `docs/`: `flows/public-site/FLOW.md`, `modules/MODULES.md` (changed); `modules/web/crawler-files.md` (new)

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
None
