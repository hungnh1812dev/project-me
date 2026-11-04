---
app: web
summary: Rules every web page, feature and BFF route must keep
---

# web: rules

Part of the [project spec](../../../SPEC.md). App `web`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Layers

Applies to: all flows.

- **web layers** (amended 2026-10-31, ADR 0017 §6): `app/` (pages, shell incl. `AccountMenu`, BFF route files `app/bff/v1/**/route.ts`) → `features/*` → `features/session` → `apis/` (browser client of the BFF; cms-api server clients and the BFF pipeline in `apis/server/`) → `libs/`, `utils/` → `configs/`. A BFF route file only binds its path to `defineBffRoute(...)` with one feature function. `apis/server/**` imports no feature. `auth`, `status` and `cv` import no feature other than `session`. Cross-feature imports go through `index.ts`. No `reviewer` feature on web.

## Web rules

Applies to: all flows.

Web rules: Server Components by default; `'use client'` only for state, effects, handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import. Files that read server env or call `API_INTERNAL_URL` import `server-only`. The browser never holds a user token and never calls cms-api: every browser call goes to the BFF Route Handlers under `/bff/v1` on the web origin, which keep the cms-api tokens in a sealed HttpOnly cookie (D21, amended 2026-10-31, ADR 0017; replaces the earlier "the Next server never holds a token" rule). No Server Actions. No `store/` on web.

## BFF (D21)

Applies to flows: `sign-in`, `public-site`.

1. Every BFF route runs the pipeline of [FLOW.md](FLOW.md) "BFF request pipeline" in its order (D21, criterion 23).
2. Each endpoint makes one fixed cms-api call: no generic proxy and no GraphQL passthrough; cms-api is reached only on `API_INTERNAL_URL`, never following redirects (D21).
3. The browser never holds a cms-api token: the BFF keeps them in the sealed `__Host-abyss_web_session` cookie (AES-256-GCM, key from `WEB_SESSION_SECRET`); a cookie that does not open counts as absent and is cleared (D21, criterion 22).
4. Accounts with any permission other than `read` are refused (`403 BFF_PRIVILEGED_ACCOUNT`) after login, after 2FA and on every session read (D21).
5. Turnstile is verified server-side before any cms-api call, and fails closed (D21, criterion 24).
6. Logs hold the route and error code of refused requests, never bodies, tokens, codes, cookies, emails or passwords (D21).
7. No reviewer mode on web (D21).

## CSP (D17)

Applies to: all flows.

- The CSP comes from `src/proxy.ts` with a fresh nonce per request: `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ the Turnstile origin), `connect-src 'self'` only, `frame-ancestors 'none'`; BFF answers carry `Cache-Control: no-store` (D17).
