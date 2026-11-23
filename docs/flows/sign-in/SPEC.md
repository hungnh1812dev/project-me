---
flow: sign-in
replaces: §16, §16.1, §16.2, §16.3, §16.4, §16.5, §16.6, RM-1..RM-6, Q-RM1..Q-RM8, D22
summary: Login with password and the 2FA step, remember me, refresh, sign-out; cms-admin and the web BFF
---

# Sign-in: spec

Part of the [project spec](../../../SPEC.md). Flow `sign-in`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

An invited account signs in with email and password, then with a second factor when 2FA is on, in cms-admin and on the web site (through the web BFF). The session is a short access token plus a rotating refresh token; refresh, sign-out and session revocation keep the rules of D9 and D14, and the web BFF holds every token server-side (D21). Endpoints: [api-contract.md](../../global/reference/api-contract.md) rows "Auth" and "Web BFF". Values (TTL, cookie, 2FA temp token): [canonical-values.md](../../global/reference/canonical-values.md).

### Remember me

Scope (Q-RM1, user): both sign-ins, cms-admin and apps/web, with the cms-api identity module behind them. Today every cms-admin sign-in sets the refresh cookie `__Secure-abyss_rt` with `Max-Age` = 7 days (`setRefreshCookie`, `http/Auth.controller.ts`) and every refresh token row lives 7 days, sliding on each rotation: every user is always remembered. This section makes that a choice on each sign-in form and sets the remembered lifetime to 30 days (user 2026-11-06).

**Dependency on web-bff-hardening.** The web part (RM-6) is written against the web BFF of D21 (`/api/v1/auth/login`, the sealed `__Host-abyss_web_session` cookie), built by feature `web-bff-hardening` (done 2026-11-05) under the `/api/v1` paths of feature `web-api-path` (done 2026-11-06). The cms-api part (RM-1..RM-4) and the cms-admin part (RM-5) do not depend on it. Delivery (Q-RM6, user): one feature `remember-me` with two phases: phase 1 cms-api + cms-admin (RM-1..RM-5), phase 2 apps/web (RM-6), built only after web-bff-hardening is done. The feature enters `.agent-state/features.md` as `todo` (approved 2026-11-03).

| Choice on the sign-in form | Browser cookie (cms-admin: `__Secure-abyss_rt`; web: `__Host-abyss_web_session`) | Server-side refresh token lifetime (cms-api) | After the browser closes |
|---|---|---|---|
| "Keep me signed in" ticked | persistent: `Max-Age` = `REFRESH_TOKEN_TTL_MS` (30 days, §6), set again on every refresh | 30 days, sliding on every rotation | still signed in, until 30 days without use |
| not ticked (default, Q-RM3) | session cookie: no `Max-Age`, no `Expires` | `SESSION_REFRESH_TOKEN_TTL_MS` = 12 hours, sliding on every rotation (Q-RM2) | signed out; a browser that restores session cookies still loses the session 12 hours after the last use |

- The choice belongs to the session (the refresh token family), not to the account or the device: each sign-in decides again, and the form never pre-ticks the box from an earlier choice.
- Every rotation keeps the family's choice: the successor row copies it, and the new cookie is set in the same mode with the lifetime of that mode. The reuse grace path sets no cookie (unchanged).
- cms-api is the one place that enforces the lifetime (the refresh token row's `expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes.
- Unchanged by this section: access token TTL (15 min), cookie names, flags and paths (`__Secure-abyss_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, host-only; `__Host-abyss_web_session` and `__Host-abyss_web_2fa` as in D21), the 300 s web 2FA cookie, rotation and reuse detection (D9), logout, `POST /accounts/:id/sessions/revoke`, the `token_version` bump on password change or reset, rate limits, the Origin allowlist (D14), the BFF pipeline and Turnstile checks (D21).
- Neither app stores the email or the choice anywhere in the browser (Q-RM4); cms-admin keeps the access token in memory only (unchanged).

### Remember me on iOS Safari

Report (user, 2026-11-22; Q-RM9, Q-RM10): in cms-admin on iOS Safari, a sign-in with "Keep me signed in" ticked shows the sign-in page again after the admin page is reloaded. On a reload, cms-admin's start-up silent refresh (`POST /api/v1/auth/refresh` with `__Secure-abyss_rt`) should start the session again in both modes (acceptance 8), so the remembered cookie is lost, not sent, refused, or ignored. Acceptance 8 runs on Chromium only, so no test covers WebKit. The web site is out of scope; its sign-in is read only when a cause in a shared part (cms-api identity) needs it as evidence.

Causes to rule in or out (RM-7), from the code as built:

| Id | Cause | Where | How it shows |
|---|---|---|---|
| IOS-1 | Cross-origin API on the deployed build: the deployed cms-admin is built with `VITE_API_BASE_URL` = `https://api.<domain>/api/v1` (Q-RM12), not the `https://admin.<domain>/api/v1` that `docs/deployments/traefik.md` requires, so every call, login and refresh included, is a credentialed CORS request and `__Secure-abyss_rt` is a cookie of `api.<domain>`, not of the admin page's origin. The two hosts are the same site, so the cookie is not third-party by site, but Safari stores or sends it from another origin under its own tracking-prevention rules: for example when `api.<domain>` and `admin.<domain>` resolve to different IP addresses (OneShield in front of one host only), or when it counts `api.<domain>` as a host the user never visited. Acceptance 8 and the web site (Q-RM12) both run on one origin and never exercise this | cms-admin build config, deployment | Web Inspector: after sign-in, no `__Secure-abyss_rt` under `api.<domain>`, or the reload's refresh to `api.<domain>` goes without it; the same build on desktop Chrome stays signed in (Q-RM14: confirmed, so the failure is Safari-only) |
| IOS-2 | Cookie stored but not sent on the reload's refresh: WebKit's `SameSite=Strict` handling (for example the admin tab was opened from a link in another app or site) or a path mismatch with `Path=/api/v1/auth` | cms-api identity cookie (D14), platform | Web Inspector, Network: the refresh request has no `Cookie` header |
| IOS-3 | Cookie sent but refused by cms-api: `403 ORIGIN_NOT_ALLOWED` from `AllowedOriginGuard` (Safari sends an `Origin` the allowlist lacks), or `401` from reuse (D9) when a reload cancels a refresh that cms-api had already rotated, after the 10 s grace | cms-api identity | refresh answer status and error code; `auth.refresh_reuse_detected` audit rows with an iPhone user agent |
| IOS-4 | Refresh answers `200`, but cms-admin still settles to signed out (start-up refresh, `/me`, or the auth state in `features/auth`) | cms-admin auth | `200` refresh in Network, then the sign-in page |

RM-7 also signs in unticked and reloads: if that fails too, the cause is the refresh on reload, not the remembered cookie mode. The report comes from a Safari tab with Private Browsing off (Q-RM11), and a 7-day tracking cap does not drop a cookie on a reload, so neither is on the list. Remember me works on the web site in iOS Safari (user, 2026-11-22): there the `SameSite=Strict` cookie is set and sent on the site's own origin with `Path=/`, and cms-api rotates the refresh token server to server. So the parts cms-admin does not share with the web come first: the cross-origin API base URL of the deployed build (IOS-1, the lead since Q-RM12), the `Path=/api/v1/auth` cookie (IOS-2), the browser-sent `Origin` on refresh (IOS-3) and the cms-admin auth state (IOS-4).

The fix (RM-8) is chosen only after RM-7 names the cause.

## Requirements

**RM-1 Login request (cms-api, identity, high-risk path, security gate).** Owner: `modules/identity`.
- `POST /auth/login` body gains the optional `rememberMe: boolean` (additive; absent = `false`). Any other type → `400 INVALID_REQUEST` (existing code and message).
- Password-only login: the session starts with that choice.
- Two-factor login: the choice travels inside the signed 2FA temp token as the claim `rm` (boolean), set by `AccessTokenService.signTwoFactorTempToken`; `POST /auth/2fa/verify` starts the session with the claim's value and never reads a choice from its own body. A temp token without `rm` (issued before the deploy) counts as `false`.
- The only places that start a session stay `AuthService.startSession` (login and `TwoFactorLoginService`); `startSession` takes the choice as one added parameter.

**RM-2 Refresh token lifetime (cms-api, identity).** Owner: `modules/identity` (`domain/Authentication.rules.ts`, `domain/Identity.constants.ts`, `application/RefreshToken.service.ts`, `adapters/PrismaRefreshToken.repository.ts`).
- `refresh_tokens` gains `remember_me boolean NOT NULL DEFAULT true` (Q-RM5) through one Prisma migration; existing rows keep `true`, which matches the persistent cookie they were issued with; their next rotation slides `expires_at` by the 30-day remembered lifetime. New rows always write the value explicitly.
- One rule, `refreshTokenTtlMsOf(rememberMe)` in `domain/Authentication.rules.ts`, gives `REFRESH_TOKEN_TTL_MS` or `SESSION_REFRESH_TOKEN_TTL_MS` (named constants in `domain/Identity.constants.ts`). `issue` and `rotate` both use it; `rotate` takes the choice from the presented row.
- The session result of login, 2FA verify and refresh carries `rememberMe`, so the controllers set the cookie without a second read.

**RM-3 Refresh cookie (cms-api, identity; tier 3 area).** Owner: `http/Auth.controller.ts` (`setRefreshCookie`, also used by `http/TwoFactor.controller.ts`).
- `setRefreshCookie(res, token, rememberMe)`: `true` → today's options plus `maxAge: REFRESH_TOKEN_TTL_MS`; `false` → the same options without `maxAge` or `expires`. `clearRefreshCookie` is unchanged.
- cms-api's JSON responses are unchanged: the web BFF learns the mode from its own sealed state (RM-6), never by parsing cms-api's `Set-Cookie` attributes.

**RM-4 Audit (cms-api, security-audit through identity).** `auth.login_succeeded` metadata gains `rememberMe` next to `twoFactorMethod` (D15). No new audit action.

**RM-5 Sign-in form (cms-admin).** Owners: `views/login/LoginPage.tsx`, `features/auth/Auth.api.ts` (`LoginCredentials` gains `rememberMe`), `configs/copy/Login.copy.ts` (and `copy.snapshot.json`).
- A checkbox under the password field, using form-commons `CheckboxInput` (the react-hook-form-bound checkbox, whose `description` is linked by `aria-describedby`; no new component): label `COPY.login.rememberMe` = "Keep me signed in", hint `COPY.login.rememberMeHint` = "Use this only on a device you trust." Unticked on every visit to the page.
- The value is sent as `rememberMe` with the email and password; the 2FA modal is unchanged (the choice is already in the temp token).
- Keyboard and screen reader: the label is the checkbox's accessible name, the hint is linked with `aria-describedby`; Space toggles; the tab order is email, password, checkbox, submit.

**RM-6 Web sign-in (apps/web; after web-bff-hardening; high-risk path `apps/web/src/features/auth`, security gate; tier 3 area).** Owners: the BFF login, 2FA verify and session code that D21 creates (`app/api/v1/auth/**/route.ts`, `apis/server/`, `features/session`) and `features/auth/WebLoginDialog.tsx` with the web copy module (`configs/Copy.constants.ts`).
- `POST /api/v1/auth/login` body gains the optional `rememberMe: boolean` (absent = `false`), added to its Zod schema (unknown keys still refused); the BFF passes it to cms-api `POST /auth/login`.
- The BFF keeps the choice in its sealed state: in `__Host-abyss_web_2fa` while the 2FA step is open, and in `__Host-abyss_web_session` as `{ refreshToken, accessToken, accessExpiresAt, rememberMe }`. `POST /api/v1/auth/two-factor/verify` takes it from the sealed 2FA cookie, never from its body.
- `__Host-abyss_web_session` is set with `Max-Age` = `REFRESH_TOKEN_TTL_MS` (30 days) when `rememberMe` is true, and as a session cookie otherwise; every BFF refresh that rewrites the cookie keeps the mode and, when remembered, sets `Max-Age` again (sliding). The 30-day value comes from one named web constant; the 12-hour limit is enforced by cms-api only.
- A sealed session without `rememberMe` (written before the deploy) counts as `false` and is rewritten as a session cookie on its next refresh.
- `WebLoginDialog`: the same checkbox and the same text as RM-5 (Q-RM8, user): label "Keep me signed in", hint "Use this only on a device you trust.", held in the web copy module, unticked every time the dialog opens, sent with the login request; the 2FA step is unchanged. It uses the web app's existing checkbox, or a native `<input type="checkbox">` styled with the web theme tokens when the web has none (no new dependency).
- `GET /api/v1/session`, sign-out, the privileged-account refusal and every other D21 rule are unchanged.

**RM-7 Diagnose remember me on iOS Safari (cms-admin auth, cms-api identity; read-only).** Reproduce the report on a real iPhone in a Safari tab against the deployed cms-admin (Safari Web Inspector from a Mac shows the cookie, the refresh request and its answer), and on Playwright WebKit against the dev stack (the WebKit project of acceptance 14) for what WebKit itself shows. First IOS-1: on the deployed build (API on `api.<domain>`, Q-RM12), see in Web Inspector whether the login answer stores `__Secure-abyss_rt` for `api.<domain>` and whether the reload's refresh sends it, and whether `api.<domain>` and `admin.<domain>` resolve to the same IP address; then repeat sign-in and reload on a build with `https://admin.<domain>/api/v1` (the dev stack, Playwright WebKit) to show the same-origin setup works. For each of IOS-1..IOS-4: ruled in or out, with the evidence (steps, cookie seen after sign-in, refresh request headers and answer, `auth.refresh_reuse_detected` audit rows and their user agents), for both the ticked and the unticked mode. No product code changes in RM-7; the result goes to the user, who approves the RM-8 scope before it is built.

**RM-8 Fix (owner: the module of the cause RM-7 finds; cms-admin, cms-api identity or the deployment docs).** Kept unless the user decides otherwise: the cookie names, flags and paths of D14 (`SameSite=Strict` included), the refresh Origin allowlist (D14), rotation and reuse detection (D9), the 30-day and 12-hour lifetimes (D22), and the access token in memory only (Q-RM4). A fix that needs one of these changed (for example `SameSite=Lax` for IOS-2, or a longer reuse grace for IOS-3) is a decision for the user first, recorded as an amendment of the decision it changes. A deployment cause (IOS-1) is fixed by building cms-admin with `VITE_API_BASE_URL` = `https://admin.<domain>/api/v1` and routing `admin.<domain>/api` to cms-api as `docs/deployments/traefik.md` already says, written as a `patch-cms-admin-<repo version>.md` in `docs/apps/cms-admin/` (and `docs/deployments/` if the route steps need a change); keeping `api.<domain>` and changing the cookie or CORS rules instead is a decision for the user first.

## Acceptance

1. Unit (cms-api): the login schema accepts `rememberMe` `true`, `false` and absent (`false`) and refuses `"true"`, `1` and `null` with `400 INVALID_REQUEST`.
2. Unit (cms-api): `refreshTokenTtlMsOf(true)` = 30 days, `refreshTokenTtlMsOf(false)` = 12 hours; `issue` writes `expires_at` and `remember_me` from the choice; `rotate` copies `remember_me` and slides `expires_at` by that mode's TTL.
3. Unit (cms-api): the 2FA temp token carries `rm` from the login request; a temp token without `rm` verifies and starts a session with `rememberMe = false`.
4. Integration (cms-api): `POST /auth/login` with `rememberMe: true` sets `__Secure-abyss_rt` with `Max-Age=2592000`; with `false` or absent the cookie has neither `Max-Age` nor `Expires`; `POST /auth/refresh` keeps the mode of the family; the TOTP and email 2FA paths behave the same; `auth.login_succeeded` metadata holds `rememberMe`.
5. Integration (cms-api): a not-remembered refresh token presented 12 hours plus 1 s after its last rotation → `401` and the cookie is cleared; a remembered one at the same time still rotates.
6. Integration (cms-api, Testcontainers): the migration gives every existing `refresh_tokens` row `remember_me = true` and changes no other column.
7. Unit (cms-admin): the checkbox renders unticked with its label and hint; submitting sends `rememberMe` `false` or `true` as ticked; the copy snapshot holds the two new strings.
8. Tier 2 browser (Chromium, cms-admin): sign in unticked → `__Secure-abyss_rt` is a session cookie (Playwright `expires === -1`); sign in ticked → it expires about 30 days from now; after a page reload both stay signed in.
9. Unit (apps/web): the BFF login schema accepts `rememberMe` `true`, `false`, absent and refuses other types; the sealed session round-trips `rememberMe`; a sealed session without it reads as `false`; the cookie writer sets `Max-Age` only when remembered; the 2FA verify route takes the choice from the sealed 2FA cookie and never reads a `rememberMe` from its body (the strict verify schema refuses it as an unknown key, D21); `WebLoginDialog` renders the box unticked and sends its value.
10. Tier 2 browser (Chromium, apps/web, after web-bff-hardening): sign in unticked, with and without 2FA → `__Host-abyss_web_session` has `expires === -1`; ticked → about 30 days; a BFF refresh keeps each mode; the browser still holds no access or refresh token (§12 criterion 22).
11. Tier 3: through the smoke proxy, both modes' `Set-Cookie` for `__Secure-abyss_rt` keep `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` and no `Domain`, and for `__Host-abyss_web_session` keep the D21 flags (`HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`); only `Max-Age` differs.
12. RM-7: a diagnosis record names, for each of IOS-1..IOS-4, ruled in or out with its evidence in both modes, and the user has approved the RM-8 scope.
13. RM-8: a test at the lowest tier that reproduces the cause found fails before the fix and passes after it (IOS-3, for example: an integration test where the refresh comes with the `Origin` Safari sent, or after a rotation the client never received).
14. Tier 2 browser (Playwright WebKit, cms-admin): `apps/e2e` gains a WebKit project used only by the sign-in remember-me specs (Q-RM13); acceptance 8 passes on it as on Chromium, a reload included.
15. Manual (user, real iPhone, Safari tab, deployed cms-admin): sign in ticked, reload → still signed in; close Safari from the app switcher and reopen the next day → still signed in; sign in unticked, reload → still signed in.

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 10, 17, 22, 24, 26, 27.

## Decisions

**D22 Remember me (added 2026-11-03, user request, approved 2026-11-03; §16, feature `remember-me`).** "Keep me signed in" is a choice per sign-in, stored on the refresh token family (`refresh_tokens.remember_me`) and copied on every rotation; on two-factor sign-ins it travels in the signed 2FA temp token (claim `rm`). Remembered: persistent cookie (`Max-Age` 30 days) and 30-day sliding server lifetime; access token 15 min in both modes; not remembered (default): session cookie and 12-hour sliding server lifetime. cms-api alone enforces the lifetime (`expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes. Cookie names, flags and paths, rotation and reuse detection (D9) and every other session rule are unchanged.

Answered by the user (2026-11-03): Q-RM1 both cms-admin and apps/web (web part after web-bff-hardening) · Q-RM2 ticked 30 days sliding (user 2026-11-06; access token 15 min), unticked a session cookie with a 12-hour sliding server lifetime · Q-RM3 unticked by default · Q-RM4 the email is not remembered; label "Keep me signed in", hint "Use this only on a device you trust." · Q-RM5 names `rememberMe`, `refresh_tokens.remember_me` (default `true` for existing rows), claim `rm`, `SESSION_REFRESH_TOKEN_TTL_MS`, `refreshTokenTtlMsOf`.

Answered by the user (2026-11-03, second round): Q-RM6 one feature `remember-me`, phase 1 cms-api + cms-admin, phase 2 apps/web after web-bff-hardening is done; added to `features.md` as `todo` only after this section is approved · Q-RM7 D21 is amended as in §16.6; ADR 0017 (cited by D21, missing from `docs/adr/`) is rewritten when web-bff-hardening is re-planned, and includes RM-6 · Q-RM8 the web dialog uses the cms-admin label and hint.

Answered by the user (2026-11-22, iOS Safari): Q-RM9 cms-admin only; the web site is out of scope unless a web-side cause is needed as evidence · Q-RM10 ticked, and the sign-in page shows again after reloading the admin page · Q-RM13 yes, a Playwright WebKit project in `apps/e2e` for the sign-in remember-me specs · Q-RM11 a Safari tab, Private Browsing off · remember me works on the web site in Safari and Chrome · Q-RM12 the deployed cms-admin build uses `VITE_API_BASE_URL` = `https://api.<domain>/api/v1`; hosting is iNet.vn with OneShield, the domain uses an A record, a CDN or CNAME in front is not known · Q-RM14 yes: on desktop Chrome the deployed cms-admin stays signed in after a reload with the box ticked, so the cause is Safari-only.

No open questions remain for RM-1..RM-6; approved by the user 2026-11-03. RM-8 waits on RM-7.

## Out of scope

Remembering the email, a trusted device that skips 2FA, a "signed-in devices" list, an absolute session cap, changing the 30-day remembered lifetime, building the web part before web-bff-hardening.

## Open questions

None.
