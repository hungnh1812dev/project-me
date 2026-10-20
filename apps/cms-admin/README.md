# @abyss/cms-admin

Admin console. React 19 + Vite, served by nginx at `admin.<domain>`; it calls the API cross-origin (CORS with credentials, `ADMIN_ORIGIN` in cms-api).

For now the app is a skeleton: one status page that calls
`GET /api/v1/health/live` and renders a status card built with
`@abyss/form-commons`.

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/cms-admin dev       # http://localhost:5173 (DEV_SERVER_PORT)
```

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
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=... -t abyss-cms-admin .
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
