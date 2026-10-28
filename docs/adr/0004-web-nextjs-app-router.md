# ADR 0004: apps/web on Next.js 16 (App Router, standalone Node)

- Status: accepted (user answers Q-W1..Q-W9, 2026-10-21; Q-W10 default)
- Date: 2026-10-21

## Context

`apps/web` was a React 19 + Vite SPA behind nginx (T04 skeleton). The public
CV page must show content in the first HTML response, must never ship a masked
value to an anonymous visitor, and fetches its data through GraphQL (ADR 0003).
A client-only SPA cannot do that, so the web app moves to server rendering.

## Decision

- **Q-W1 App Router.** Server Components by default. A file is `'use client'`
  only for state, effects, handlers, browser APIs, TanStack Query,
  react-hook-form or any `@abyss/form-commons` import.
- **Q-W2 `output: 'standalone'`**, run by Node as the non-root `node` user.
  No nginx for web. The image listens on `WEB_PORT` (default 8080).
- **Q-W3 Server data** is fetched anonymously from `API_INTERNAL_URL` with a
  data cache of `WEB_REVALIDATE_SECONDS` (60 s production, 0 smoke). The Next
  server never sees a user token; authenticated calls stay in the browser
  (Bearer from memory, D14).
- **Q-W4 CSP** with a per-request nonce comes from `src/proxy.ts` (T36), with
  `style-src-attr 'unsafe-inline'`. Not built in T30a.
- **Q-W5 No Redux on web**: React context + TanStack Query.
- **Q-W6 DOMPurify** on the server and the client for richtext (T30).
- **Q-W7 Dependencies**: `next` (pinned 16.4.2, at or above 16.2.5 for
  CVE-2026-44581), `server-only`, `@tailwindcss/postcss`,
  `@next/eslint-plugin-next`, `dompurify`, `jsdom` (runtime); `graphql` as a
  devDependency for the SDL contract test. `vite` and `@tailwindcss/vite`
  are removed; `vitest` and `@vitejs/plugin-react` stay for unit tests.
  `NEXT_TELEMETRY_DISABLED=1` in the image.
- **Q-W8** Next's default trailing-slash handling (308 to the slashless path,
  with a relative `Location`).
- **Q-W9** Only web-side files add `'use client'`; form-commons is unchanged.
- **Q-W10** The ui-builder owns the smoke stack files (T30b) with explicit
  approval at dispatch.

## Consequences

- `src/config/env.ts` is split: `env.client.ts` (`NEXT_PUBLIC_*`, baked in at
  build, a missing key fails the build) and `env.server.ts` (`server-only`,
  read at runtime; an invalid value exits the process at start).
- `docker-compose.smoke.yml` and `scripts/smoke.sh` still describe the nginx
  SPA and the `VITE_API_BASE_URL` build arg until T30b.
- Async Server Components and SSR output are tested with Playwright against the
  container; Vitest covers client components, sync components and pure modules.
- The standalone trace needs `outputFileTracingRoot` at the monorepo root so
  workspace packages are copied into the image.
