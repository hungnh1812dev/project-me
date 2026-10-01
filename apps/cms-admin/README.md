# CMS Admin

The admin portal for the CMS, a React 19 + Vite 8 single-page app served by nginx. It talks to `apps/cms-api` through one axios client and enforces the backend's RBAC/ABAC permission model on the client side as defense in depth (the server stays the authority).

Phase 1 (Core Auth) is done: API client with single-flight token refresh, Redux + RTK Query auth state, session bootstrap, RBAC/ABAC engine with hooks and a `<Can>` guard, protected routing, and minimal login, profile, 403, register, OTP and password-reset pages. What comes next is in the [roadmap](./docs/roadmap.md).

## Getting started

```bash
pnpm install                                   # from the repo root
cp apps/cms-admin/.env.example apps/cms-admin/.env.local   # optional, defaults work for local dev
pnpm --filter cms-admin dev                    # :5173, proxies /api and /health to VITE_API_PROXY_TARGET
```

Env vars (`VITE_API_URL`, `VITE_API_PROXY_TARGET`) are documented in [`.env.example`](./.env.example) and [Testing and config](./docs/testing-and-config.md).

## Commands

```bash
pnpm --filter cms-admin test                   # Vitest
pnpm --filter cms-admin test:cov               # Vitest with coverage gates
pnpm --filter cms-admin exec playwright install chromium   # one-time
pnpm --filter cms-admin test:e2e               # Playwright (mocked API, port 5174)
pnpm turbo run lint typecheck build --filter=cms-admin
```

## Docs

Feature docs live in [`docs/`](./docs/README.md), one page per feature, plus the [roadmap](./docs/roadmap.md).
