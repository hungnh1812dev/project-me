# Testing and config

Cross-cutting tooling for `apps/cms-admin`: the unit and e2e test setup, coverage gates, the shared
test helpers, the `@/` alias, the API env vars and the dev proxy. Every other module's tests run on
top of this. The Content-Security-Policy and the nginx image are in [CSP and headers](./csp-and-headers.md).

## Feature

### Scripts

| Command                                                    | What it does                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter cms-admin test`                             | `vitest run`: all unit and integration tests, once            |
| `pnpm --filter cms-admin test:watch`                       | `vitest` in watch mode                                        |
| `pnpm --filter cms-admin test:cov`                         | `vitest run --coverage`, fails when a coverage gate is missed |
| `pnpm --filter cms-admin exec playwright install chromium` | One-time browser download for e2e                             |
| `pnpm --filter cms-admin test:e2e`                         | `playwright test`: both projects (`chromium` and `csp`)       |
| `pnpm --filter cms-admin test:e2e --project=csp`           | Only the CSP check against the built app on port 5175         |
| `pnpm turbo run lint typecheck build --filter=cms-admin`   | oxlint, `tsc -b` and the production build                     |

### Unit tests (Vitest)

- Environment `jsdom`, setup file `src/test/setup.ts`. Tests sit next to their source as
  `src/**/*.test.ts(x)` and import `describe`, `it`, `expect` and `vi` from `vitest` (no globals).
- The setup registers the jest-dom matchers, runs RTL `cleanup` after each test, starts, resets and
  closes the MSW server, and stubs `matchMedia` and `ResizeObserver` for jsdom.
- Components: React Testing Library plus `@testing-library/user-event`.
- **MSW.** The server runs with `onUnhandledRequest: 'error'`, so a request without a handler fails
  the test and no unit test reaches a real backend. Override per test with `server.use(...)`;
  overrides reset after each test. The defaults in `handlers.ts`: `POST /auth/refresh` → 401 (no
  session cookie), logout → 200, `has-users` → `true`. Feature recorders (content, settings) are
  opt-in and documented on their module pages. `smoke.test.ts` proves MSW intercepts axios in jsdom
  (the XHR adapter), so no fetch-adapter fallback is needed.
- **Providers.** `renderWithProviders(ui, { auth, route, store, queryClient })`,
  `renderHookWithProviders` and `renderRoutes` give each test a fresh store, `QueryClient` and memory
  router with a preloaded auth state. They do not run the session bootstrap.
- **Fixtures.** `makeMeUser`, `makeRole`, plus the settings fixtures `makeUser`, `makePermission`,
  `makeAccessToken`, `makeAccessTokenSecret`, `makeMediaAsset`.

### Coverage gates

`test:cov` uses the v8 provider over `src/**/*.{ts,tsx}`, excluding `src/main.tsx`, `*.d.ts`,
`src/test/**`, type-only `types.ts` files and the tests. Since Phase 6 the vendored primitives, the
generic form components and `json.ts` live in `@repo/ui`, which has its own gates (see
[Design system](./design-system.md)).

| Glob                                                                                      | Lines, statements, functions, branches |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| Logic: `src/core/**/*.ts`, `src/app/**/*.ts`, `src/features/**/*.ts`, `src/utils/**/*.ts` | ≥ 85%                                  |
| UI: `src/**/*.tsx`                                                                        | ≥ 70%                                  |

The globs never overlap (`.ts` vs `.tsx`). A missed gate makes `test:cov` exit 1. The pure modules
of the shell, theme, settings and content features are expected to keep ≥ 90% branch coverage; that
bar is read from the report, not enforced by the config. The old `PENDING_REWRITE` exclusion list is
gone.

### E2E tests (Playwright)

- Chromium only, specs in `e2e/*.spec.ts`. Two projects: `chromium` runs every spec except
  `csp.spec.ts` against the dev server; `csp` runs only `csp.spec.ts` against the production build.
- `webServer` starts `vite --port 5174 --strictPort` with `VITE_API_URL` empty (relative `/api/v1`),
  reused locally when already running, plus a `vite build` into `node_modules/.tmp/e2e-csp` (never
  `dist/`) served by `vite preview --port 5175`. Both start on every run.
- Import `test` and `expect` from `e2e/fixtures/mockApi.ts`, never from `@playwright/test`. Its auto
  fixture answers every `**/api/v1/**` request from in-memory backends (auth in
  [Routing and guards](./routing-and-guards.md), settings in
  [Settings foundation](./settings-foundation.md), content in [Content data](./content-data.md));
  anything not modelled gets a Nest-style 404. No e2e test needs a live backend.
- `e2e/a11y.spec.ts` runs axe (`@axe-core/playwright`, `wcag2a`, `wcag2aa`, `wcag21aa`) on every
  surface in light and dark at 1280px and 375px and fails on any serious or critical violation; it
  also walks Tab order and dialog focus. What it covers per area is on each module page.
- In this repo the browser is in `node_modules`, so run e2e as
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e [e2e/<spec>.spec.ts]`. Reports go to
  `playwright-report/` and `test-results/` (git-ignored).

### The `@/` alias

`@/*` maps to `src/*` in `tsconfig.app.json`, `vite.config.ts` and `vitest.config.ts`. Use it for
cross-folder imports and relative imports inside a feature folder. `tsconfig.node.json` type-checks
the three configs and `e2e/`.

### Env vars

Documented in `.env.example` (no secrets). Vite only exposes names starting with `VITE_`.

| Variable                | Used by         | Meaning                                                                                   |
| ----------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | the app (build) | Backend origin. Empty or unset in dev, so the proxy is used                               |
| `VITE_API_PROXY_TARGET` | Vite dev server | Where `/api` and `/health` are proxied in dev. Defaults to `http://localhost:8080`        |
| `CSP_API_ORIGIN`        | nginx, preview  | See [CSP and headers](./csp-and-headers.md)                                               |
| `CSP_IMG_ORIGINS`       | nginx, preview  | See [CSP and headers](./csp-and-headers.md)                                               |

`API_BASE_URL` is `VITE_API_URL` with trailing slashes stripped plus `/api/v1`; empty gives the
relative `/api/v1`.

### Dev proxy

The local backend sends no CORS headers for the Vite origin, so in dev the browser calls
`/api/v1/...` on `:5173` and Vite forwards `/api` and `/health` to `VITE_API_PROXY_TARGET` with
`changeOrigin`. The refresh cookie is then first-party on `localhost`. Check it with the backend on
:8080: `curl -s localhost:5173/health` and `curl -s localhost:5173/api/v1/auth/has-users`.
Production builds set `VITE_API_URL`, and the backend's `CORS_ORIGINS` must include the admin origin.

### Decisions

- **No unit test reaches a network.** `onUnhandledRequest: 'error'` makes a missing handler a test
  failure rather than a silent real request.
- **One e2e mock entry point** (`mockApi`), delegating to per-feature backends, so a spec can mix
  auth, settings and content without wiring.
- **The CSP project builds into `node_modules/.tmp`**, so an e2e run never overwrites `dist/`.

## Files

| File                          | Spec                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `package.json`                | Scripts (`dev`, `build`, `test`, `test:cov`, `test:e2e`, `lint`, `typecheck`) and dependencies.         |
| `vite.config.ts`              | Vite + React + Tailwind plugins, the `@/` alias, the dev proxy and the `preview.headers` CSP.           |
| `vitest.config.ts`            | jsdom environment, setup file, alias, coverage provider, includes, excludes and thresholds.             |
| `playwright.config.ts`        | The `chromium` and `csp` projects and the two web servers (dev on 5174, built preview on 5175).         |
| `tsconfig.json`               | Project references to the app and node configs.                                                        |
| `tsconfig.app.json`           | Compiler options for `src`, including the `@/*` path.                                                  |
| `tsconfig.node.json`          | Type-checks the configs and `e2e/`.                                                                    |
| `.oxlintrc.json`              | oxlint rules for the app.                                                                              |
| `.gitignore`                  | Ignores build output, coverage and Playwright reports.                                                 |
| `.env.example`                | Names and meaning of every env var, no values that are secrets.                                        |
| `README.md`                   | App readme: how to run, test and build.                                                                |
| `src/core/config/env.ts`      | Exports `API_BASE_URL`, `buildApiBaseUrl`. Builds the API base from `VITE_API_URL`.                    |
| `src/vite-env.d.ts`           | Types `import.meta.env.VITE_API_URL`.                                                                  |
| `src/utils/constants.ts`      | Placeholder for non-env constants (exports nothing yet).                                               |
| `src/test/setup.ts`           | jest-dom matchers, RTL cleanup, MSW lifecycle, jsdom stubs.                                            |
| `src/test/msw/server.ts`      | Exports `server`, the MSW node server with the default handlers.                                       |
| `src/test/msw/handlers.ts`    | Exports `handlers`: refresh 401, logout 200, has-users `true`.                                         |
| `src/test/renderWithProviders.tsx` | Exports `renderWithProviders`, `renderHookWithProviders`, `renderRoutes`, `createProviders`, `ProviderOptions`. Fresh store, client and router per test. |
| `src/test/fixtures.ts`        | Exports `makeRole`, `makeMeUser`, `makeUser`, `makePermission`, `makeAccessToken`, `makeAccessTokenSecret`, `makeMediaAsset`. |
| `e2e/fixtures/mockApi.ts`     | The `test`/`expect` every spec imports: routes `/api/v1/**` to the in-memory backends and records requests. Auth behaviour is in [Routing and guards](./routing-and-guards.md). |

## Testing

- `src/test/smoke.test.ts`: MSW intercepts axios in jsdom.
- `src/test/stubs.test.ts`: the jsdom `matchMedia` and `ResizeObserver` stubs.
- `src/test/noDangerousHtml.test.ts`: no `.tsx` file under `src/` uses `dangerouslySetInnerHTML`
  (AC-34).
- `src/core/config/env.test.ts`: `buildApiBaseUrl` with empty, absolute and slash-suffixed values.
- `e2e/smoke.spec.ts`: the shell loads with the API mocked, and `/api/v1` calls are answered by the
  mock.
- `e2e/a11y.spec.ts`: axe, Tab order and dialog focus across the app (details on each module page).
- Run: `pnpm --filter cms-admin test`, `test:cov`, and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e`.

## Related

- [CSP and headers](./csp-and-headers.md)
- [API client](./api-client.md) (uses `API_BASE_URL`)
- [Auth session](./auth-session.md)
- [Routing and guards](./routing-and-guards.md) (the `mockApi` auth backend)
- [Settings foundation](./settings-foundation.md) and [Content data](./content-data.md) (their test doubles)
