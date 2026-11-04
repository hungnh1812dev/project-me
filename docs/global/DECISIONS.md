---
summary: Decisions that cover several apps, the index of every D id, and the decided questions that cover several flows
replaces: §7, D7, D13, D14, D17, §14 Q1, §14 Q4, §14 Q10, §14 Q-W4
---

# Decisions

Part of the [project spec](../../SPEC.md). A decision is the record of what was decided, when and by whom, and is kept as written; the rules that follow from it are in the `RULES.md` files. A decision owned by one app or flow lives in the Decisions section of that app's or flow's `SPEC.md`.

## Where each decision lives

Security decisions (fixes for review findings C1–C8 and related; old SPEC §7):

| Id      | Decision                                    | Lives in                                                            |
| ------- | ------------------------------------------- | ------------------------------------------------------------------- |
| D1      | Owner bootstrap                             | [flows/owner-setup/SPEC.md](../flows/owner-setup/SPEC.md)           |
| D2, D2a | Reviewer isolation, reviewer feature switch | [flows/reviewer/SPEC.md](../flows/reviewer/SPEC.md)                 |
| D3      | Field-level reads                           | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D4      | Write allowlist                             | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D5      | API tokens                                  | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D6      | Role hierarchy                              | [flows/access-admin/SPEC.md](../flows/access-admin/SPEC.md)         |
| D7      | Client IP                                   | below                                                               |
| D8      | Credentials and OTP                         | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D9      | Sessions and revocation                     | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D10     | Content engine                              | [flows/content-modeling/SPEC.md](../flows/content-modeling/SPEC.md) |
| D11     | Draft/publish integrity                     | [flows/content-editing/SPEC.md](../flows/content-editing/SPEC.md)   |
| D12     | Media                                       | [flows/media/SPEC.md](../flows/media/SPEC.md)                       |
| D13     | Richtext/XSS                                | below                                                               |
| D14     | Topology and CSRF                           | below                                                               |
| D15     | Audit                                       | [flows/security-audit/SPEC.md](../flows/security-audit/SPEC.md)     |
| D16     | Presence                                    | [flows/content-editing/SPEC.md](../flows/content-editing/SPEC.md)   |
| D17     | Production guards                           | below                                                               |
| D18     | GraphQL read API                            | [flows/public-site/SPEC.md](../flows/public-site/SPEC.md)           |
| D19     | Database roles                              | [apps/cms-api/SPEC.md](../apps/cms-api/SPEC.md)                     |
| D20     | Backup download                             | [flows/backups/SPEC.md](../flows/backups/SPEC.md)                   |
| D21     | Web BFF and web hardening                   | [apps/web/SPEC.md](../apps/web/SPEC.md)                             |
| D22     | Remember me                                 | [flows/sign-in/SPEC.md](../flows/sign-in/SPEC.md)                   |

## Security decisions that cover several apps

**D7 Client IP (C8).** `TRUST_PROXY_HOPS` (default `1`), not `true`. Deploy docs require `externalTrafficPolicy: Local` on the Traefik service, and `CF-Connecting-IP` when Cloudflare is in front (`CLIENT_IP_HEADER`). Rate limits keyed by real IP **and** account/email. _Amended 2026-10-31 (D21):_ the web BFF derives the visitor IP by the same keys and rules (`CLIENT_IP_HEADER`, else `TRUST_PROXY_HOPS` from the right of `X-Forwarded-For`) and sends cms-api exactly one `X-Forwarded-For: <ip>` (plus `<CLIENT_IP_HEADER>: <ip>` when set), so cms-api limits stay per visitor, never per web pod.

**D13 Richtext/XSS.** Sanitized on the server when written (allowlist via `sanitize-html`) and again by the web when rendering (DOMPurify). No global "XSS pipe" rewriting all input.

**D14 Topology and CSRF.** The API accepts the refresh cookie only on `/api/v1/auth/refresh` and `/logout`, which also require `Origin` ∈ the allowlist. The access token lives in memory and travels as a Bearer header. Admin has its own subdomain so XSS in public content can't run in the admin origin. _Amended 2026-10-31 (D21, ADR 0017):_ this browser-token model now covers cms-admin only. On web the browser holds no token: the BFF keeps the cms-api access and refresh tokens in the sealed `__Host-abyss_web_session` cookie, calls cms-api server-to-server and sends `Origin: <WEB_ORIGIN>` on refresh and logout (cms-api's `cookieOrigins` keep `WEB_ORIGIN` for that). The BFF's CSRF defense: `SameSite=Strict`, an exact `Origin` check, JSON-only bodies (D21).

**D17 Production guards (config fail-fast).**

- With `NODE_ENV=production`, Zod rejects `MAIL_PROVIDER=console`, any missing secret, and secrets under 32 bytes. The boot config summary redacts secrets.
- `OWNER_SETUP_TOKEN` is optional; set with `NODE_ENV=production`, it must be ≥ 32 bytes (D1).
- `ALLOW_ACCOUNT_SEED` is not an app setting: the server schema does not accept it, and it never appears in `.env.example`, the smoke env file, compose or Kubernetes manifests. Only `seed:account` reads it, passed on one invocation, and it must equal exactly `smoke` (D1).
- Headers on every app: HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, no `X-Powered-By`.
  - **API**: `default-src 'none'` on every route, `/graphql` included.
  - **cms-admin**: CSP from its nginx config (unchanged): `script-src 'self'`, `connect-src` from env, `img-src` includes Cloudinary. No `'unsafe-eval'`: the bundle must not call `eval` or `new Function`, so Zod runs `jitless` (its eval probe is reported as a CSP violation even when caught; ADR 0015, 2026-10-28).
  - **web (Next.js)**: CSP from `src/proxy.ts` with a fresh per-request nonce: `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ the Turnstile origin, named constant), `connect-src` from env, `img-src` includes Cloudinary, `frame-ancestors 'none'`, `style-src` per Q-W4 (open: recommended `'self' 'nonce-<n>'` + `style-src-attr 'unsafe-inline'`). HSTS, nosniff, Referrer-Policy and `poweredByHeader: false` from `next.config.ts`. Nonce pages render per request; the data cache still bounds cms-api calls. `/_next/static` is outside the proxy matcher. Approved by the user 2026-10-21 (Q-W4). _Amended 2026-10-31 (D21):_ `connect-src 'self'` only (plus `ws:` in dev; no API origin, `NEXT_PUBLIC_API_BASE_URL` retired); the matcher also skips `bff/`; added `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `X-Frame-Options: DENY`; BFF responses carry `Cache-Control: no-store`.

## Decided questions that cover several flows

Questions owned by one flow are in the Decisions section of that flow's `SPEC.md`.

| #    | Question                                                                                       | Recommendation                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Q1   | Use Kysely for content queries (new dependency) instead of Prisma for content tables?          | Yes: Prisma can't model runtime-defined tables safely; Kysely keeps parameterized, typed-ish SQL                               |
| Q4   | Real domain names, and is Cloudflare in front (affects `CLIENT_IP_HEADER` and Turnstile keys)? | —                                                                                                                              |
| Q10  | List pagination style (convention for documents, media, audit logs)?                           | Offset: `page` (default 1), `pageSize` (default 20, max 100), response `meta { page, pageSize, total }`                        |
| Q-W4 | Web CSP `style-src` (D17)                                                                      | `'self' 'nonce-<n>'` plus `style-src-attr 'unsafe-inline'` (React/Radix inline style attributes; attributes cannot run script) |
