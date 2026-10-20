# @abyss/web

Public site. React 19 + Vite, served by nginx at `<domain>`; the API lives on the same origin under `/api`.

For now the app is a skeleton: one status page that calls
`GET /api/v1/health/live` and renders a status card built with
`@abyss/form-commons`.

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/web dev       # http://localhost:5174 (DEV_SERVER_PORT)
```

In dev, Vite forwards `/api` to `DEV_API_PROXY_TARGET` (a local cms-api)
unchanged, like Traefik does in production.

`@abyss/form-commons` is consumed from its `dist/`, so build it once first
(`pnpm build` at the root does this through Turborepo's `^build`).

## Config

- `src/config/env.ts` is the only module that reads `import.meta.env`. Every
  key is documented in [`.env.example`](.env.example). `VITE_*` values are
  baked in at build time, so they are public: never put secrets there.
- `src/config/endpoints.ts` is the single map of API paths.
- `src/config/copy.constants.ts` holds user-facing text until an i18n module
  exists.
- `src/lib/api-client.ts` is the Axios instance. It strips trailing slashes
  from every request path (SPEC §6), so no proxy can answer with a redirect.

Styling: Tailwind v4 with the form-commons theme (`src/styles/app.css`).
Components use semantic tokens only (`bg-card`, `text-muted-foreground`).

## Docker

```bash
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=... -t abyss-web .
```

Multi-stage: `turbo prune`, build (form-commons first), then the static files
on `nginx-unprivileged` (non-root, port 8080). `nginx.conf` sets
`absolute_redirect off; port_in_redirect off;` so nginx never redirects to its
internal host or port behind Traefik, and falls back to `index.html` for client
routes. The build fails without `VITE_API_BASE_URL`.

## Scripts

| Script      | What it does                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `dev`       | Vite dev server                                                               |
| `build`     | Production bundle in `dist/`                                                  |
| `test`      | Vitest + Testing Library (jsdom)                                              |
| `lint`      | Oxlint (react, jsx-a11y, vitest) then ESLint (typescript-eslint, react-hooks) |
| `typecheck` | `tsc --noEmit`                                                                |
