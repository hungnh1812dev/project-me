# Health live and ready routes

Done: 2026-11-24 · Commits: b2b503af..373b6ab0 · Apps / packages: cms-api, web, cms-admin, e2e, smoke stack, deploy docs

## Overview
Every app serves `/health`, `/health/live` and `/health/ready`. Only `/health` is public; the proxy answers the other two with 403. The cms-admin status card reads cms-api's public `/health`. Deploy docs, probes and the smoke stack follow the new routes.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| cms-api health answers | `no-store` on every health answer; `/health/other` stays 404 | HLR-1 |
| Web health routes | `/health/live` and `/health/ready` (cms-api check, 2 s timeout) | HLR-2 |
| cms-admin health routes | nginx serves `/health`, `/health/live`, `/health/ready`; refuses to start without `APP_API_ORIGIN` | HLR-3 |
| Admin status card | reads cms-api's public `/health` | HLR-4 |
| Smoke stack and proxy | proxy 403 for the in-cluster routes; checks run inside the network | HLR-5 |
| Deploy and reference docs | probes, routes, `APP_API_ORIGIN`, in-cluster checks | HLR-6 |
| Patch notes and change log | web and cms-admin 0.5.0 notes, cms-api note amended, CHANGELOG | HLR-7 |
| e2e on the new answers | HealthRoutes, UptimeCheck, StatusCard specs | HLR-8 |

## Structure
```
apps/cms-api/        src/modules/health/http, test/integration, README.md
apps/web/            src/app/health/{live,ready}, src/features/status, src/apis/server/restful,
                     src/configs, src/proxy.ts (+ tests), README.md
apps/cms-admin/      nginx.conf, nginx/ (entrypoint script, template), Dockerfile, .env.example,
                     README.md, src/features/status, src/views/status, src/configs, src/app, test
apps/e2e/            src/Api.endpoints.ts, tests/{HealthRoutes,StatusCard,UptimeCheck}.e2e.spec.ts
root                 docker-compose.smoke.yml, scripts/smoke.sh, scripts/e2e-spec.sh,
                     scripts/smoke/{cors,routing,security-headers}.sh, CHANGELOG.md
docs/deployments/    backups, configmaps, database, kubernetes, release, traefik, web
docs/global/reference/  api-contract, canonical-values
docs/guidelines/     local-run.md
docs/modules/        cms-admin/status, cms-api/health, web/apis-server, web/status
docs/apps/           cms-admin, cms-api, web patch-*-0.5.0.md
```

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| HLR-A-qc#1: web proxy matcher rejected by Next.js (critical) | The proxy matcher used a capturing group; Next.js 16 rejects it | `next dev` for apps/web exited 1 and `pnpm dev:stack` aborted; no tier 2 row could run | Unit tests built a plain RegExp and never parsed the matcher with Next's validation | Non-capturing alternation, plus a test running the matcher through Next's getMiddlewareMatchers |
