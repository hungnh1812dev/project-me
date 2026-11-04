# Success criteria (each one is an automated test)

Part of the [project spec](../../SPEC.md); moved from the old SPEC §12. Global: it applies to every flow in `docs/flows/`. Numbers are kept, so `§12-n` means criterion n here. The tests that prove each criterion: [docs/modules/success-criteria.md](../modules/success-criteria.md).

1. The owner can be created once: by `owner:bootstrap` or by `POST /setup/owner` with the valid setup token. A second attempt by either path fails; concurrent attempts (route + CLI) give exactly one owner. The setup route answers 401 for a wrong token, 404 when no token is configured or an owner exists. No other HTTP route can create an owner.
2. No self-registration route (`POST /auth/register` → 404).
3. A reviewer session reads published content only; masked fields stay `***`; `status=draft` → 403; any write → 403.
4. A role without read on a field gets `***`/`null` plus `_maskedFields`. Filter or sort on that field → 400. A 409 conflict body for that role has no raw value of that field.
5. A PUT resending `"***"` for a masked field leaves the DB value unchanged. A PUT with a non-writable, non-masked field → 400.
6. After a token's creator loses `delete` permission, the token gets 403 on delete. Disabled creator → token gets 401.
7. An admin cannot change their own role's permissions, cannot assign `admin`/`owner`, and cannot manage another admin or that admin's tokens.
8. A spoofed `X-Forwarded-For` doesn't change the rate-limit key (with the documented hop count).
9. The 6th wrong OTP for a code fails even when correct. A 6th OTP issue within the hour → 429. Responses for unknown emails can't be told apart from known ones.
10. Reusing a rotated refresh token revokes the family. After a password reset, old access tokens → 401 on the next request.
11. A role/permission change takes effect on the next request (single replica).
12. Two concurrent publishes never produce two published rows (partial unique index). Publish with a stale `expectedVersion` → 409.
13. A file whose bytes don't match an allowlisted type → 415. SVG → 415. Stored images have no EXIF. Deleting a referenced file → 409.
14. Richtext `<img onerror>` / `<script>` is stripped when stored and not executed on web.
15. With `NODE_ENV=production`, startup fails when `MAIL_PROVIDER=console` or a secret is missing.
16. `cv-page.json` generates exactly the 8 tables in §8.2. A schema whose composed name exceeds 63 bytes fails generation with a clear error.
17. `POST /api/v1/auth/login/` (trailing slash) through the Traefik-like proxy test returns 200/401, never 3xx.
18. Every security event in D15 writes an `audit_logs` row, even when activity tracking is `none`.
19. GraphQL returns the same masked values and `_maskedFields` as REST for each role; filter/sort on an unreadable field → `FIELD_NOT_READABLE`; a hidden content type gives the same error as an unknown one; `status: DRAFT` as anonymous/reviewer → `FORBIDDEN`; introspection refused with `NODE_ENV=production`; each D18 limit rejects an over-limit query before any SQL runs.
20. With `REVIEWER_FEATURE_ENABLED` unset or `false`: each reviewer route → `404 REVIEWER_FEATURE_OFF`; a reviewer token issued while it was on → 401; the cleanup job is not started (D2a). _(Amended 2026-10-31: the web `/status` clause is retired with `WEB_STATUS_PAGE_ENABLED`, D21.)_
21. The public site's browser sends no request to a cms-api path: on the web origin every XHR/fetch goes to `/bff/v1/*` (e2e network log); the web bundle and HTML contain no cms-api URL; with Q-BFF1, `GET https://domain.com/api/v1/health/live` through the proxy is answered by web (404), not cms-api.
22. Web sign-in: the browser receives no access or refresh token (response bodies, `document.cookie`, storage); the only auth cookies are `__Host-abyss_web_session` / `__Host-abyss_web_2fa` with `HttpOnly; Secure; SameSite=Strict; Path=/` and no `Domain`; a tampered or swapped cookie counts as signed out; two parallel session reads with a due refresh keep the visitor signed in (no family revocation); a privileged account gets `403 BFF_PRIVILEGED_ACCOUNT` and no cookie; sign-out clears both cookies and the refresh token no longer works at cms-api.
23. Every state-changing BFF route refuses a foreign or missing `Origin` (403), a non-JSON body (415), a body over 8 KiB (413), unknown keys (400) and the 21st `auth` request from one IP within 60 s (429 with `Retry-After`); a spoofed `X-Forwarded-For` changes neither the BFF's rate-limit key nor the IP cms-api sees (with the documented hop count); no BFF response carries an upstream body, header, stack or URL.
24. Login, email code and 2FA verify refuse a missing, failed, reused or wrong-action Turnstile token before any cms-api call (`400 BFF_HUMAN_CHECK_FAILED`), and fail closed when siteverify is unreachable (503).
25. The web serves no reviewer entry and no `/status` route (404); the homepage shows the service status card, which reads `GET /bff/v1/health` and stays visible when the CV cannot load; web responses carry the D17 headers including `Cross-Origin-Opener-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY` and a CSP whose `connect-src` is `'self'` (plus `ws:` in dev only).
26. cms-admin sign-in (§16 acceptance 4, 5): `POST /auth/login` with `rememberMe: true` sets `__Secure-abyss_rt` with `Max-Age=604800`; with `false` or absent it is a session cookie (no `Max-Age`, no `Expires`); refresh and both 2FA paths keep the family's mode; a not-remembered refresh token presented 12 hours plus 1 s after its last rotation → 401 and the cookie is cleared, while a remembered one still rotates.
27. Web sign-in (§16 acceptance 10): unticked, with and without 2FA, `__Host-abyss_web_session` is a session cookie; ticked, it expires about 7 days from now; a BFF refresh keeps each mode; the browser still holds no access or refresh token (criterion 22).

## By flow

| Flow                                                  | Criteria                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| [sign-in](../flows/sign-in/SPEC.md)                   | 10, 17, 22, 24, 26, 27                                                 |
| [password](../flows/password/SPEC.md)                 | 9, 10                                                                  |
| [owner-setup](../flows/owner-setup/SPEC.md)           | 1                                                                      |
| [access-admin](../flows/access-admin/SPEC.md)         | 2, 6, 7, 11                                                            |
| [content-modeling](../flows/content-modeling/SPEC.md) | 16                                                                     |
| [content-editing](../flows/content-editing/SPEC.md)   | 4, 5, 12, 14                                                           |
| [media](../flows/media/SPEC.md)                       | 13                                                                     |
| [public-site](../flows/public-site/SPEC.md)           | 14, 19, 21, 25                                                         |
| [reviewer](../flows/reviewer/SPEC.md)                 | 3, 20                                                                  |
| [security-audit](../flows/security-audit/SPEC.md)     | 18                                                                     |
| global (no single flow)                               | 8 (client IP, D7), 15 (production guards, D17), 23 (BFF pipeline, D21) |
