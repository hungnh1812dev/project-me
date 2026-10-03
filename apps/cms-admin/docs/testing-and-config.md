# Testing and config

Tooling and runtime config for `apps/cms-admin`: unit and e2e test setup, coverage gates, the `@/` alias, API env vars, the dev proxy and the Content-Security-Policy.

## Scripts

| Command                                                    | What it does                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter cms-admin test`                             | `vitest run`: all unit and integration tests, once            |
| `pnpm --filter cms-admin test:watch`                       | `vitest` in watch mode                                        |
| `pnpm --filter cms-admin test:cov`                         | `vitest run --coverage`, fails when a coverage gate is missed |
| `pnpm --filter cms-admin exec playwright install chromium` | One-time browser download for e2e                             |
| `pnpm --filter cms-admin test:e2e`                         | `playwright test`: both projects (`chromium` and `csp`)       |
| `pnpm --filter cms-admin test:e2e --project=csp`           | Only the CSP check against the built app on port 5175         |
| `pnpm turbo run lint typecheck build --filter=cms-admin`   | oxlint, `tsc -b` and the production build                     |

## Unit tests (Vitest)

- Config: `vitest.config.ts`. Environment `jsdom`, setup file `src/test/setup.ts`.
- Tests sit next to their source as `src/**/*.test.ts(x)`. Import `describe`, `it`, `expect` and `vi` from `vitest` (no globals).
- `src/test/setup.ts` registers the jest-dom matchers (`@testing-library/jest-dom/vitest`), runs RTL `cleanup` after each test, and starts, resets and closes the MSW server.
- Components: React Testing Library plus `@testing-library/user-event`.

### MSW conventions

- The node server lives in `src/test/msw/server.ts`. Shared default handlers are in `src/test/msw/handlers.ts`.
- The server runs with `onUnhandledRequest: 'error'`, so any request without a handler fails the test. No unit test reaches a real backend.
- Override per test with `server.use(http.get(url, () => HttpResponse.json(...)))`. Overrides are reset after each test.
- `src/test/smoke.test.ts` proves that MSW intercepts axios requests in jsdom (the XHR adapter), so no fetch-adapter fallback is needed.

## Coverage gates

`test:cov` uses the v8 provider. Coverage includes `src/**/*.{ts,tsx}` and excludes `src/main.tsx`, `src/**/*.d.ts`, `src/test/**`, the vendored primitives in `src/components/ui/**`, type-only `types.ts` files and the test files themselves. `src/components/form/**` stays covered. The pure shell, theme and JSON modules (`navigation.ts`, `breadcrumbs.ts`, `theme.ts`, `storage.ts`, `json.ts`) the pure settings modules (`permissionTree.ts`, `roleHierarchy.ts`, `validation.ts`, `conflict.ts`, `media.ts`, `search.ts`, `guard.ts`) and the pure content modules (`schema.ts`, `columns.ts`, `listState.ts`, `schemaForm.ts`, `richtext.ts`, `mediaValue.ts`, `bulk.ts`) are expected to keep at least 90% branch coverage. That bar is read from the report; the config enforces only the globs below.

| Glob                                                                                      | Lines, statements, functions, branches |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| Logic: `src/core/**/*.ts`, `src/app/**/*.ts`, `src/features/**/*.ts`, `src/utils/**/*.ts` | ≥ 85%                                  |
| UI: `src/**/*.tsx`                                                                        | ≥ 70%                                  |

The logic globs match only `.ts` and the UI glob only `.tsx`, so no file counts twice. A missed gate makes `test:cov` exit 1 (checked by temporarily raising a threshold).

The temporary `PENDING_REWRITE` exclusion list is gone: every rewritten file is now under the gates.

## E2E tests (Playwright)

- Config: `playwright.config.ts`. Chromium only. Specs live in `e2e/*.spec.ts`.
- Two projects. `chromium` runs every spec except `csp.spec.ts` against the dev server. `csp` runs only `csp.spec.ts` against the production build (see [Content-Security-Policy](#content-security-policy)).
- `webServer` starts `vite --port 5174 --strictPort` with `VITE_API_URL` set to empty, so the app calls the relative `/api/v1`. A running dev server on 5174 is reused locally. A second server, for the `csp` project, runs `vite build` into `node_modules/.tmp/e2e-csp` (never `dist/`) and `vite preview --port 5175 --strictPort`. Playwright starts both servers on every run, so a `--project=chromium` run also builds once.
- Import `test` and `expect` from `e2e/fixtures/mockApi.ts`, not from `@playwright/test`. Its auto fixture routes every `**/api/v1/**` request through `page.route`, records it in `mockApi.requests` (with its status), and answers from a fake backend (users, roles, tokens and the refresh-cookie session; see [Routing and guards](./routing-and-guards.md#e2e-fixture-mockapi)). Anything not modelled gets a Nest-style 404. No e2e test needs a live backend.
- The settings paths (`/users*`, `/roles*`, `/permissions*`, `/access-tokens*`, `/media*`) are answered by `e2e/fixtures/mockSettings.ts`, an in-memory settings backend that `mockApi` delegates to (also the `mockSettings` fixture). See [Settings](./settings.md#test-doubles) for its routes and error triggers.
- Unit tests of the settings feature use the opt-in recorders in `src/test/msw/settingsHandlers.ts` (one per contract row, none installed by default) and `src/test/nodeMultipart.ts` for uploads.
- The content paths (`/content-types*`, `/documents/single-type/*`, `/documents/collection-type/*`) are answered by `e2e/fixtures/mockContent.ts` (the `mockContent` fixture), an in-memory backend for C1 to C3, S1 to S4 and D1 to D10 with 401, 403 (global or slug-scoped grants), 404, the Mode B 400s, D9 all-or-nothing and D10 per-id failures (`failDelete`). Shared types and documents are in `e2e/fixtures/contentFixtures.ts` (`seedContent`, `FIELD_SHOWCASE`, `BLOG`, `HOMEPAGE`, `CHANGELOG`, `blogPost(n)`, `CONTENT_MANAGER`). Unit tests use the opt-in recorders in `src/test/msw/contentHandlers.ts` (one per contract row, plus `errorReply`). See [Documents UI](./documents-ui.md#test-doubles).
- `e2e/a11y.spec.ts` uses `@axe-core/playwright` (see [App shell](./app-shell.md#tests)). It covers the settings pages and their dialogs too (see [Settings](./settings.md#accessibility-and-keyboard-ac-42-ac-43)).
- If the Playwright browser is missing from the user cache, run `pnpm --filter cms-admin exec playwright install chromium`, or install it into `node_modules` and run with `PLAYWRIGHT_BROWSERS_PATH=0`. In this repo's dev setup the browser is in `node_modules`, so every e2e command runs as `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e [e2e/<spec>.spec.ts]`.
- Reports go to `playwright-report/` and `test-results/` (git-ignored).

## The `@/` alias

`@/*` maps to `src/*` in `tsconfig.app.json` (`paths`), `vite.config.ts` and `vitest.config.ts` (`resolve.alias`). Use it for cross-folder imports, and relative imports inside a feature folder. `tsconfig.node.json` type-checks `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` and `e2e/`.

## Env vars

Documented in `apps/cms-admin/.env.example` (no secrets). Vite only exposes names that start with `VITE_`.

| Variable                | Used by                         | Meaning                                                                                                                            |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | the app (build)                 | Backend origin, for example `https://cms-api.example.com`. Empty or unset in dev, so the proxy is used.                            |
| `VITE_API_PROXY_TARGET` | Vite dev server                 | Where `/api` and `/health` are proxied in dev. Defaults to `http://localhost:8080`.                                                |
| `CSP_API_ORIGIN`        | nginx (runtime), `vite preview` | The API origin added to `img-src` and `connect-src`, for example `https://cms-api.example.com`. Empty when the API is same-origin. |
| `CSP_IMG_ORIGINS`       | nginx (runtime), `vite preview` | Extra image origins (CDN, media host), separated by spaces. Added to `img-src`. Empty by default.                                  |

The two `CSP_` variables are not `VITE_` vars: they never reach the bundle. nginx reads them when the container starts, so one image serves any deployment.

`src/core/config/env.ts` exports `API_BASE_URL`: `VITE_API_URL` with trailing slashes stripped, plus `/api/v1`. An empty value gives the relative `/api/v1`. `buildApiBaseUrl()` is exported for tests. `src/vite-env.d.ts` types `import.meta.env.VITE_API_URL`. `src/utils/constants.ts` holds non-env constants only.

## Dev proxy

The local backend sends no CORS headers for the Vite origin, so in dev the browser calls `/api/v1/...` on `:5173` and Vite (`server.proxy` in `vite.config.ts`) forwards `/api` and `/health` to `VITE_API_PROXY_TARGET` with `changeOrigin`. The refresh cookie is then first-party on `localhost`.

Check it with the backend running on :8080:

```bash
pnpm --filter cms-admin dev
curl -s localhost:5173/health                 # {"status":"ok"}
curl -s localhost:5173/api/v1/auth/has-users  # {"hasUsers":true}
```

Production builds set `VITE_API_URL` to the backend origin, and the backend's `CORS_ORIGINS` must include the admin origin. The proxy is dev only.

## Content-Security-Policy

The admin ships a Content-Security-Policy and `Referrer-Policy: same-origin` (SEC-4). `src/core/security/csp.ts` exports `buildContentSecurityPolicy({ apiOrigin, imgOrigins })`, the single source of the policy:

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: blob: <CSP_API_ORIGIN> <CSP_IMG_ORIGINS>; font-src 'self';
connect-src 'self' <CSP_API_ORIGIN>; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

(One line in practice; empty origins are left out.) Each origin must be a bare `http(s)://host[:port]`, otherwise the builder throws. There is no `'unsafe-inline'`: `index.html` loads `theme-init.js` as an external script, and a library that needs inline scripts or styles is a stop-and-ask, not a policy change.

Where it is served:

- **Production (nginx):** `nginx.conf` is an envsubst template, copied to `/etc/nginx/templates/default.conf.template`. Every app `location` (`/`, the SPA fallback, `/assets/`) adds both headers with `always`; `/healthz` does not. The `Dockerfile` sets `ENV CSP_API_ORIGIN="" CSP_IMG_ORIGINS=""`, so unset values give a self-only policy. `nginxTemplate.test.ts` pins the template to the builder.
- **`vite preview`:** `preview.headers` in `vite.config.ts` sends the same two headers, built from `CSP_API_ORIGIN` and `CSP_IMG_ORIGINS` in the environment.
- **Dev server:** no CSP (Vite injects inline styles for HMR).
- **`index.html`:** `<meta name="referrer" content="same-origin">`, so the referrer rule also holds where the header is missing.

### The `csp` e2e project

`e2e/csp.spec.ts` runs only in the `csp` project, against the built app served by `vite preview` with `CSP_IMG_ORIGINS=https://media.example.test`. It records every `securitypolicyviolation` event from an init script and checks:

- the response carries exactly `buildContentSecurityPolicy({ apiOrigin: '', imgOrigins: 'https://media.example.test' })` and `Referrer-Policy: same-origin`, and the page has the referrer meta (AC-11);
- `/login`, `/admin` and `/admin/settings/media` render with zero violations, and the media thumbnails on `https://media.example.test` (answered by `page.route`) load (AC-12);
- control: an image injected from `https://blocked.example.test` fires an `img-src` violation, so the policy is really active.

### Image check

Build the production image and confirm the headers by hand:

```bash
docker build -f apps/cms-admin/Dockerfile -t cms-admin .
docker run --rm -p 8081:80 -e CSP_API_ORIGIN=https://api.example.test -e CSP_IMG_ORIGINS=https://cdn.example.test cms-admin
curl -sI localhost:8081/admin | grep -i -E 'content-security-policy|referrer-policy'   # both present
curl -sI localhost:8081/healthz | grep -i -E 'content-security-policy|referrer-policy' # neither
```

Set `CSP_IMG_ORIGINS` to the media host that serves thumbnails (the Cloudinary or CDN origin), or the media library images are blocked.
