---
app: web
summary: Rules every web page, feature and BFF route must keep
---

# web: rules

Part of the [project spec](../../../SPEC.md). App `web`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md). In these files a section without an `Applies to:` line covers every flow that touches this app.

## Layers

- **web layers** (amended 2026-10-31, ADR 0018 §6; amended 2026-11-15, WEB-11): `app/` (route files, shell incl. `AccountMenu`, BFF route files `app/api/v1/**/route.ts`) → `views/*` → `features/*` → `features/session` → `apis/` (browser client of the BFF; cms-api server clients and the BFF pipeline in `apis/server/`) → `libs/`, `utils/` → `configs/`. A BFF route file only binds its path to `defineBffRoute(...)` with one server function, imported from a feature's `*.server.ts` file or a page's `Page<Name>.data.ts` ("Page layout" below); a feature's `index.ts` (imported by client code) never re-exports a server file. `apis/server/**` imports no feature and no view. `auth` and `status` import no feature other than `session` (planner Q-WCP1, 2026-11-08; `site-shell` removed 2026-11-15, Q-PS1a; `cv` merged into `views/cv`, WEB-11); `session` imports no other feature; a view imports no other view. Cross-feature imports go through `index.ts`. No `reviewer` feature on web. `apis/server/graphql` → `apis/server/restful` → `configs/`; only `apis/server/graphql/MockFallback.server.ts` imports `MockView.ts`; `apis/client` imports nothing from `apis/server`; only the server files of a feature or of a page view ("Page layout" below) run a content query, and no file calls `fetch` or axios outside `apis/` (WEB-1, WEB-6).

## Web rules

Web rules: Server Components by default; `'use client'` only for state, effects, handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import. Files that read server env or call `APP_API_URL` import `server-only`. The browser never holds a user token and never calls cms-api: every browser call goes to the BFF Route Handlers under `/api/v1` on the web origin, which keep the cms-api tokens in a sealed HttpOnly cookie (D21, amended 2026-10-31, ADR 0018; replaces the earlier "the Next server never holds a token" rule). No Server Actions. No `store/` on web. No user-facing text literal in web source except the last-resort set of WEB-3; text comes from the page text queries (WEB-3). `APP_API_TOKEN` is read only by `apis/server/graphql` and stays server-only (WEB-2). Every server fetch sets its revalidate seconds; a visitor-token call is `no-store` (WEB-4).

No link to, URL of or env key for cms-admin anywhere in web: code, build, CI, stack scripts (WEB-12, criterion 30).

## Page layout

Every page of the web app is built this way (WEB-11, user 2026-11-15). `<Name>` is the page name in PascalCase, `<page>` its folder in kebab-case: `/` is `home` (`PageHome`), `/cv` is `cv` (`PageCv`).

1. `app/<path>/page.tsx` renders only its page view `Page<Name>` from `views/<page>/`. It may re-export that view's `generateMetadata` (Next.js reads metadata only from the route file) and holds nothing else: no data load, no markup, no props.
2. `views/<page>/Page<Name>.tsx` is a Server Component and loads the page's data. A simple load (one content query, used by this page only, no mapping beyond picking fields) is declared and run in this file. Any other load lives in `Page<Name>.data.ts` (`server-only`): several queries, one load shared by `generateMetadata` and the page through React `cache` (WEB-6), a second caller such as a BFF route, or mapping and state rules.
3. `Page<Name>.graphql.ts` holds the page query strings (operation name and selections), result types and pure helpers; client-safe, it imports nothing from `apis/server/**`. The `executeGraphql` call that runs a query, with its mock key and `resolveData`, sits in `Page<Name>.tsx` or `Page<Name>.data.ts`.
4. `Page<Name>.client.tsx` holds only what must run in the browser (state, effects, handlers, TanStack Query, the signed-in refetch); it takes its data and text as props from `Page<Name>.tsx` (WEB-3) and calls only the BFF through `apis/client`.
5. A page is split into small components, one file each, in its view folder; a component a second page or feature needs moves to `features/` (feature-bound) or `components/` (generic) (`code-standards` §4.6).
6. Data read by one page only lives in that page's view folder, never in `features/`: the CV data and its signed-in refetch live in `views/cv` (no `features/cv`). A part shown on several pages keeps its query in its feature: the header (`features/site-header`), the sign-in dialog and account menu (`features/auth`), the not-found message (`features/not-found`) and the module status (`features/status`, public-site PS-1).

## Not-found pages

Next.js renders every `not-found.tsx` with every route under its segment, not only when a page is missing, so a query in one runs on each of those renders (planner 2026-11-15, finding WPQ-A-qc#1). The root `app/not-found.tsx` loads no data: it shows the last-resort not-found text (WEB-3) and serves only `notFound()` calls of routes that have no not-found page of their own (none today). Unknown URLs reach the catch-all route `app/[...unknownPath]/`, whose page only calls `notFound()` and whose `not-found.tsx` runs the `NotFoundPage` query (public-site PS-1); a query in a `not-found.tsx` is allowed only in a segment whose every render is a not-found render. Both not-found files render the one `NotFoundMessage` component of `features/not-found`.

A 404, and any error that reaches the page shell, makes Next.js render the metadata a second time, in an error render whose React `cache` starts empty (Next.js 16.4; finding CSF-A-qc#4). So a loader the root layout's `generateMetadata` calls keeps its result per request, not per render: today only `loadSiteHeader`, whose memo is keyed on the request (ADR 0023, which also says where a second such loader takes it from), and its query is sent once per request on every page, a 404 included (ADR 0023).

## Mock fallback (WEB-5)

Applies to flows: `public-site`, `sign-in`.

1. On only where `APP_ENV` is not `production`, at build and at runtime (WEB-9); no other key turns it on.
2. Only for a content read of the server GraphQL layer (`executeGraphql` with a `mock` key), and only when the whole query failed: a transport or HTTP failure, GraphQL `errors` (HTTP 200 included), no `data`, or a `resolveData` that throws; a single type that answers null fails through `requireRootField` (WEB-5, Q-WEM3, Q-WFL5). A collection that answers empty never gets a mock: its page shows 404 or a no-data state.
3. Never used on a call made with a visitor's token, by the server RESTful layer, the BFF or the client.
4. Mocks are read only through `MockView.ts`, by mock key, by `apis/server/graphql`, loaded with a dynamic `import()`; no client file imports them. A mock holds the GraphQL `data` of its one query.
5. A mock answer is never cached (no data cache entry, no revalidate seconds, no cached render).

## API errors (WEB-10)

1. Every API layer and BFF route raises or returns only `WebApiError`, with a code from its one closed list.
2. A `WebApiError` never holds a token, a cookie, a request body or upstream text; it is logged only through the one API error logger.

## BFF (D21)

Applies to flows: `sign-in`, `public-site`.

1. Every BFF route runs the pipeline of [FLOW.md](FLOW.md) "BFF request pipeline" in its order (D21, criterion 23).
2. Each endpoint makes a fixed list of cms-api calls (ADR 0018 §2): no generic proxy and no GraphQL passthrough; no path, query or header of the request reaches cms-api except the validated body fields, the forwarded client IP and the `documentId` path segment of `GET /api/v1/cv/{documentId}`, checked as a UUID and sent only as a GraphQL variable (public-site PS-5); cms-api is reached only on `APP_API_URL`, never following redirects (D21).
3. The browser never holds a cms-api token: the BFF keeps them in the sealed `__Host-abyss_web_session` cookie (AES-256-GCM, key from `WEB_SESSION_SECRET`); a cookie that does not open counts as absent and is cleared (D21, criterion 22).
4. Accounts with any permission other than `read` are refused (`403 BFF_PRIVILEGED_ACCOUNT`) after login, after 2FA and on every session read (D21).
5. The BFF never verifies Turnstile and holds no Turnstile secret: the login, email-code and verify bodies require `turnstileToken` (length capped) and pass it to cms-api, which verifies it; cms-api's `HUMAN_CHECK_FAILED` / `HUMAN_CHECK_UNAVAILABLE` become `BFF_HUMAN_CHECK_FAILED` / `BFF_HUMAN_CHECK_UNAVAILABLE` (D25, criteria 24, 30; global RULES "Human check (D25)").
6. Logs hold the route and error code of refused requests, never bodies, tokens, codes, cookies, emails or passwords (D21).
7. No reviewer mode on web (D21).
8. A production server never starts with `BFF_AUTH_RATE_LIMIT_IP` set unless `ALLOW_BFF_RATE_LIMIT_OVERRIDE=smoke` (smoke stack only); deploy config sets neither key, so production keeps the `auth` limit of the pipeline (ADR 0018 §2.7).

## CSP (D17)

- The CSP comes from `src/proxy.ts` with a fresh nonce per request: `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ the Turnstile origin), `connect-src 'self'` only, `frame-ancestors 'none'`; BFF answers carry `Cache-Control: no-store` (D17). The proxy matcher skips `api/` (the BFF prefix, with its trailing slash, so `/api-…` paths still get the nonce CSP), and `next.config.ts` `headers()` gives every `/api/*` answer, unknown paths included, the static BFF policy; both are static literals Next.js requires, each next to a comment naming `BFF_BASE_PATH` (D17 amendment of 2026-11-06).
