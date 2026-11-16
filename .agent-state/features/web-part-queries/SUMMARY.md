# Summary - web-part-queries

## Overview
- Each part of the public site (header, sign-in, not-found text) now loads from its own query, and site-shell is gone.
- The module status shows on `/` and `/status`, from the `moduleStatus` content type.
- The CV page `/cv` is built from `page-cv-a` and `profile`. Educations are a repeatable list. Contact fields and the experience company are masked.
- The public-site content types were reshaped (migration 0014 dropped 7 old types). `page-cv-a` was added (0013). Error fields were dropped from `siteText` (0012).
- Smoke and dev stacks and the e2e suite now use the new content types and pages.

## Structure
- `apps/cms-api`: 25 files (content schemas, migrations 0012 to 0014, GraphQL schema, snapshot)
- `apps/web`: 105 files (site header and sign-in queries, status page, CV page, not-found rule)
- `apps/e2e`: 36 files (suite pointed at the new types and pages, CV educations and content types covered)
- `scripts`: demo, dev-stack, lib and smoke seeding
- `docs`: apps, flows, global, guidelines and 14 module docs
- `CHANGELOG.md`: 1 file

## Commits
Head: e2270ac4
- 22a6f859 feat(cms-api): drop the error fields from the siteText type
- 4561f7e8 feat(web): add SiteHeader, SignIn and NotFoundPage queries with mocks
- 4e1689a2 feat(web): render each part from its own query
- f625548c feat(scripts): seed the smoke stack from the header, sign-in and not-found mocks
- fd485319 fix(web): load the not-found text only on not-found renders
- eec248d5 fix(scripts): pin the Turnstile keys on the dev stack web start
- 31a087d9 docs(web): add the not-found pages rule
- 7af0e547 feat(cms-api): add the page-cv-a content type
- c63c215e feat(cms-api): reshape the content types of the public site
- 23c6a381 feat(web): read the header, sign-in and not-found text from header and module-auth
- 0b207ca2 feat(web): show the module status on / and /status
- 79eded8b feat(web): build the CV page from page-cv-a and profile
- 1996fee0 feat(cms-api,web): make CV educations a repeatable list
- 1e6d6863 chore(scripts): seed the smoke and dev stacks from the new content types
- b02fe032 test(e2e): point the suite at the new content types and pages
- 05b16536 docs(cms-api): fix stale names and the 0014 profile note
- c55c0f12 docs(web): update the content type names in the README
- e2270ac4 test(e2e): cover CV educations and the new content types

## Major issues
None. No critical or high finding was recorded in `resolved/`.
