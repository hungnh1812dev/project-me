# Feature health-routes - summary

Base: 08775873112cc2da0462ca2887a4181b75a74ff0
Commits: 18f1b424 (head)

## Overview

cms-api now serves its health probes at the root (`/health`, `/health/live`, `/health/ready`); `/api/v1/health/*` returns 404. The admin host routes the root paths to cms-api, and the cms-admin status card, the web BFF health, the dev and smoke stacks, the deploy docs and the e2e tests use the new paths. The web BFF's own `GET /api/v1/health` and the web `/health` are unchanged.

## Built

- HRT-1: cms-api serves the health probes at its root; `/api/v1/health/*` now 404.
- HRT-2: dev and smoke stacks, the compose check and the admin-host api route use the root health paths; `/healthz` still reaches the admin SPA.
- HRT-3: cms-admin status card reads `/health/live` on the cms-api origin.
- HRT-4: web BFF health reads cms-api `/health/live` on the `APP_API_URL` origin.
- HRT-5: deploy docs, the cms-api 0.5.0 patch note and the change log use the root health paths.
- HRT-6: e2e on the root health paths (status card spec, HealthRoutes spec).

## Structure (changed folders)

- apps/cms-api: src, src/modules/health/http, test/integration
- apps/cms-admin: src, src/app, src/configs, src/features/status, src/views/status, test
- apps/web: src/apis/server/restful, src/configs
- apps/e2e: src, tests
- docker-compose.smoke.yml, scripts, scripts/smoke
- docs: docs/apps/cms-api, docs/deployments, docs/global, docs/global/reference, docs/guidelines, docs/modules/cms-admin, docs/modules/cms-api, docs/modules/web
- CHANGELOG.md

## Issues

None. Resolved issues: none (no findings file or resolved record).

## Open items

- Q-HRT3: launch-gate REPLAN of its old health path strings (DB-7, CLG-37, CLG-67, LG-api-1 step 4, CLG-45) and ADR 0012 lines 101 and 231 (`GET /api/v1/health/ready`); after this feature, before launch-gate resumes (features.md Follow-ups).
