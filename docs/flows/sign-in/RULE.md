# Sign-in: rules

Part of the [project spec](../../../SPEC.md). Flow `sign-in`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. A session starts only in `AuthService.startSession` (password login and `TwoFactorLoginService`) (RM-1).
2. Unknown, wrong and inactive accounts get the same answer; exactly one Argon2id verify per login (D8).
3. On a 2FA sign-in the remember-me choice comes from the signed temp token claim `rm` (web: the sealed `__Host-abyss_web_2fa` cookie), never from the verify request body (RM-1, RM-6).
4. The remember-me choice belongs to the refresh token family: every rotation copies `remember_me` and sets the cookie in the same mode with that mode's lifetime (D22, RM-2).
5. cms-api alone enforces the session lifetime (`expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes (D22).
6. Refresh tokens rotate with `family_id`; reusing a rotated token revokes the family and bumps `token_version` (D9).
7. The refresh cookie is accepted only on `/api/v1/auth/refresh` and `/logout`, with `Origin` in the allowlist (D14).
8. Login success and failure write audit rows in the same transaction; `auth.login_succeeded` metadata holds `rememberMe` and `twoFactorMethod` (D15, RM-4).
9. Every web BFF route runs the D21 pipeline in its order; Turnstile is checked server-side before any cms-api call, and fails closed (D21).

## Must never

1. Give the web browser an access or refresh token (body, `document.cookie` or storage) (D21, criterion 22). cms-admin keeps its access token in memory only (D14).
2. Store the email or the remember-me choice in the browser, or pre-tick "Keep me signed in" (§ Behaviour of [SPEC.md](SPEC.md), Q-RM3, Q-RM4).
3. Learn the cookie mode in the BFF by parsing cms-api's `Set-Cookie` (RM-3).
4. Change cookie names, flags or paths, or the rotation and reuse rules, as part of a sign-in change (D22).
5. Log tokens, codes, cookies, emails or passwords ([boundaries](../../global/boundaries.md), D21 pipeline).

## Ask first

- Any TTL, cookie or 2FA temp-token value in [canonical-values.md](../../global/canonical-values.md).

## Global decisions this flow follows

D7 (client IP and rate limits), D8, D9, D14, D15, D17 (headers, CSP), D21.

## Decisions owned by this flow

**D22 Remember me (added 2026-11-03, user request, approved 2026-11-03; §16, feature `remember-me`).** "Keep me signed in" is a choice per sign-in, stored on the refresh token family (`refresh_tokens.remember_me`) and copied on every rotation; on two-factor sign-ins it travels in the signed 2FA temp token (claim `rm`). Remembered: persistent cookie (`Max-Age` 7 days) and 7-day sliding server lifetime; not remembered (default): session cookie and 12-hour sliding server lifetime. cms-api alone enforces the lifetime (`expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes. Cookie names, flags and paths, rotation and reuse detection (D9) and every other session rule are unchanged.
