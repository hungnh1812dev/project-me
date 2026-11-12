# Summary: web-content-api

Base: 9e7ba9fb9dd648b1f3dd0cf96d0f9dd407b3c123
Commits: 8e866f62 (head; includes ae8f2467, a26cce84, f11ba367, 91bc6786, 1f637988, fe157357, ac6e9ccb, 98886c49, 0bc6e560, f18b837f, f23e12c7)

## Overview
The public site's server reads all content through one RESTful client and the GraphQL layer, with `APP_API_URL` and `APP_API_TOKEN` replacing the old internal URL, a per-call cache, and a mock fallback that is opt-in outside production. Page text (shell, sign-in, status, CV) now comes from cms-api content types; the browser calls the BFF through a five-method client; `/cv` keeps the anonymous CV visible when a signed-in refetch fails. cms-api gained the four text content types (DR2).

## Sub-features
- Server transport and env: `serverApi`, `cmsApiClient`, `APP_API_URL`/`APP_API_TOKEN`, `WEB_REVALIDATE_SECONDS` optional.
- GraphQL content queries with the API token, per-root-field mock fill (fallback on only), visitor queries with no-store.
- Page text: shell text context, sign-in text, status page and CV page text, `formatText`/`pickPlural`.
- Role-aware display (`useCanSee`) and the CV link in the header sub menu.
- Deploy and stack: deploy pages, `patch-web-0.2.0.md`, smoke and dev stacks, token minting for stacks.

## Structure
- apps/web/src (features: cv, status, session, site-shell, server and BFF layers; new error and not-found pages)
- apps/cms-api/content and src (four text content types, migrations 0009 and 0010)
- apps/e2e (web session and richtext specs, access and side menu specs)
- docs/apps/web, docs/flows/public-site, docs/flows/sign-in, docs/modules (web, graphql), docs/deployments (web, secrets, traefik, kubernetes, configmaps)
- scripts (dev-stack, stack-seed, smoke) and docker-compose.smoke.yml

## Resolved issues
| Problem | Impact | Root cause | Fix |
|---|---|---|---|
| feature-security#1: Web API token could be created with an unmasked creator role (high, security-qc) | web would render and cache unmasked referee phone and company on `/cv` for every anonymous visitor and crawler | the deploy docs did not name the `guest` role, the temporary `api_tokens:create` grant steps, or a post-deploy masked-fields check | docs only (SQCI-2): guest-role creator, grant steps and `_maskedFields` check in patch-web-0.2.0.md and secrets.md |
