---
flow: sign-in
modules: apps/cms-api/src/modules/identity, apps/cms-api/src/modules/security-audit, apps/cms-admin/src/features/auth, apps/cms-admin/src/views/login, apps/web/src/features/auth, apps/web/src/features/session, packages/form-commons/src/components/forms
---

# Sign-in: flow

Part of the [project spec](../../../SPEC.md). Flow `sign-in`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Actors

- **User**: an invited account (editor, admin, owner) signing in to cms-admin, or a visitor with an account signing in on the web site.
- **cms-admin**: keeps the access token in memory and sends it as a Bearer header; the refresh token is the `__Secure-abyss_rt` cookie (D14).
- **web BFF**: Next.js Route Handlers under `/bff/v1`; holds both cms-api tokens in the sealed `__Host-abyss_web_session` cookie (D21).
- **cms-api identity**: checks credentials and the second factor, issues and rotates tokens.

## Steps

1. The user sends email, password and the remember-me choice (`POST /auth/login`; web: `POST /bff/v1/auth/login` with a Turnstile token).
2. cms-api runs exactly one Argon2id verify (a dummy hash for an unknown email) and answers unknown, wrong and inactive accounts the same way (D8).
3. 2FA off: the session starts at once (`AuthService.startSession`). 2FA on: cms-api answers with a 2FA temp token (TTL 300 s, 5 attempts) that carries the remember-me claim `rm`; the user sends the code to `POST /auth/2fa/verify` (email code: `POST /auth/2fa/email-challenge` first), and the session starts with the claim's value (RM-1).
4. Starting a session issues the refresh token row (with `remember_me` and the TTL of that mode) and writes `auth.login_succeeded` in the same transaction (RM-2, RM-4).
5. cms-admin gets the access token in the body and the refresh cookie, persistent only when remembered (RM-3). The web BFF seals both tokens into `__Host-abyss_web_session`, persistent only when remembered (RM-6); the browser gets no token.
6. Refresh: cms-admin calls `POST /auth/refresh` with the cookie (Origin checked, D14), one tab at a time (Web Lock + BroadcastChannel); the BFF refreshes server-side when the access token has under 30 s left. Each rotation keeps the family's mode; reuse of a rotated token revokes the family (D9).
7. Sign-out: `POST /auth/logout` (web: `POST /bff/v1/auth/logout`, which always clears both cookies).

## Login, with and without 2FA

Source: [docs/architecture/07-flows.html](../../architecture/07-flows.html) (generated 2026-10-26; before remember me, which adds `rememberMe` to the login body, the `rm` claim to the temp token and the cookie mode to step 5).

```mermaid
sequenceDiagram
  actor U as User
  participant A as cms-admin / web
  participant C as AuthController
  participant S as AuthService
  participant R as AccountRepository
  participant T as RefreshTokenService
  participant DB as PostgreSQL
  U->>A: email + password
  A->>C: POST /api/v1/auth/login
  C->>S: login(credentials, clientMeta)
  S->>R: findLoginAccount(email)
  S->>S: exactly one Argon2id verify (dummy hash when unknown)
  alt unknown, wrong password or not active
    S->>DB: audit auth.login_failed (standalone row)
    S-->>C: DomainError invalid credentials
    C-->>A: 401 (same answer for unknown emails)
  else 2FA enabled
    S-->>C: tempToken + methods
    C-->>A: 200 requires2FA
    A->>C: POST /auth/2fa/verify (tempToken, code)
    Note over C,S: TwoFactorLogin checks the code, max 5 attempts, then startSession
  else password only
    S->>T: issue refresh token (CORE transaction)
    S->>DB: audit auth.login_succeeded (same transaction)
    S-->>C: accessToken + refreshToken
    C-->>A: 200 accessToken + Set-Cookie __Secure-abyss_rt
  end
  Note over A: access token kept in memory only, sent as Bearer
```

## Refresh token rotation and reuse detection (D9, D14)

```mermaid
sequenceDiagram
  participant B as Browser
  participant G as AllowedOriginGuard
  participant C as AuthController
  participant T as RefreshTokenService
  participant DB as refresh_tokens
  B->>G: POST /auth/refresh (cookie + Origin)
  G->>C: Origin is in the allowlist
  C->>T: rotate(rawToken)
  T->>DB: findByHash(SHA-256) in a transaction
  alt unknown, revoked or expired
    T-->>C: invalid
    C-->>B: 401
  else token was already rotated
    alt inside the grace window
      T-->>C: grace: new access token, cookie left alone
    else reuse
      T->>DB: revoke the whole family, bump token_version, audit
      T-->>C: reuse
      C-->>B: 401
    end
  else current token
    T->>DB: insert successor, claimRotation(current to next)
    T-->>C: rotated
    C-->>B: new access token + rotated cookie
  end
```

## cms-admin: refresh across tabs

Without Web Locks each tab refreshes and the grace window covers the overlap.

```mermaid
sequenceDiagram
  participant T1 as Admin tab 1
  participant T2 as Admin tab 2
  participant L as Web Lock + BroadcastChannel
  participant API as cms-api
  T1->>API: GET /accounts (expired access token)
  API-->>T1: 401
  T2->>API: GET /media (expired access token)
  API-->>T2: 401
  T1->>L: take refresh lock
  T2->>L: wait for lock
  T1->>API: POST /auth/refresh (cookie)
  API-->>T1: new access token, rotated cookie
  T1->>L: broadcast token, release lock
  L-->>T2: token from tab 1, no own refresh
  T1->>API: retry GET /accounts once
  T2->>API: retry GET /media once
```

## Web sign-in through the BFF (D21)

```mermaid
sequenceDiagram
  actor U as Visitor
  participant B as Browser
  participant F as web BFF /bff/v1
  participant T as Cloudflare Turnstile
  participant API as cms-api (API_INTERNAL_URL)
  U->>B: email + password (+ Keep me signed in)
  B->>F: POST /bff/v1/auth/login (humanCheckToken, rememberMe?)
  F->>F: method, Origin, JSON, size, rate limit, Zod schema
  F->>T: siteverify (action login)
  F->>API: POST /auth/login (forwarded client IP)
  alt 2FA required
    F-->>B: two-factor-required + sealed __Host-abyss_web_2fa (carries rememberMe)
    B->>F: POST /bff/v1/auth/two-factor/verify (code, humanCheckToken)
    F->>API: POST /auth/2fa/verify
  end
  F->>F: refuse accounts with any permission other than read (403 BFF_PRIVILEGED_ACCOUNT)
  F-->>B: signed-in user + sealed __Host-abyss_web_session (no token in the body)
```

## Modules in this flow

<!-- flow-modules:start (generated by .claude/bin/module-index from `modules:`; edit only the Role column) -->
<!-- prettier-ignore-start -->

| Module | Role in this flow | Doc |
|---|---|---|
| `apps/cms-api/src/modules/identity` | Login, 2FA verify, access tokens, refresh rotation, logout, the refresh cookie (RM-1..RM-3) | [identity.md](../../modules/cms-api/identity.md) |
| `apps/cms-api/src/modules/security-audit` | `auth.login_succeeded` / `auth.login_failed` rows (D15, RM-4) | [security-audit.md](../../modules/cms-api/security-audit.md) |
| `apps/cms-admin/src/features/auth` | Session, in-memory access token, refresh interceptor, single-flight and cross-tab refresh, login API client | [auth.md](../../modules/cms-admin/auth.md) |
| `apps/cms-admin/src/views/login` | Sign-in page with the 2FA modal and the remember-me checkbox (RM-5) | [login.md](../../modules/cms-admin/login.md) |
| `apps/web/src/features/auth` | Web login dialog, Turnstile widget (D21, RM-6) | none yet |
| `apps/web/src/features/session` | Who is signed in; the sealed BFF session cookie server-side (D21, RM-6) | none yet |
| `packages/form-commons/src/components/forms` | `CheckboxInput` used by the remember-me checkbox (RM-5) | [forms.md](../../modules/form-commons/forms.md) |

<!-- prettier-ignore-end -->
<!-- flow-modules:end -->
