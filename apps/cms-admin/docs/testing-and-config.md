# Testing and config

Tooling and runtime config for `apps/cms-admin`: unit and e2e test setup, coverage gates, the `@/` alias, API env vars and the dev proxy.

## Scripts

| Command                                                    | What it does                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter cms-admin test`                             | `vitest run`: all unit and integration tests, once            |
| `pnpm --filter cms-admin test:watch`                       | `vitest` in watch mode                                        |
| `pnpm --filter cms-admin test:cov`                         | `vitest run --coverage`, fails when a coverage gate is missed |
| `pnpm --filter cms-admin exec playwright install chromium` | One-time browser download for e2e                             |
| `pnpm --filter cms-admin test:e2e`                         | `playwright test` against a Vite dev server on port 5174      |
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

`test:cov` uses the v8 provider. Coverage includes `src/**/*.{ts,tsx}` and excludes `src/main.tsx`, `src/**/*.d.ts`, `src/test/**`, type-only `types.ts` files and the test files themselves.

| Glob                                                                                      | Lines, statements, functions, branches |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| Logic: `src/core/**/*.ts`, `src/app/**/*.ts`, `src/features/**/*.ts`, `src/utils/**/*.ts` | ≥ 85%                                  |
| UI: `src/**/*.tsx`                                                                        | ≥ 70%                                  |

The logic globs match only `.ts` and the UI glob only `.tsx`, so no file counts twice. A missed gate makes `test:cov` exit 1 (checked by temporarily raising a threshold).

`PENDING_REWRITE` in `vitest.config.ts` temporarily excludes the draft files that later small phases rewrite in place (`App.tsx`, `AppProvider.tsx`, `AuthSlice.ts`, `LoginPage.tsx`, `ProfilePage.tsx`). The phase that rewrites a file removes it from that list.

## E2E tests (Playwright)

- Config: `playwright.config.ts`. Chromium only. Specs live in `e2e/*.spec.ts`.
- `webServer` starts `vite --port 5174 --strictPort` with `VITE_API_URL` set to empty, so the app calls the relative `/api/v1`. A running dev server on 5174 is reused locally.
- Import `test` and `expect` from `e2e/fixtures/mockApi.ts`, not from `@playwright/test`. Its auto fixture routes every `**/api/v1/**` request through `page.route`, records it in `mockApi.requests` (with its status), and answers from a fake backend (users, roles, tokens and the refresh-cookie session; see [Routing and guards](./routing-and-guards.md#e2e-fixture-mockapi)). Anything not modelled gets a Nest-style 404. No e2e test needs a live backend.
- Reports go to `playwright-report/` and `test-results/` (git-ignored).

## The `@/` alias

`@/*` maps to `src/*` in `tsconfig.app.json` (`paths`), `vite.config.ts` and `vitest.config.ts` (`resolve.alias`). Use it for cross-folder imports, and relative imports inside a feature folder. `tsconfig.node.json` type-checks `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` and `e2e/`.

## Env vars

Documented in `apps/cms-admin/.env.example` (no secrets). Vite only exposes names that start with `VITE_`.

| Variable                | Used by         | Meaning                                                                                                 |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | the app (build) | Backend origin, for example `https://cms-api.example.com`. Empty or unset in dev, so the proxy is used. |
| `VITE_API_PROXY_TARGET` | Vite dev server | Where `/api` and `/health` are proxied in dev. Defaults to `http://localhost:8080`.                     |

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
