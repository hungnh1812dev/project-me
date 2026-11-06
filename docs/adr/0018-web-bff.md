# ADR 0018: Web BFF under `/api/v1`, sealed session cookie, cms-api off the web host

- Status: implemented (2026-11-06, feature web-api-path, c2bdd002..fa57bc71)
- Date: 2026-11-05 (planner `PLAN web-bff-hardening`; replaces the ADR 0017 that D21 named on 2026-10-31, which was never committed; the number 0017 now belongs to the cms-admin locale loader)
- Spec: D21 in [docs/apps/web/SPEC.md](../apps/web/SPEC.md); rules in [docs/apps/web/RULES.md](../apps/web/RULES.md) "BFF (D21)"; pipeline in [docs/apps/web/FLOW.md](../apps/web/FLOW.md); endpoints in [api-contract.md](../global/reference/api-contract.md) "Web BFF"; acceptance criteria 21-25 in [ACCEPTANCE.md](../global/ACCEPTANCE.md); D7, D14, D17 amendments in [DECISIONS.md](../global/DECISIONS.md).
- Amended 2026-11-06 (feature web-api-path, user answers of 2026-11-06): the BFF path moved from `/bff/v1/*` to `/api/v1/*` and its route files from `app/bff/v1/` to `app/api/v1/`. (1) Pure rename: response shapes, status codes, error codes, cookies and headers unchanged. (2) Every reference follows: code, unit and e2e tests, docs, README, SPEC index, CHANGELOG. (3) Internal names keep the word `bff` (`apis/server/bff/`, `defineBffRoute`, `BffError`, `BFF_ERROR_CODES`, `BFF_BASE_PATH`, `BFF_ENDPOINTS`, the e2e `BFF_PATHS`, the `[bff]` log tag, the `BFF_*` codes). (4) `/bff/v1/*` is removed outright: web's 404, no alias, no redirect. Since cms-api also serves `/api/v1/*` on the admin origin, the two are told apart by origin (D21 "Topology"). The §8 file map is kept as built.
- Rules for every task of this design: `code-standards` §4 (one owner, small interface, names, few files, §4.5 file names with `docs/global/RULES.md` "Naming"), the graphify rules of `CLAUDE.md`, `docs/global/RULES.md`, `docs/apps/web/RULES.md`, the sign-in and public-site flow rules.

## 1. Context (checked on the repo, 2026-11-05)

- apps/web today: the browser calls cms-api on `NEXT_PUBLIC_API_BASE_URL` (`/api/v1` on the web host) through `apis/client/Api.client.ts` (Axios, `withCredentials`), holds the access token in memory (`features/session/WebSession.context.tsx`), and reads the CV again with that token through `apis/client/Graphql.client.ts`. `next dev` rewrites `/api` to `DEV_API_PROXY_TARGET`. `/status` is behind `WEB_STATUS_PAGE_ENABLED`. `features/reviewer` (12 files) starts reviewer sessions from the browser.
- cms-api: `POST /auth/login` answers `{ accessToken }` and sets `__Secure-abyss_rt` (or `{ requires2FA, tempToken, methods }`); `/auth/2fa/verify` and `/auth/2fa/email-challenge` take the temp token; `/auth/refresh` and `/auth/logout` read the cookie and need `Origin` in `cookieOrigins` (`AllowedOriginGuard`); `/auth/me` answers `{ id, email, displayName, role, twoFactorEnabled, twoFactorMethod, permissions }`. No cms-api code changes in this design.
- Smoke (`docker-compose.smoke.yml`) and the dev stack serve cms-api under `/api` on the web host; cms-admin's `VITE_API_BASE_URL` points there; `MEDIA_LOCAL_PUBLIC_URL` too.

## 2. Decision: topology and endpoints

1. The BFF is part of apps/web: Route Handlers `app/api/v1/**/route.ts`, same Node server and origin. The browser calls only `/api/v1/*`; no browser code, bundle or HTML holds a cms-api URL.
2. The BFF reaches cms-api only on `API_INTERNAL_URL`, with `fetch(..., { redirect: 'manual' })`; any 3xx is an upstream failure.
3. cms-api's public route moves from `domain.com/api` to `admin.domain.com/api` (Q-BFF1): cms-admin calls it same-origin; on `domain.com`, `/api/*` is web's: the BFF routes of item 4, every other path web's 404 (amended 2026-11-06). Smoke and deploy docs move the `api` and `api-upload` routers to the admin host; `MEDIA_LOCAL_PUBLIC_URL` moves to the admin origin; cms-admin's `CSP_EXTRA_IMG_SRC` is no longer needed on smoke. A NetworkPolicy (deploy docs) lets only Traefik and web pods reach cms-api.
4. Endpoints (api-contract "Web BFF"). Each has a fixed list of cms-api calls; no path, query or header from the request reaches cms-api except the forwarded client IP:

| BFF route | Bucket | Human check | cms-api calls |
|---|---|---|---|
| `GET /api/v1/health` | read | - | `GET /health/live` |
| `GET /api/v1/session` | read | - | `POST /auth/refresh` when due, `GET /auth/me` |
| `POST /api/v1/auth/login` | auth | `login` | `POST /auth/login`, `GET /auth/me`; `POST /auth/logout` when privileged |
| `POST /api/v1/auth/two-factor/email-code` | auth | `two-factor` | `POST /auth/2fa/email-challenge` |
| `POST /api/v1/auth/two-factor/verify` | auth | `two-factor` | `POST /auth/2fa/verify`, `GET /auth/me`; `POST /auth/logout` when privileged |
| `POST /api/v1/auth/logout` | auth | - | `POST /auth/logout` |
| `GET /api/v1/cv` | read | - | session read (above), `POST /graphql` with the Bearer token, no data cache |

5. `GET /api/v1/health` answers `200 { status: "ok" }` or `503 { status: "unavailable" }` (cms-api down, timeout or not `ok`). `GET /api/v1/cv` answers the CV data sanitized on the server by the same loader as the server render (D13), so the browser no longer sanitizes refetched data.
6. Human check in production (planner 2026-11-05, WBH-2-security#1; option A of the WBH-2 builder's three). Owner: `configs/Server.env.ts` (the web server env reader, validated once at start through instrumentation); `verifyHumanCheck` keeps its Q-WBH3 rules and gains no branch. With `NODE_ENV=production`, `parseServerEnv` throws, so the server does not start, when:
   - `TURNSTILE_SECRET_KEY` equals `TURNSTILE.ALWAYS_PASS_TEST_SECRET` and `ALLOW_TURNSTILE_TEST_SECRET` is not exactly `smoke` (that secret accepts every token, so the human check would be off);
   - `TURNSTILE_SECRET_KEY` is any other value and `TURNSTILE_EXPECTED_HOSTNAME` is unset (a token minted on another host for the same site key, e.g. cms-admin's reviewer widget under Q-BFF4, would pass).

   In every environment `ALLOW_TURNSTILE_TEST_SECRET` is unset, blank or exactly `smoke`, anything else fails start (catches typos), and `TURNSTILE_EXPECTED_HOSTNAME` must be a bare lower-case hostname (cms-api's `Env.schema.ts` format). With the test secret and the opt-in the hostname stays optional: the test secret accepts every token, and the hostname Cloudflare returns for test tokens is not documented. Outside production nothing changes. Why an opt-in and not B (hostname only, test secret left to the deploy docs): the smoke stack runs the production build with `NODE_ENV=production`, so a guard keyed only on `NODE_ENV` would stop it; B leaves the larger hole (a test secret in production turns the human check off) to a document. The opt-in copies cms-api's `ALLOW_LOCAL_MEDIA_PROVIDER=smoke` and `ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=smoke` (one word, set only in the smoke stack's env, never in deploy config, refused with any other value). The dev stack runs `next dev` (`NODE_ENV=development`) and needs no opt-in. Names: `ALLOW_TURNSTILE_TEST_SECRET`, the opt-in word kept as one named constant in `Server.env.ts`; the `ServerEnv` shape is unchanged. Extension: the next production-only refusal of a test value is one more parse function in `Server.env.ts` that takes the same opt-in word; no other module changes.

## 3. Decision: errors

Every refusal is `{ statusCode, errorCode, message }` with `Cache-Control: no-store`; `message` is a fixed English text from `Bff.errors.ts`; nothing from the upstream body, headers, stack or URL. Codes:

| Status | `errorCode` | When |
|---|---|---|
| 400 | `BFF_INVALID_REQUEST` | schema failure, unknown key, length over the cap |
| 400 | `BFF_HUMAN_CHECK_FAILED` | Turnstile token missing, failed, reused, wrong action or hostname |
| 401 | `BFF_INVALID_CREDENTIALS` | cms-api refused the login (any 401 of `/auth/login`; no account enumeration) |
| 401 | `BFF_INVALID_TWO_FACTOR_CODE` | cms-api `AUTH_INVALID_2FA_CODE` |
| 401 | `BFF_TWO_FACTOR_EXPIRED` | no or unreadable `__Host-abyss_web_2fa`, or cms-api `AUTH_INVALID_TEMP_TOKEN` |
| 401 | `BFF_SESSION_REQUIRED` | `GET /api/v1/cv` without a session |
| 403 | `BFF_ORIGIN_NOT_ALLOWED` | state-changing route with a missing or foreign `Origin`, or `Sec-Fetch-Site` other than `same-origin` |
| 403 | `BFF_PRIVILEGED_ACCOUNT` | the account holds a permission whose action is not `read` |
| 405 | `BFF_METHOD_NOT_ALLOWED` | method not bound (with `Allow`) |
| 413 | `BFF_BODY_TOO_LARGE` | body over 8 KiB (declared or read) |
| 415 | `BFF_UNSUPPORTED_MEDIA_TYPE` | POST body not `application/json` |
| 429 | `BFF_RATE_LIMITED` | BFF bucket full, or cms-api 429 (its `Retry-After` kept); `Retry-After` in seconds |
| 502 | `BFF_UPSTREAM_FAILED` | cms-api 5xx, 3xx, unexpected status or answer shape |
| 503 | `BFF_HUMAN_CHECK_UNAVAILABLE` | siteverify unreachable or not JSON (fail closed) |
| 504 | `BFF_UPSTREAM_TIMEOUT` | cms-api did not answer within `API_TIMEOUT_MS` |

A new code is one row here, one entry in `Bff.errors.ts` and, when the dialog shows it, one branch in `features/auth/LoginAlerts.rules.ts`.

## 4. Decision: session

1. `__Host-abyss_web_session` holds the sealed `{ refreshToken, accessToken, accessExpiresAt }`; `__Host-abyss_web_2fa` the sealed `{ tempToken, methods }` with `Max-Age` 300. Both `HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`. In this feature the session cookie is always a browser-session cookie (no `Max-Age`, no `Expires`) and the login sends cms-api no `rememberMe` (cms-api then applies its not-remembered lifetime once remember-me phase 1 is built). Feature remember-me phase 2 (RM-6) adds `rememberMe` to both sealed shapes and the 7-day mode; a sealed session without it reads as `false`.
2. Sealing: AES-256-GCM; key = HKDF-SHA256 of `WEB_SESSION_SECRET` (info names the purpose and a version); 12-byte random IV per write; the cookie name is the additional data, so a value moved between the two cookies does not open; format `base64url(version | iv | ciphertext | tag)`. A value that does not open, or whose JSON does not match its shape, counts as absent and the answer clears it.
3. The refresh token comes from the `Set-Cookie` of cms-api's login, verify and refresh answers, read by the cookie name `__Secure-abyss_rt` only (value, never attributes; the mode is never learned from it, sign-in RULES). A refresh answer without a new cookie (cms-api grace) keeps the stored refresh token. `accessExpiresAt` is the `exp` claim of the access token, read without a signature check (it only times the refresh; cms-api checks every use).
4. Refresh when `accessExpiresAt` is less than 30 s away. One in-process map, keyed by the refresh token, shares one refresh call between concurrent reads and keeps its result for 10 s after it settles (single replica, like D16), so a race never presents a rotated token (D9). A refused refresh clears the cookie and the session reads as signed out.
5. Privileged accounts: after login, after 2FA verify and on every session read, `GET /auth/me`; any permission whose action is not `read` → `POST /auth/logout` with that refresh token, both cookies cleared, `403 BFF_PRIVILEGED_ACCOUNT`.
6. Sign-out calls cms-api `POST /auth/logout` (refresh cookie, `Origin: WEB_ORIGIN`) and always clears both cookies, also when cms-api fails; answer 204.
7. Calls carrying the refresh token send `Cookie: __Secure-abyss_rt=<token>` and `Origin: WEB_ORIGIN` (cms-api's `cookieOrigins` keep `WEB_ORIGIN`, D14). Every call sends exactly one `X-Forwarded-For: <visitor ip>` (and `<CLIENT_IP_HEADER>: <ip>` when set, D7).

## 5. Decision: reviewer mode leaves web

`features/reviewer`, `configs/Reviewer.constants.ts`, the reviewer entry of `AccountMenu` and the reviewer copy go (Q-BFF5: the builder asks before each delete). The Turnstile widget, its hook and the browser API slice move to `features/auth` (Q-BFF4: the web login uses the same Turnstile site and secret key pair as cms-api's reviewer). cms-api's reviewer module, cms-admin's Reviewer page and `REVIEWER_FEATURE_ENABLED` are unchanged (D2a). Feature reviewer-toggle is dropped; nothing of it is carried here.

## 6. Decision: module ownership, layers, names

| Owner | Holds | Public interface |
|---|---|---|
| `apis/server/bff` (new; server-only) | the pipeline of `docs/apps/web/FLOW.md` in order, the error list, the rate limiter, the visitor IP | `defineBffRoute({ methods, bucket, bodySchema?, humanCheckAction?, handle })`, `BffError`, `BFF_ERROR_CODES` |
| `apis/server/restful` (new; server-only) | the cms-api REST calls of section 2 and Cloudflare siteverify | `cmsApiClient` (`logIn`, `verifyTwoFactor`, `sendEmailChallenge`, `refreshSession`, `logOut`, `readCurrentAccount`, `readLiveHealth`), `verifyHumanCheck` |
| `apis/server/graphql` (existing) | server GraphQL calls | `requestGraphqlOnServer` gains an optional `accessToken` (then no data cache); additive |
| `features/session` | who is signed in: sealed cookies, session read, refresh, sign-in and sign-out (server); the session context and BFF calls (browser) | server: `readWebSession`, `logIn`, `sendEmailCode`, `verifyTwoFactor`, `logOut`; browser facade `index.ts` unchanged in kind (`WebSessionProvider`, `useWebSession`, `PrivilegedAccessError`) |
| `features/auth` | the login dialog, the 2FA step, Turnstile in the browser | `WebLoginDialog` |
| `features/status` | service health (server function for the route; browser query) | `readServiceHealth` (server), `fetchLiveHealth`, `HEALTH_QUERY_KEYS` |
| `features/cv` | CV data (server render and `GET /api/v1/cv`) | `loadCvPage`, `loadCvPageForSession`, `mainResumeOf` |
| `views/status`, `views/cv` | the homepage status view; the `/cv` page view | `StatusView`, `CvView` |

- Layers (web RULES): `app/` → `features/*` → `features/session` → `apis/` → `libs/`, `utils/` → `configs/`. `apis/server/**` imports no feature. A route file only binds its path to `defineBffRoute(...)` with one feature server function, imported from that feature's `*.server.ts` file (server files never appear in a feature's `index.ts`, which client code imports).
- Names: `defineBffRoute`, `BffError`, `BFF_ERROR_CODES`, `bucket` (`auth` | `read`), `humanCheckAction` (`login` | `two-factor`), `humanCheckToken` (request field), `SealedWebSession`, `SealedTwoFactorChallenge`, `sealCookieValue` / `openCookieValue`, `readWebSession`, `visitorIpOf`, `FixedWindowRateLimiter`. Constants: cookie names, `TWO_FACTOR_COOKIE_MAX_AGE_SECONDS` (300), `ACCESS_REFRESH_LEAD_MS` (30 000), `REFRESH_RESULT_SHARE_MS` (10 000) in `configs/Auth.constants.ts`; `BFF_BODY_MAX_BYTES` (8 192), `BFF_RATE_LIMITS` (`auth` 20 / 60 s, `read` 120 / 60 s), `RATE_LIMIT_MAX_KEYS` (10 000) in `configs/Http.constants.ts`; siteverify URL and the two actions in `configs/Security.constants.ts` `TURNSTILE`; cms-api server paths and `BFF_ENDPOINTS` in `configs/Api.endpoints.ts` (the one endpoint map).

## 7. Extension path

- A new BFF endpoint: one route file, one feature server function, one cms-api client method (and its path in `Api.endpoints.ts`), one row in api-contract; at most 4 product files, no pipeline change.
- A new pipeline option (another bucket, another human-check action): one constant and one optional field of `defineBffRoute`; existing routes unchanged.
- A new sealed field (remember-me RM-6): one optional field in the sealed shape, read with a default; the cookie writer is the only place that sets attributes.
- A new BFF version (`/api/v2`): a new `BFF_BASE_PATH` value and route folder `app/api/v2/`; the two header literals (proxy matcher, `next.config.ts` source) already cover `/api/`.
- A second replica would need a shared store for the rate limiter and the refresh map; both sit behind one small class each, so only they change.

## 8. File map (apps/web/src; tests next to each file; module docs per task)

As built by web-bff-hardening; since 2026-11-06 (web-api-path) the route files below live under `app/api/v1/` instead of `app/bff/v1/`.

| Task | Files |
|---|---|
| WBH-1 | new `apis/server/bff/BffRoute.server.ts`, `apis/server/bff/Bff.errors.ts`, `apis/server/bff/RateLimit.rules.ts`, `apis/server/bff/ClientIp.rules.ts`; `configs/Server.env.ts`, `configs/Http.constants.ts`; `apps/web/.env.example` |
| WBH-2 | new `apis/server/restful/CmsApi.client.ts`, `apis/server/restful/Turnstile.client.ts`; `apis/server/graphql/Graphql.server.ts`, `apis/server/bff/BffRoute.server.ts` (human-check step), `configs/Api.endpoints.ts`, `configs/Security.constants.ts`, `configs/Server.env.ts` (production guard, §2.6), `.env.example` (`ALLOW_TURNSTILE_TEST_SECRET`) |
| WBH-3 | new `features/session/SealedCookie.server.ts`, `features/session/WebSession.server.ts`; `configs/Auth.constants.ts` |
| WBH-4 | new `features/session/SignIn.server.ts`; new `app/bff/v1/session/route.ts`, `app/bff/v1/auth/login/route.ts`, `app/bff/v1/auth/two-factor/email-code/route.ts`, `app/bff/v1/auth/two-factor/verify/route.ts`, `app/bff/v1/auth/logout/route.ts` |
| WBH-5 | new `features/status/Health.server.ts`, `app/bff/v1/health/route.ts`, `app/bff/v1/cv/route.ts`; `features/cv/CvPage.server.ts` |
| WBH-6 | `apis/client/Api.client.ts`, `apis/client/ApiFailure.errors.ts`, `features/session/Auth.api.ts`, `features/session/WebSession.context.tsx`, `features/session/index.ts`, `features/session/Session.fixture.tsx`, `features/auth/LoginAlerts.rules.ts` |
| WBH-7 | moved to `features/auth/`: `TurnstileWidget.tsx`, `useHumanCheck.tsx`, `Turnstile.client.ts`; `features/auth/WebLoginDialog.tsx`, `features/auth/TwoFactorStep.tsx`, `features/auth/useEmailCode.ts`, `components/layouts/AccountMenu.tsx`, `configs/Copy.constants.ts`; deleted: the rest of `features/reviewer/`, `configs/Reviewer.constants.ts`, `components/layouts/AccountMenu.reviewer.test.tsx` |
| WBH-8 | `app/page.tsx`, new `app/cv/page.tsx`, `views/status/StatusView.tsx` (from `StatusCard.tsx`), `features/status/Health.api.ts`, `views/cv/useCvContent.ts`, `configs/Server.env.ts`, `configs/Copy.constants.ts`, `app/layout.tsx` (the header CV link next to the account menu, Q-WBH1); deleted: `app/status/page.tsx` (+ test), `apis/client/Graphql.client.ts` (+ test) |
| WBH-9 | `configs/Browser.env.ts`, `proxy.ts`, `utils/ContentSecurityPolicy.rules.ts`, `configs/SecurityHeaders.constants.ts`, `apps/web/next.config.ts`, `apps/web/Dockerfile`, `apps/web/turbo.json`, `apps/web/vitest.config.ts`; `apps/cms-admin/vite.config.ts` (dev `/api` proxy, Q-WBH4), `apps/cms-admin/.env.example` |
| WBH-10 | `docker-compose.smoke.yml`, `scripts/smoke.sh`, `scripts/dev-stack.sh`, `scripts/lib/stack-seed.sh`, `apps/e2e/src/E2e.env.ts` and `apps/e2e/.env.example` (`E2E_WEB_URL`, two lines) |
| WBH-11 | `.github/workflows/_publish.yml`, `.github/scripts/build-args.sh` (+ test), `docs/deployments/{traefik,configmaps,secrets,kubernetes,ci-cd,devops-runbook}.md`, `docs/guidelines/local-run.md`, `docs/apps/web/patch-web-0.1.0.md`, `docs/apps/cms-api/patch-cms-api-0.1.0.md`, `docs/apps/cms-admin/patch-cms-admin-0.1.0.md` (Q-WBH2), `CHANGELOG.md` |

New word: none (`server`, `client`, `rules`, `errors`, `constants`, `endpoints`, `env` are in the vocabulary). New module root: `apps/web/src/apis/server` gets a module doc (`.claude/bin/module-index --new`, WBH-1).

## 9. Consequences

- The web browser holds no token; XSS on the public site can act only through the BFF's fixed endpoints, never read a token.
- cms-api is unreachable from the public host; cms-admin, the deploy docs, smoke, the dev stack and the e2e env move to the admin host in one feature.
- The rate limiter and the refresh map are per process: correct only with one web replica (stated in the deploy docs).
- Each signed-in page read costs a `GET /auth/me`; acceptable for a reader-only site.

## 10. Questions

Answered by the user 2026-11-05 (`.agent-state/features/web-bff-hardening/handoff.md` "User answers (2026-11-05)"), each as recommended:

- Q-WBH1: a "CV" link in the site header next to the account menu; `/` stays status-only.
- Q-WBH2: the DevOps patch files use repo version `0.1.0`.
- Q-WBH3: `verifyHumanCheck` always checks `success`, `action` and (when `TURNSTILE_EXPECTED_HOSTNAME` is set) the hostname; only the `action` comparison is skipped, and only when `TURNSTILE_SECRET_KEY` equals the published Cloudflare always-pass test secret (named constant `TURNSTILE.ALWAYS_PASS_TEST_SECRET` in `configs/Security.constants.ts`).
- Q-WBH4: a dev-only `/api` proxy in `apps/cms-admin/vite.config.ts` (`DEV_API_PROXY_TARGET`), never in a build.
- Q-WBH5: qc deletes the web-only reviewer e2e specs and keeps the cms-admin Reviewer page checks, asking before each delete.

Open:

- Q-WBH6 (planner 2026-11-05): confirm the §2.6 production guard (opt-in `ALLOW_TURNSTILE_TEST_SECRET=smoke`, hostname required in production). Recommended: yes.
