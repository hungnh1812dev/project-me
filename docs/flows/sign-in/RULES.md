# Sign-in: rules

Part of the [project spec](../../../SPEC.md). Flow `sign-in`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. A session starts only in `AuthService.startSession` (password login and `TwoFactorLoginService`) (RM-1).
2. On a 2FA sign-in the remember-me choice comes from the signed temp token claim `rm` (web: the sealed `__Host-abyss_web_2fa` cookie), never from the verify request body (RM-1, RM-6).
3. The remember-me choice belongs to the refresh token family: every rotation copies `remember_me` and sets the cookie in the same mode with that mode's lifetime (D22, RM-2).
4. cms-api alone enforces the session lifetime (`expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes (D22).
5. `auth.login_succeeded` metadata holds `rememberMe` next to `twoFactorMethod` (RM-4).

## Must never

1. Store the email or the remember-me choice in the browser, or pre-tick "Keep me signed in" (Q-RM3, Q-RM4).
2. Learn the cookie mode in the BFF by parsing cms-api's `Set-Cookie` (RM-3).
3. Change cookie names, flags or paths, or the rotation and reuse rules, as part of a sign-in change (D22).

## Ask first

- Any TTL, cookie or 2FA temp-token value in [canonical-values.md](../../global/reference/canonical-values.md).

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7), browser tokens and CSRF (D14), headers (D17).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): credentials (D8), sessions and revocation (D9).
- [apps/web/RULES.md](../../apps/web/RULES.md): BFF (D21).
- [apps/cms-admin/RULES.md](../../apps/cms-admin/RULES.md): tokens and requests.
- [security-audit](../security-audit/RULES.md): audit rows (D15).
