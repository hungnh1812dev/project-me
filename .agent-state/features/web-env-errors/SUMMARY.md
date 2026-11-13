# web-env-errors
Done: 2026-11-13 · Commits: be7d545e..834e7df0 · Apps / packages: apps/web, .github, scripts, docs, CHANGELOG.md

## Overview
Every web API failure is now one `WebApiError` logged by one logger, and BFF answers are unchanged. `APP_ENV` (`development | staging | production`) is the single switch for the mocks: they fill only failed GraphQL content root fields, never cached, and a production build holds no mock. The production GitHub Environment refuses a web build unless `APP_ENV=production`.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| One API error shape | `WebApiError` with closed code lists, one `logApiError` logger; server, BFF and browser client raise it | WEE-1, WEE-2, WEE-3, WEE-4 |
| APP_ENV switch | Read at build (inlined) and at runtime (must match); `ALLOW_MOCK_FALLBACK` removed | WEE-5, WEE-7, WEE-8 |
| GraphQL mock fallback | Mocks chosen by key, filled per failed root field, dynamic import, never cached | WEE-6 |
| Production guard | Build script refuses a web build in production unless `APP_ENV=production` | WEE-9 |
| Doc and checklist fixes | Smoke seed header comment corrected | WEE-10 |

## Structure
Changed paths from `git diff --name-only be7d545e..834e7df0`, grouped by app/package:
- apps/web/src: apis (client, server/bff, server/graphql with mocks, server/restful with mocks), app (api routes, cv), components/layouts, configs, features (auth, cv, session, site-shell, status), views (cv, status); apps/web/turbo.json, apps/web/Dockerfile
- .github: scripts, workflows
- scripts: smoke (content seeding), build-args
- Root: docker-compose.smoke.yml, turbo.json, CHANGELOG.md
- docs: apps/web, deployments, global/reference, guidelines, modules/web

Commits: `be7d545e..834e7df0`, head `834e7df0`

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| WEE-C-qc-1: web typecheck and build fail in CI without APP_ENV | `next.config.ts` throws without APP_ENV; `app-checks.yml` gave web no APP_ENV | Web checks and the build job of every pull request would fail | APP_ENV became mandatory at build but only `_publish.yml` set it; turbo strict env mode would also have hidden it | APP_ENV=development set on the checks, tests and build steps of `app-checks.yml`; `turbo.json` passes APP_ENV |
| WEE-C-qc-2: `next build` throws "APP_ENV is not set" inside Docker | Build failed even with APP_ENV set | Smoke stack, CI image build and every deploy build of web would fail | `apps/web/turbo.json` `build.env` replaced the root env list, so turbo strict env mode filtered APP_ENV out | APP_ENV added to `build.env` in `apps/web/turbo.json` (also a cache-key input) |
| WEE-C-qc-3: `/` throws a TypeError on a stack with no published content | Layout read `header.name` on a null root field | `/` returned 500, web container unhealthy, smoke stack check failed | After the mock fallback moved to errors only, a null root field reached the layout unguarded | `loadSiteShell` returns null on a missing root field; layout renders the brand only |
| WEE-C-qc-4: "No QueryClient set" on the null-shell layout | Null-shell branch rendered pages without Providers | `/` returned 500 and web container unhealthy on a stack with no published content | The first fix for qc-3 left Providers inside the shell-only branch | Providers wraps both branches of RootLayout |
| WEE-C-qc-5: smoke stack shows empty site, `/cv` 500 | Staging smoke stack published no cms-api content; staging no longer falls back to mocks | CWEE-C-5 and C-8 could not pass; every @web spec on the smoke stack failed | Removing the mock fallback on staging left the smoke stack without the content the mocks used to supply | `content` smoke group (`scripts/smoke/content.sh`, `SeedContent.mjs`) creates and publishes the content from the web mocks before web is recreated |
