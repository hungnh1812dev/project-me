# cv-print
Done: 2026-11-23 · Commits: 6f40009f..d5435d40 · Apps / packages: cms-api, web, e2e, form-commons (none changed)

## Overview
A visitor prints, or saves as PDF, the CV on `/cv/<documentId>` from one button. The print matches the reference CV on A4 with no browser header or footer, and the screen layout is unchanged. The print label comes from a new optional `print` field on `cv-common-text`.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Print label field | Optional `print` text field on `cv-common-text` (migration 0020, additive) | CVP-1 |
| Print button | One secondary button, top right of the CV header band, shown only with a label, hidden in print | CVP-2 |
| Print layout | A4 print of the CV matching the reference; no site chrome in print | CVP-3 |
| Print e2e | Print CV e2e spec with PDF checks | CVP-e2e |

## Structure
- `apps/cms-api/content/`: `migrations/0020_cv_common_text_print.sql` (new), `migrations/snapshot.json`, `schema.graphql`, `schemas/cv-common-text.json`
- `apps/web/src/views/cv/`: `PageCv.client.tsx`, `PageCv.graphql.ts` (changed), `PageCv.client.test.tsx`, `PageCv.graphql.test.ts` (changed tests)
- `apps/web/src/apis/server/graphql/mocks/`: `PageCv.mock.ts`
- `apps/web/src/assets/styles/`: `app.css` (print `@page` rules)
- `apps/e2e/`: `src/CvPrint.fixture.ts` (new), `src/PdfTools.client.ts` (new), `tests/CvPrint.e2e.spec.ts` (new), `eslint.config.mjs`
- Root: `.dockerignore`, `.gitignore` (reference CV PDFs ignored), `CHANGELOG.md`, `SPEC.md`
- Docs: `docs/flows/public-site/`, `docs/apps/web/SPEC.md`, `docs/modules/` (`content-schema.md`, `web/views-cv.md`, `e2e/src.md`, `MODULES.md`)

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
None (major issues). The CVP-A security finding (reference CV PDFs in `apps/web/public` at risk of being committed) was fixed in a2e395a1 and its record is not kept in `resolved/`.
