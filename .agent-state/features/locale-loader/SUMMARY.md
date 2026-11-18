# Locale loader
Done: 2026-11-05 · Commits: 2bf141b0..0eac11d2 · Apps / packages: apps/cms-admin, apps/e2e, docs

## Overview
The admin UI's text moved out of the old `copy/` folder into per-screen files under `apps/cms-admin/src/configs/locales/en/`. A screen's text loads by dynamic import when the screen is first visited, through `loadScreenText(screen, locale = 'en')`. Common text (shell, nav, session, password) stays in the first download. Product code may import only `@configs/locales`.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Locale files and loader | Section files in `locales/en/`, loader, preload and hook | LOC-1 |
| Route text boundary | Each route waits for its screens' text; failed load shows retry | LOC-2 |
| Text read in shell, auth, security, reviewer, backups | Reads through COMMON_TEXT or useScreenText | LOC-3 |
| Text read in access, content, media | Same, with error mappers taking the text as a parameter | LOC-4 |
| Text read in every view | Views list their text screens in Views.registry | LOC-5 |
| Import boundary and cleanup | Lint boundary closed, COPY re-export and Copy.constants.ts removed, e2e contract and docs updated | LOC-6 |

## Structure
- apps/cms-admin/src: configs/locales (new: en/ section files, index.ts), components (ScreenTextBoundary), features (access, auth, backups, content, media, reviewer, security), views (all pages and dialogs), app (AppRoutes.setup, App.test), configs/NavSections.constants.ts, apis/client, test/Vitest.setup.ts; `Copy.constants.ts` and `configs/copy/` removed
- apps/cms-admin: eslint.config.mjs, README.md
- apps/e2e: tests/AdminScreenText.e2e.spec.ts (new), tests/Backups.e2e.spec.ts, tests/FeatureRegistry.e2e.spec.ts, src/Apps.contract.ts
- docs: docs/modules/cms-admin/* (auth, components, reviewer, change-password, document-edit, login, media-library, profile, reviewer-sessions, security-settings), docs/modules/admin-navigation.md, docs/global/reference/project-structure.md
- docs/adr/0017-cms-admin-locale-loader.md (git-ignored, local)

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| LOC-C-qc#2 Failed screen chunk loops forever instead of showing retry (high, qc) | a blocked screen text chunk left the page on "Loading the page" and re-requested the chunk in a tight loop. | an admin whose chunk request failed saw a stuck page and the browser was flooded with requests. | the locale cache dropped a rejected promise at once, so each re-render started a new load and suspended again; the rejection never reached the failure boundary. | a rejected load stays cached and the gate throws its reason; the retry button calls retryFailedScreenText before re-rendering (0eac11d2). |
