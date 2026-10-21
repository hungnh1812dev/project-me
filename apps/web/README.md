# @abyss/web

Public site. Next.js 16 (App Router) with React 19, run by Node in its own
container behind Traefik at `<domain>`; the API lives on the same origin under
`/api`. Decisions: [ADR 0004](../../docs/adr/0004-web-nextjs-app-router.md).

For now the app is a skeleton: one status page that calls
`GET /api/v1/health/live` from the browser and renders a status card built with
`@abyss/form-commons`.

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/web dev       # http://localhost:5174
```

The dev port is `DEV_SERVER_PORT` from the shell environment (default 5174; a
`.env.local` value is loaded too late to set it). In dev, `next.config.ts`
forwards `/api` to `DEV_API_PROXY_TARGET` (a local cms-api) unchanged, like
Traefik does in production. That rewrite exists only for the dev server, never
in a production build.

`@abyss/form-commons` is consumed from its `dist/`, so build it once first
(`pnpm build` at the root does this through Turborepo's `^build`).

## Server and client code

- Server Components are the default. A file gets `'use client'` only for state,
  effects, handlers, browser APIs, TanStack Query, react-hook-form or any
  `@abyss/form-commons` import (form-commons has no `'use client'` directive,
  so import it only from client components).
- Code that reads server env or calls `API_INTERNAL_URL` imports `server-only`.
- The Next server never sends, receives or stores a user token. No Server
  Actions, Route Handlers or `cookies()` for auth: the browser calls the API
  with a Bearer token held in memory.

## Config

- `src/config/env.client.ts` reads `NEXT_PUBLIC_*` keys. They are inlined into
  the browser bundle at build time (so they are public, never secrets) and a
  missing `NEXT_PUBLIC_API_BASE_URL` fails the build.
- `src/config/env.server.ts` (`server-only`) reads `API_INTERNAL_URL` and
  `WEB_REVALIDATE_SECONDS` at runtime. An invalid value stops the server at
  start (`src/instrumentation.ts`). It is not run during `next build`.
- Every key is documented in [`.env.example`](.env.example).
- `src/config/endpoints.ts` is the single map of API paths.
- `src/config/copy.constants.ts` holds user-facing text until an i18n module
  exists.
- `src/lib/api-client.ts` is the browser Axios instance. It strips trailing
  slashes from every request path (SPEC §6), so no proxy can answer with a
  redirect.

Styling: Tailwind v4 through `@tailwindcss/postcss` with the form-commons theme
(`src/app/app.css`, imported by `src/app/layout.tsx`). Components use semantic
tokens only (`bg-card`, `text-muted-foreground`).

## Docker

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=/api/v1 -t abyss-web .
docker run -e API_INTERNAL_URL=http://cms-api:3000/api/v1 -p 8080:8080 abyss-web
```

Multi-stage: `turbo prune`, a frozen install, `turbo run build`, then the
standalone server (`.next/standalone`, `.next/static`, `public/`) on Node as
the non-root `node` user. The build fails without `NEXT_PUBLIC_API_BASE_URL`.
Runtime env: `API_INTERNAL_URL`, `WEB_REVALIDATE_SECONDS`, `WEB_PORT` (default
8080). `HEALTHCHECK` requests `/`. Telemetry is off (`NEXT_TELEMETRY_DISABLED=1`).

## Scripts

| Script      | What it does                                                                        |
| ----------- | ----------------------------------------------------------------------------------- |
| `dev`       | Next dev server (Turbopack)                                                         |
| `build`     | Production build into `.next/` (standalone output)                                  |
| `start`     | Next production server on `WEB_PORT`                                                |
| `test`      | Vitest + Testing Library (jsdom)                                                    |
| `lint`      | Oxlint (react, jsx-a11y, vitest) then ESLint (typescript-eslint, react-hooks, Next) |
| `typecheck` | `next typegen`, then `tsc --noEmit`                                                 |
