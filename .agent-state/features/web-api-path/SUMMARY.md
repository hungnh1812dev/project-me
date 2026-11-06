# web-api-path
Done: 2026-11-06 · Commits: c2bdd002..dc61b7d9 · Apps / packages: apps/web, apps/e2e, scripts/smoke, docker-compose.smoke.yml (comments), docs/deployments/traefik.md, docs/modules/web, docs/apps/web, docs/flows (public-site, sign-in), docs/global, docs/adr/0018, CHANGELOG.md

## Overview
The public site's BFF moved from `/bff/v1/*` to `/api/v1/*` on the web origin. This was a pure rename with no behaviour change: all BFF endpoints answer as before, `/bff/v1/*` answers 404 with no redirect, and every code, test and doc reference names the new path. ADR 0018 was amended in place and marked implemented.

## Sub-features
- BFF path `/api/v1` (WAP-1 to WAP-4): spec, rules and ADR 0018 renamed; web serves the BFF on `/api/v1`; e2e specs follow it and check the 404 on `/bff/v1`; smoke routing and compose comments follow it.

## Structure
- `apps/web/src/app/api/v1/` (route folders renamed from `bff/v1`), `apps/web/src/apis/server/bff/` (internal names kept), proxy matcher and static headers in `apps/web`.
- `apps/e2e/tests` (BFF path and 404 checks), `scripts/smoke/routing.sh`, `scripts/dev-stack.sh` (blank `NEXT_PUBLIC_ADMIN_URL` for web).
- Docs: `docs/flows/public-site`, `docs/flows/sign-in`, `docs/global` (reference and SPEC index), `docs/apps/web`, `docs/modules/web`, `docs/adr/0018-web-bff.md`, `docs/deployments/traefik.md`, `CHANGELOG.md`.

## Major issues
- WAP-A-qc#1: the dev stack left `NEXT_PUBLIC_ADMIN_URL` set for web, so the WebSession spec failed; fixed in b6eab783 (dev-stack blanks it), re-checked at tier 2.
