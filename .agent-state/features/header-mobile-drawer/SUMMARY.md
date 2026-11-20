# header-mobile-drawer
Done: 2026-11-19 · Commits: 51a6bb0f..841fc76b · Apps / packages: apps/web, apps/e2e

## Overview
Below the `md` width the site header shows the app name, the account menu and a menu button; the navigation entries open in a side drawer. At `md` and wider the header is unchanged.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Side drawer for phones | Menu button and right-side drawer listing the header entries and their sub entries, with the same show and safe-link rules as the bar | HMD-1 |
| Header bar on phones | Below `md` the bar shows only the app name, account menu and menu button; `md` and wider unchanged | HMD-2 |
| e2e coverage | Drawer flow on a phone viewport; header touch case moved to a tablet width | HMD-e2e |

## Structure
- `apps/web/src/components/layouts/`: `MobileNavDrawer.tsx`, `MobileNavDrawer.test.tsx` (new); `SiteHeader.tsx`, `SiteHeader.test.tsx`, `SiteNav.tsx` (changed)
- `apps/web/src/configs/`: `LastResort.constants.ts` (changed)
- `apps/e2e/tests/`: `MobileNavDrawer.e2e.spec.ts` (new); `SiteHeaderNav.e2e.spec.ts` (changed)
- `docs/modules/web/`: `site-header.md` (changed)

## Major issues
None
