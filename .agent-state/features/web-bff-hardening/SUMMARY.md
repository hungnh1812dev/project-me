# web-bff-hardening
Done: 2026-11-05 · Commits: 4f21466..a647ead8 · Apps / packages: apps/web, apps/cms-admin, apps/e2e, apps/cms-api (no code change), docker-compose.smoke.yml, scripts/, .github, docs/deployments, docs/apps patch notes, CHANGELOG.md

## Overview
The web app now talks to cms-api only through its own `/bff/v1` routes. Sign-in, two-factor, sign-out, session, health and CV go through the BFF, with Turnstile on both 2FA steps and sealed cookies. The home page shows only the service status, the CV is on `/cv`, and cms-api is reachable only on the admin host.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| BFF pipeline | One fixed pipeline for every BFF route: origin, content type, body cap, per-IP rate limit, strict body, human check, no-store; fixed-message errors | WBH-1 |
| cms-api client and human check | Client for cms-api auth and health; Turnstile check that fails closed; production guard for the test secret | WBH-2 |
| Sealed session cookies | AES-256-GCM `__Host-` session and 2FA cookies; shared refresh; privileged accounts refused | WBH-3 |
| BFF auth and health/CV routes | Sign-in, 2FA, sign-out, session, health, CV routes under `/bff/v1`; only id, email, displayName, role leave the server | WBH-4, WBH-5 |
| Browser on the BFF | Browser session and sign-in use `/bff/v1`; no token in the browser; Turnstile in the login dialog; web reviewer removed | WBH-6, WBH-7 |
| Status view and CV page | `/` shows the status only; `/cv` with a header link; `/status` removed | WBH-8 |
| Build and headers | No cms-api URL in the web build; CSP, COOP, Permissions-Policy, X-Frame-Options; cms-admin dev proxy | WBH-9 |
| Stacks and deploy | Smoke and dev stacks serve cms-api on the admin host only; CI build args; deploy docs, patch notes, change log | WBH-10, WBH-11 |
| Fix rounds | Admin `/api` route on the whole segment; BFF 405 with `Allow`; static CSP on unmatched `/bff` paths; route-test fix | WBH-B fix, WBH-D-qc#1, WBH-D-qc#2, WBH-D-security#1 |

## Structure
Counts from `git diff --name-only 4f21466..a647ead8` (767 paths; the range includes commits of features that interleave with this one):
- apps/web/src: 106 files (BFF routes, cookies, pipeline, status view, CV page, CSP config)
- apps/cms-admin/src: 174 files (dev proxy, env example; most are other features)
- apps/cms-api/src and test: 128 files (other features; this feature changed no cms-api code)
- apps/e2e/tests and src: 45 files (web specs rewritten for the BFF, specs moved to `/cv`)
- packages/form-commons/src: 29 files (other features)
- docker-compose.smoke.yml, scripts/smoke*, scripts/dev-stack.sh, .github: stack routing, smoke checks, CI build args
- docs/deployments, docs/guidelines/local-run.md, docs/apps/{web,cms-api,cms-admin}/patch-*-0.1.0.md, docs/modules, CHANGELOG.md: deploy contract, guides, patch notes

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| Admin `/api` router swallowed `/api-tokens` (qc WBH-D-qc#1, high) | The admin-host `api` router used `PathPrefix(/api)`, which also matched the admin SPA route `/api-tokens`; a reload or deep link got a cms-api 404. Four e2e specs failed. | Admin users reloading `/api-tokens`; the same rule was in the documented deploy example. | Prefix match on characters, not on the path segment. | `PathRegexp(^/api(/|$))` in docker-compose.smoke.yml and docs/deployments/traefik.md, smoke check for `/api-tokens` (committed ab94efe9). |
