# header-nav
Done: 2026-11-19 · Commits: fbba896cb805076ada6327f93ee9b9a3b999b200..51a6bb0f · Apps / packages: apps/web, apps/e2e, docs, CHANGELOG.md

## Overview
The public site header shows every stored entry and sub entry to every visitor, signed in or not. Sub lists open by hover, focus and tap; an entry with sub entries and no safe link is a label that opens its list.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Every entry for every visitor | Header ignores `requiresRole`; all stored entries show | HN-1 |
| Sub lists on hover, focus and touch | Hover, focus and tap open lists; first tap on touch opens, second follows; label entries | HN-2 |
| Header e2e coverage | Header spec for every visitor and touch sub lists | HN-e2e |
| Changelog | Web item under Unreleased | DR1 |

## Structure
```
CHANGELOG.md
apps/
  e2e/tests/SiteHeaderNav.e2e.spec.ts
  web/src/
    apis/server/graphql/mocks/SiteHeader.mock.ts
    components/layouts/SiteHeader.test.tsx
    components/layouts/SiteNav.test.tsx
    components/layouts/SiteNav.tsx
    features/site-header/SiteHeader.graphql.test.ts
    features/site-header/SiteHeader.graphql.ts
docs/modules/web/site-header.md
```

## Major issues
None
