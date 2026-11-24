# uptime-check
Done: 2026-11-24 · Commits: 97e7b891..08775873 · Apps / packages: apps/web, apps/e2e, docker-compose.smoke.yml, scripts

## Overview
Adds GET/HEAD `/health` on the web server, answering `200 {"status":"ok"}` from the web server alone, outside the nonce CSP, so an external uptime check (OneShield) can reach it. The image health check and the smoke and compose checks use the same route. Kubernetes probes stay TCP.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Health route | GET and HEAD `/health` from the web server, outside the nonce CSP; image `HEALTHCHECK` points at it | UC-1 |
| Smoke and compose check | Smoke stack checks `/health` through the proxy; compose health check points at it | UC-2 |
| e2e coverage | e2e spec for the `/health` route on the public-site flow | UC-3 |

## Structure
- apps/web: `Dockerfile`, `README.md`
- apps/web/src/app/health: `route.ts`, `route.test.ts`
- apps/web/src/features/status: `Health.server.ts`, `Health.server.test.ts`
- apps/web/src/configs: `Api.endpoints.ts`
- apps/web/src: `proxy.ts`, `proxy.test.ts`
- apps/e2e/tests: `UptimeCheck.e2e.spec.ts`
- scripts: `smoke.sh`, `smoke/routing.sh`
- docker-compose.smoke.yml
- docs: `deployments/web.md`, `flows/public-site/FLOW.md`, `flows/public-site/SPEC.md`, `modules/web/status.md`
- CHANGELOG.md

## Major issues
None
