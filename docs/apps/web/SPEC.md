---
app: web
summary: Next.js public site with its BFF under /bff/v1
replaces: D21
---

# web: spec

Part of the [project spec](../../../SPEC.md). App `web`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Behaviour

apps/web is the public site on `domain.com`: Next.js 16 App Router run as a standalone Node server. Server Components fetch content through GraphQL from `API_INTERNAL_URL`; the browser calls only the BFF Route Handlers under `/bff/v1` on the web origin ([stack-and-commands.md](../../global/reference/stack-and-commands.md), [api-contract.md](../../global/reference/api-contract.md) "Web BFF").

## Requirements

The decision below, plus the requirements of the flows that use the web app (Docs table of the [project spec](../../../SPEC.md)). New app-wide requirements go here with ids `WEB-<n>`.

## Decisions

**D21 Web BFF and web hardening (added 2026-10-31, user request Q7; ADR 0017 holds design, module map, file map; feature `web-bff-hardening`).** Pending Q-BFF1..Q-BFF5 (ADR 0017 "Questions"); follows the recommended answers.

- **Topology.** The BFF is part of apps/web: Next.js Route Handlers under `/bff/v1`, same Node server and origin. The browser calls only the web origin; no browser code knows a cms-api URL (`NEXT_PUBLIC_API_BASE_URL`, `DEV_API_PROXY_TARGET` retired). The BFF reaches cms-api only on `API_INTERNAL_URL` (cluster-local Service URL), never following redirects. Q-BFF1 (recommended yes): Traefik serves no cms-api route on `domain.com`; cms-api's public route moves to `admin.domain.com/api` for cms-admin (same-origin, no cms-api code change); a NetworkPolicy lets only Traefik and web pods reach cms-api.
- **Endpoints** (§9 "Web BFF"): `GET /health`, `GET /session`, `POST /auth/login`, `POST /auth/two-factor/email-code`, `POST /auth/two-factor/verify`, `POST /auth/logout`, `GET /cv`; each one fixed cms-api call; no generic proxy, no GraphQL passthrough.
- **Session.** No token in the browser. `__Host-abyss_web_session` holds the sealed `{ refreshToken, accessToken, accessExpiresAt, rememberMe }`; `__Host-abyss_web_2fa` the sealed 2FA challenge for 300 s, which also carries `rememberMe` from `POST /bff/v1/auth/login` (`rememberMe?`) to verify. Both `HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`. `__Host-abyss_web_session` is a browser-session cookie (no `Max-Age`, no `Expires`) unless remembered, then `Max-Age` 7 days, set again on each refresh (amended 2026-11-03, Q-RM7, §16 RM-6). Sealed with AES-256-GCM, key derived from `WEB_SESSION_SECRET` (required, ≥ 32 bytes in production, else start fails), cookie name as additional data; a cookie that does not open counts as absent and is cleared. Refresh when the access token has < 30 s left; concurrent refreshes of one token share one in-process call and its result for 10 s (D9 family revocation never fires on a race; single replica, like D16). Accounts with any permission other than `read` are signed out at cms-api and refused (`403 BFF_PRIVILEGED_ACCOUNT`) after login, after 2FA and on every session read. Sign-out calls cms-api logout and always clears both cookies.
- **Pipeline on every BFF route, in order:** allowed method only · state-changing routes need `Origin` exactly `WEB_ORIGIN` and `Sec-Fetch-Site` (when sent) `same-origin` · POST bodies `application/json` only, never CORS headers · body ≤ 8 KiB · per-IP fixed-window rate limit (`auth` 20 / 60 s, `read` 120 / 60 s, at most 10 000 keys) · Zod schema per body, unknown keys refused, lengths capped · Turnstile check where needed · upstream call with `API_TIMEOUT_MS`, forwarded client IP (D7), only the headers that call needs · answer with allowlisted fields, errors `{ statusCode, errorCode, message }` from the ADR 0017 §3 list, `Cache-Control: no-store` · log route and error code of refused requests, never bodies, tokens, codes, cookies, emails or passwords.
- **Human check.** Cloudflare Turnstile on the login form (`login`) and in the 2FA popup (`two-factor`: sending the email code and verifying, a fresh token each, Q-BFF3). The BFF verifies server-side (`siteverify` with `TURNSTILE_SECRET_KEY` in the web server env, `remoteip`, expected `action`, `hostname` = `TURNSTILE_EXPECTED_HOSTNAME` when set) before any cms-api call; failure `400 BFF_HUMAN_CHECK_FAILED`, siteverify unreachable `503 BFF_HUMAN_CHECK_UNAVAILABLE` (fail closed). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` required at build. Dev, demo and smoke use Cloudflare's published always-pass test keys. The widget script loads only while the login dialog is open.
- **Reviewer mode on web is removed**, not paused (ADR 0017 §5); Turnstile widget and hook move to `features/auth`. cms-api's reviewer module, cms-admin's Reviewer page and `REVIEWER_FEATURE_ENABLED` are unchanged (D2a).
- **Homepage.** `/` shows the CV and a "Service status" card like cms-admin's home, polling `GET /bff/v1/health` and showing only that path; it renders even when the CV fails to load. Always on; `/status` and `WEB_STATUS_PAGE_ENABLED` removed (Q-BFF2).
- **Web env** (server, runtime): adds `WEB_ORIGIN`, `WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME` (optional), `TRUST_PROXY_HOPS` (default 1), `CLIENT_IP_HEADER` (optional); removes `WEB_STATUS_PAGE_ENABLED`, `NEXT_PUBLIC_API_BASE_URL`, `DEV_API_PROXY_TARGET`. Invalid values fail start (instrumentation), as today.
- **Note (2026-11-03, Q-RM7):** ADR 0017 is to be rewritten when web-bff-hardening is re-planned (the file is missing from `docs/adr/`); the rewrite includes §16 RM-6.

## Change log

- 2026-10-31 Web BFF and web hardening (D21, ADR 0017).
- 2026-11-04 Created from the old SPEC.
