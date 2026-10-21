# @abyss/cms-api

REST API for the Abyss headless CMS. NestJS 11 on Express, TypeScript strict.

## Run

```bash
cp .env.example .env            # then fill in values
pnpm --filter @abyss/cms-api build
pnpm --filter @abyss/cms-api start
```

Config is validated once at boot (`src/config/env.schema.ts`) into a frozen
`IAppConfig`, injected as `APP_CONFIG`. Invalid config stops the process with
a list of keys and rules (never values). The boot log prints a summary with
secrets and DB credentials redacted. Every key is documented in
[`.env.example`](.env.example).

Mail (`src/infrastructure/mail`): `MAIL_SENDER` port with a console adapter
(development only: it logs whole messages, OTP codes included) and a generic
SMTP adapter (nodemailer; e.g. Gmail via smtp.gmail.com:587 + App Password).
`MAIL_PROVIDER=smtp` requires `SMTP_HOST` and `MAIL_FROM`; `SMTP_USER` and
`SMTP_PASSWORD` go together or not at all. `SMTP_PASSWORD` is redacted in the
boot summary but not length-checked (App Passwords are 16 characters).

Production guards (`NODE_ENV=production`): `MAIL_PROVIDER=console` is
rejected, and `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY` are required and
must be at least 32 bytes; `ADMIN_ORIGIN`, `WEB_ORIGIN`, `JWT_ACCESS_KID`
and `TOTP_ENC_KID` are required. `TOTP_ENC_PREVIOUS_KEY` (when set) must be
at least 32 bytes too.

## HTTP pipeline

- Global prefix `/api/v1`. Express `strict routing` is off, so `/x/` and `/x`
  hit the same route without a redirect.
- `trust proxy` is set to `TRUST_PROXY_HOPS` (a number, never `true`).
- CORS: only `ADMIN_ORIGIN` (the cms-admin origin, SPEC §6 / D14) may call
  the API cross-origin, with credentials. The origin must be exact (no
  wildcard, no path); unset means CORS is off, and production refuses to
  start without it. `X-Request-Id` is exposed to the browser.
- Each request gets an `X-Request-Id` (an inbound id is kept if it matches
  `[A-Za-z0-9._-]{1,128}`, otherwise a UUID is generated).
- Every error returns `{ statusCode, errorCode, message, details?, requestId }`.
  5xx responses use a generic message and never carry `details`; internals go
  to the log only. To return a specific code, throw an `HttpException` whose
  response object has an `errorCode` property (and optionally `details`, for
  client errors only: e.g. validation issue paths, never submitted values).

## List pagination convention

Paginated lists (`GET /accounts` now; documents, media and audit logs reuse
it) use offset paging: `?page=` (integer >= 1, default 1) and `?pageSize=`
(1-100, default 20). The response is `{ data: [...], meta: { page, pageSize,
total } }`; `total` counts every matching row, a page past the end has an empty
`data`. Digits only; any bad value or unknown query key is `400
ACCESS_INVALID_REQUEST`. Order is fixed per endpoint (accounts: id ascending);
there are no filters yet. Constants: `PAGINATION` in
`src/modules/access/access-management.constants.ts`. `GET /roles` stays a full
list; custom roles are capped at 50 (`MAX_CUSTOM_ROLES`, system roles do not
count).

## Endpoints

| Method | Path                   | Response                                                                                       |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/health/live`  | `200 { "status": "ok" }`                                                                       |
| GET    | `/api/v1/health/ready` | `200 { "status": "ok" }`, or `503 { "status": "error" }` when the DB ping fails or exceeds 2 s |

### Auth (T09, `src/modules/identity`)

| Method | Path                   | Auth                    | Response                                                                             |
| ------ | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/api/v1/auth/login`   | none                    | `200 { accessToken }` + refresh cookie, or `200 { requires2FA, tempToken, methods }` |
| POST   | `/api/v1/auth/refresh` | refresh cookie + Origin | `200 { accessToken }` + rotated refresh cookie (no cookie inside the grace window)   |
| POST   | `/api/v1/auth/logout`  | refresh cookie + Origin | `204`, family revoked, cookie cleared                                                |
| GET    | `/api/v1/auth/me`      | `Authorization: Bearer` | `200 { id, email, displayName, role, twoFactorEnabled, twoFactorMethod }`            |

- Login verifies Argon2id. Unknown email, wrong password and any account that
  is not `active` (invited, disabled, deleted) get the same
  `401 AUTH_INVALID_CREDENTIALS`; unknown emails are verified against a dummy
  hash so the timing matches. There is no register route (invite-only).
- Access token: HS256 only (any other `alg`, `none` included, is rejected),
  15 min, claims `sub` (account document id), `tv`, `pv`, `kid`, `typ`. The
  verification key is chosen by the `kid` header (`JWT_ACCESS_KID`).
  Comparing `tv`/`pv` with the database is T15.
- Refresh cookie `__Secure-abyss_rt`: `HttpOnly; Secure; SameSite=Strict;
Path=/api/v1/auth`, 7 days, host-only (no `Domain`). The raw token is never
  stored, only its SHA-256. Every refresh rotates it within its family;
  presenting an already rotated token revokes the whole family and bumps
  `accounts.token_version`.
- Grace window (T11a, `REFRESH_TOKEN_REUSE_GRACE_SECONDS` = 10 s): an
  already rotated token is not treated as reuse when it comes back within
  10 s of its rotation (`revoked_at`), its successor (`replaced_by_id`) is
  still live and unused, and the account is active. That is a concurrent
  refresh (two admin tabs, a retried request). It gets `200 { accessToken }`
  with **no** `Set-Cookie`: no new refresh token is minted, so there is no
  parallel token or family, and the browser keeps the successor the winning
  request set. A replay inside the window gains at most one 15 min access
  token (still checked against `token_version`). Outside the window, once
  the successor was rotated, or after logout, reuse detection is unchanged.
  The window lives in the existing row columns; no in-memory state.
- `/auth/refresh` and `/auth/logout` require `Origin` to be exactly
  `WEB_ORIGIN` or `ADMIN_ORIGIN`, otherwise `403 AUTH_ORIGIN_NOT_ALLOWED`.
  CORS stays admin-only.
- 2FA accounts get a signed 300 s temp token (`typ: 2fa`) and no session;
  `methods` holds only the account's own method (`totp` or `email`). The
  second step is `POST /auth/2fa/verify` (below).

### Two-factor authentication (T13)

| Method | Path                               | Auth                    | Body                         | Response                               |
| ------ | ---------------------------------- | ----------------------- | ---------------------------- | -------------------------------------- |
| POST   | `/api/v1/auth/2fa/totp/setup`      | `Authorization: Bearer` | none                         | `200 { otpauthUri, secret }`           |
| POST   | `/api/v1/auth/2fa/enable`          | `Authorization: Bearer` | `{ method, password, code }` | `204`                                  |
| POST   | `/api/v1/auth/2fa/disable`         | `Authorization: Bearer` | `{ password, code }`         | `204`                                  |
| POST   | `/api/v1/auth/2fa/email/send-code` | `Authorization: Bearer` | none                         | `202`, empty body                      |
| POST   | `/api/v1/auth/2fa/verify`          | none                    | `{ tempToken, code }`        | `200 { accessToken }` + refresh cookie |
| POST   | `/api/v1/auth/2fa/email-challenge` | none                    | `{ tempToken }`              | `202`, empty body                      |

- TOTP: SHA-1, 6 digits, 30 s, ±1 step, 160-bit secret (`otplib`). `setup`
  stores a pending secret (replacing any earlier one) and returns the
  `otpauth://` URI (issuer `TOTP_ISSUER`, label = email) plus the base32
  secret; the admin renders the QR. `enable` with `method: "totp"` needs the
  current password and a first code of that secret. A code is accepted only
  when its time step is above `accounts.totp_last_step`, stored with a
  conditional update (replays and concurrent duplicates fail).
- Secret storage: AES-256-GCM, key = HKDF-SHA256(`TOTP_ENC_KEY`, info
  `abyss/totp-secret/v1`), ciphertext `v1.<iv>.<ct>.<tag>` (base64url), AAD
  `<documentId>:<kid>`, kid in `accounts.totp_secret_kid`. Rotation: move
  the old key to `TOTP_ENC_PREVIOUS_KEY`/`_KID`, set a new
  `TOTP_ENC_KEY`/`_KID`; each secret is re-encrypted with the new key after
  its next valid code. Secrets under an unknown kid fail closed (logged).
  Keep the previous key until no row has its kid
  (`SELECT count(*) FROM accounts WHERE totp_secret_kid = '<old>'`).
- Email 2FA: codes are `LOGIN_2FA_EMAIL` OTPs (same rules as above). Signed
  in, `email/send-code` mails one for `enable` (`method: "email"`) or
  `disable`; at login, `email-challenge` mails one for `verify`. TOTP
  accounts get the 202 but no email.
- Temp token: JWT `typ: 2fa` with `sub`, `tv`, `jti`, 300 s. `verify` counts
  one of 5 attempts per `jti` in the in-memory `TwoFactorChallengeStore`
  (one replica, like the rate-limit store; cap 10,000 live tokens, then 429)
  and a success uses the token up. The token also dies when `token_version`
  changes or 2FA is turned off.
- Enable and disable do not end sessions. Password reset of a TOTP account
  needs `totpCode` (checked by `TotpService`, step stored); email-2FA
  accounts need no extra factor.
- Errors: `401 AUTH_INVALID_TEMP_TOKEN` (expired, used, exhausted or forged
  temp token), `401 AUTH_INVALID_2FA_CODE` (verify: wrong, replayed or
  expired code), `403 AUTH_INVALID_2FA_CODE` / `403
AUTH_INVALID_CREDENTIALS` (enable/disable: wrong code / password; 403 so a
  client keeps its session), `409 AUTH_2FA_ALREADY_ENABLED`, `409
AUTH_2FA_NOT_ENABLED`, `409 AUTH_2FA_SETUP_REQUIRED`, `400
AUTH_INVALID_REQUEST`.
- No recovery codes. A lost authenticator is recovered by an operator with
  shell access through the break-glass `owner:reset-2fa` CLI (below).

### Break-glass 2FA reset: `owner:reset-2fa` (T13a)

> **Warning: break-glass tool.** It turns 2FA off for any account, the owner
> included, without a password or code. Run it only after you have confirmed
> the person's identity out of band, and only for the account they lost the
> authenticator for. Anyone who can run it already has shell access to the
> server and the full API config.

```bash
# locally (after a build):
pnpm --filter @abyss/cms-api owner:reset-2fa --email someone@example.com
# in the image (no terminal, so --yes is required):
docker run --rm --env-file api.env abyss-cms-api npm run owner:reset-2fa -- --email someone@example.com --yes
# a running compose service, with a prompt:
docker compose exec cms-api npm run owner:reset-2fa -- --email someone@example.com
```

- On a terminal it asks `Turn off 2FA and end all sessions for <email>? [y/N]`
  (default no). With no terminal, `--yes` is required, else it refuses.
- One transaction: clears `two_fa_method`, the sealed TOTP secret, its kid and
  `totp_last_step`, bumps `token_version` (access tokens and 2FA temp tokens
  stop working) and revokes every refresh token. The person then signs in
  with the password and can set up 2FA again.
- Exit 1, nothing changed: unknown or deleted email (`No account with this
email.`), 2FA already off, invalid email, missing `--email`, unknown
  options, or no confirmation. Loads the full config like `owner:bootstrap`,
  so pass the same env as the API. Prints no secrets.
- Audited in the same transaction: `two_factor.reset_by_operator` with
  `actor_type: system`, no actor id, no IP, metadata `{ previousMethod }`.

### Password lifecycle (T12)

| Method | Path                                | Auth                    | Body                                      | Response                  |
| ------ | ----------------------------------- | ----------------------- | ----------------------------------------- | ------------------------- |
| POST   | `/api/v1/auth/password/request-otp` | none                    | `{ email }`                               | `202`, empty body, always |
| POST   | `/api/v1/auth/password/reset`       | none                    | `{ email, code, newPassword, totpCode? }` | `204`                     |
| POST   | `/api/v1/auth/password/set`         | none                    | `{ email, code, newPassword }`            | `204` (invited -> active) |
| POST   | `/api/v1/auth/password/change`      | `Authorization: Bearer` | `{ currentPassword, newPassword }`        | `204`                     |

- `request-otp` answers before it even looks the email up; lookup, issue and
  send run in the background (no enumeration through body or timing). The
  purpose follows the account: invited -> `INVITE_SET_PASSWORD`, active ->
  `RESET_PASSWORD`; unknown, disabled or deleted accounts get nothing (a
  dummy HMAC keeps the work similar). Emails are plain text: the code, its
  lifetime and the admin page URL (`ADMIN_ORIGIN` + `/reset-password` or
  `/set-password`), no links.
- `OtpService` (`otp.service.ts`): 6 digits, 300 s, stored as
  HMAC-SHA256(`OTP_PEPPER`, `accountId:purpose:code`). 5 checks per code
  (the 6th fails even when right), 5 codes per account per hour across all
  purposes (6th -> 429), a new code invalidates older unused ones of the same
  purpose, and use is atomic (`used_at` claimed in the password transaction).
- Errors: `400 AUTH_INVALID_OTP` (wrong, expired, used or exhausted code, or
  unknown email: one answer), `400 AUTH_WEAK_PASSWORD` (not 12-128 chars),
  `400 AUTH_TOTP_REQUIRED` (reset of a TOTP account without a valid
  authenticator code), `403 AUTH_INVALID_CREDENTIALS` (wrong current
  password; 403, not 401, so the client keeps its session), `400
AUTH_INVALID_REQUEST` (malformed body).
- Every password write bumps `token_version` and revokes every refresh token:
  all sessions end, the caller's included. Nobody is signed in by these
  endpoints.
- The JWT guard compares `tv` with `accounts.token_version` on every request
  (uncached) and rejects inactive or deleted accounts, so old access tokens
  get 401 at once (§12-10). Caching and the `pv` check are T15.

The readiness ping goes through the `DATABASE_HEALTH` token
(`src/infrastructure/database/database-health.ts`), bound to
`PrismaDatabaseHealth` (`SELECT 1` through `PrismaService`).

### Rate limits (T10)

Fixed windows, per resolved client IP and, for login, per email. Values live
in `src/common/constants/limits.constants.ts` (`RATE_LIMIT_POLICIES`):

| Policy                       | Limit                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `LOGIN`                      | 10 / 15 min per IP, then 5 / 15 min per email                 |
| `REFRESH`                    | 30 / min per IP                                               |
| `OTP_REQUEST`                | 5 / 15 min per IP, then 5 / hour per email                    |
| `PASSWORD_SUBMIT`            | 10 / 15 min per IP (reset, set)                               |
| `PASSWORD_CHANGE`            | 5 / 15 min per IP                                             |
| `TWO_FACTOR_VERIFY`          | 10 / 15 min per IP                                            |
| `TWO_FACTOR_EMAIL_CHALLENGE` | 5 / 15 min per IP (email-challenge + email/send-code, shared) |
| `TWO_FACTOR_MANAGE`          | 5 / 15 min per IP (totp/setup + enable + disable, shared)     |
| `ACCOUNT_INVITE`             | 20 / hour per IP, then 10 / hour per caller (invite + resend) |

- Optional override (T18b): `LOGIN_RATE_LIMIT_IP` and `LOGIN_RATE_LIMIT_EMAIL`
  replace the `login:ip` (10) and `login:email` (5) limits per 15 min. Read at
  startup (positive integer, at most 1,000,000; invalid fails the start).
  Unset = defaults. Only `docker-compose.smoke.yml` sets them, so the e2e
  suite (one IP, many sign-ins) is not throttled; with `NODE_ENV=production` setting either fails the start unless
  `ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=smoke` (exact value; anything else is
  invalid) is also set, which only `docker-compose.smoke.yml` does.
- Optional override (T18c): `REFRESH_RATE_LIMIT_IP` replaces the `refresh:ip`
  limit (30 per minute per IP). Same validation and the same production
  opt-in flag (`ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=smoke`) as the login overrides;
  only `docker-compose.smoke.yml` sets it.
- Key sources: `ip`, `email` (body.email, hashed) and `actor` (the signed-in
  account id; needs `JwtAuthGuard` before it, which a method-level
  `@Throttle` is; skipped when there is no signed-in account).
- Apply with `@Throttle(RATE_LIMIT_POLICIES.X)` (`src/common/guards/throttle.guard.ts`),
  placed last so it runs before the route's other guards. Over the limit:
  `429 TOO_MANY_REQUESTS` in the unified error shape plus `Retry-After`
  (seconds). The body is the same whichever rule fired.
- Client IP: `ClientIpResolver` (`src/common/client-ip.resolver.ts`) is the
  only source. It reads `CLIENT_IP_HEADER` when configured, otherwise
  `req.ip`, which trusts exactly `TRUST_PROXY_HOPS` entries of
  `X-Forwarded-For`; anything a client prepends is ignored (SPEC §12-8).
- The email key is trimmed, lower-cased and hashed; the database is never
  consulted, so known and unknown emails behave identically.
- Trade-off: anyone who knows an email can spend its 5 attempts and block
  that account's password login for up to 15 minutes per window. Accepted
  for v1 (short window, IP limit still applies to the attacker); revisit with
  per-IP+email keys or CAPTCHA if abused.
- Store: **in memory** (`InMemoryRateLimitStore` behind `RATE_LIMIT_STORE`).
  Correct for one API replica only; counters reset on restart. Before running
  more than one replica, bind `RATE_LIMIT_STORE` to a Postgres or Redis
  implementation. Expired counters are swept every 15 minutes.
- Store cap (T10a): at most `RATE_LIMIT_MAX_KEYS` (50,000, about 12 MB at
  ~250 bytes per key) live counters, so rotating IPs or emails can't exhaust
  memory. When a new key arrives at the cap, expired counters are swept
  first; if the store is still full the request is refused with the same
  `429` + `Retry-After` as a limit hit (fail closed). Existing keys keep
  counting and live counters are never evicted. A `Rate-limit store full`
  warning (refused count only, no IPs or emails) is logged at most once per
  `RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS` (1 min). Change the cap in
  `limits.constants.ts`.

### Accounts and roles (T17, `src/modules/access`)

All routes need `Authorization: Bearer` (an account session; API tokens and
reviewers never reach them) plus the permission named. `:id` is always a
`document_id` (UUID); internal ids are never exposed.

| Method | Path                                   | Permission        | Body                                | Response                                                  |
| ------ | -------------------------------------- | ----------------- | ----------------------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/accounts`                     | `accounts:read`   | `?page=&pageSize=`                  | `200 { data: Account[], meta }` (paged)                   |
| POST   | `/api/v1/accounts`                     | `accounts:create` | `{ email, displayName, roleId }`    | `201 Account & { invitationSent }`                        |
| PATCH  | `/api/v1/accounts/:id`                 | `accounts:update` | `{ displayName?, roleId? }` (one+)  | `200 Account`                                             |
| POST   | `/api/v1/accounts/:id/disable`         | `accounts:update` | none                                | `204`                                                     |
| POST   | `/api/v1/accounts/:id/enable`          | `accounts:update` | none                                | `204`                                                     |
| POST   | `/api/v1/accounts/:id/invite/resend`   | `accounts:create` | none                                | `200 { invitationSent }`                                  |
| POST   | `/api/v1/accounts/:id/sessions/revoke` | `accounts:update` | none                                | `204`                                                     |
| GET    | `/api/v1/roles`                        | `roles:read`      | none                                | `200 { data: Role[] }` (rank desc)                        |
| POST   | `/api/v1/roles`                        | `roles:create`    | `{ slug, name, rank }` (rank 11–39) | `201 Role`; `409 ROLE_LIMIT_REACHED` past 50 custom roles |
| PATCH  | `/api/v1/roles/:id`                    | `roles:update`    | `{ name?, rank? }` (one+)           | `200 Role`                                                |
| DELETE | `/api/v1/roles/:id`                    | `roles:delete`    | none                                | `204`                                                     |
| PUT    | `/api/v1/roles/:id/permissions`        | `roles:update`    | `{ permissions: PermissionRow[] }`  | `200 Role`                                                |

- `Account`: `{ id, email, displayName, status, twoFactorEnabled,
twoFactorMethod, role: { id, slug, name, rank }, createdAt, manageable }`.
  `Role`: `{ id, slug, name, rank, isSystem, accountCount, permissions,
manageable }`. `manageable` says whether the caller may change it (D6), so
  the admin UI can hide actions; the server enforces it anyway.
- **Enable** (T17a): only a `disabled` account (else `409
ACCOUNT_NOT_DISABLED`); it becomes `active` when it has a password, else
  `invited`. `token_version` is unchanged (disable already bumped it).
  **Resend invite**: only `invited` accounts (else `409 ACCOUNT_NOT_INVITED`);
  issues a new invite code (older invite codes stop working; the 5 codes per
  account and hour cap answers 429 and rolls back) and mails it;
  `invitationSent` means the same as for invite. Both follow the D6 rank rule
  and never target the caller. Invite and resend share the `ACCOUNT_INVITE`
  throttle (429 + `Retry-After`, nothing written or mailed).
- **D6 rank rule** on every write: the target account's role, any role being
  assigned, the role being edited and any new rank must all be strictly
  below the caller's rank. Nobody targets their own account (the owner
  included). So an admin cannot touch another admin, the admin role or its
  permissions, and nobody can assign `owner`. Violations: `403
ACCESS_RANK_FORBIDDEN`.
- `public` and `reviewer` cannot be assigned to accounts (`400
ROLE_NOT_ASSIGNABLE`). A permission set may not grant a system subject
  action the caller lacks itself (`403 PERMISSION_NOT_HELD`, `details.indexes`),
  so an admin cannot hand out `audit_logs`.
- Invite (Q2): creates an `invited` account plus its `INVITE_SET_PASSWORD`
  code in one transaction (the 5-codes/hour cap answers 429 and rolls it
  back), then emails the code. `invitationSent: false` means delivery failed;
  the invitee can still ask for a code with `request-otp`. The email is
  immutable afterwards (PATCH rejects it). Taken email: `409
ACCOUNT_EMAIL_TAKEN`.
- Disable bumps `token_version` and revokes every refresh token (`409
ACCOUNT_ALREADY_DISABLED` the second time); revoke sessions does the same
  without the status change. A role change applies on the next request.
  No re-enable or resend-invite endpoint yet.
- Roles: slugs are kebab-case and immutable; system roles keep their rank
  and can't be deleted (`409 ROLE_SYSTEM_IMMUTABLE`). Delete answers `409
ROLE_IN_USE` with `details.accountCount` while any account (disabled,
  invited or deleted too) holds the role. Permission rows are validated with
  `validatePermissionSet` (`400` with the first issue's code and
  `details.issues`).
- Other errors: `400 ACCESS_INVALID_REQUEST` (`details.issues` = paths and
  messages, no values), `404 ACCOUNT_NOT_FOUND` / `ROLE_NOT_FOUND`, `409
ROLE_SLUG_TAKEN`.

### API tokens (T19, D5, `src/modules/access`)

Routes need `Authorization: Bearer` with an **account session** (JWT). An
`ak_live_` token gets `401` there, any other actor kind `403`.

| Method | Path                            | Permission          | Response                                  |
| ------ | ------------------------------- | ------------------- | ----------------------------------------- |
| GET    | `/api/v1/api-tokens`            | `api_tokens:read`   | `200 { data, meta }` (`?page=&pageSize=`) |
| POST   | `/api/v1/api-tokens`            | `api_tokens:create` | `201` token view plus `token` (raw, once) |
| PATCH  | `/api/v1/api-tokens/:id`        | `api_tokens:update` | `200` token view                          |
| POST   | `/api/v1/api-tokens/:id/revoke` | `api_tokens:update` | `204`                                     |

- Body of create: `{ name, scope, expiresAt? }`; update takes any of
  `name`, `scope`, `expiresAt` (`null` removes the expiry). `scope` is
  `{ permissions: [{ subject, action, readableFields?, writableFields? }] }`,
  content subjects only (`*` or a registered slug), at most 200 entries.
  `expiresAt` is ISO 8601 with an offset and must be in the future.
- Token view: `id` (document_id), `name`, `tokenPrefix` (first 12 characters),
  `scope`, `status` (`active|revoked|expired`), `expiresAt`, `lastUsedAt`,
  `revokedAt`, `createdAt`, `createdBy {id, displayName}`. The raw token is
  `ak_live_` + 32 random bytes in base64url; only its SHA-256 is stored, and
  only the create response (`Cache-Control: no-store`) ever holds it.
- Subset check (D5), on create **and** update: every scope entry must be held
  by the token's creator (their current role rows: the action on that
  subject, or on `*`, with a field list inside theirs; a `*` entry needs a
  `*` row). Otherwise `403 API_TOKEN_SCOPE_NOT_HELD` with `details.indexes`.
  When the Owner edits another account's token, the check runs against that
  token's creator. The Owner holds everything. Row conditions are not
  compared: the creator's conditions always apply at request time.
- Visibility: the Owner sees and manages every token; anyone else only the
  tokens they created. Another account's token answers `404
API_TOKEN_NOT_FOUND`. A revoked token cannot be updated or revoked again
  (`409 API_TOKEN_REVOKED`). Scope errors: `400 TOKEN_SCOPE_INVALID` or the
  `PERMISSION_INVALID_*` codes of `validateTokenScope`.
- Audit (same transaction as the write, subject `api_tokens`, target = the
  token's document_id): `api_token.created` (`subjects`, `permissionCount`,
  `hasExpiry`), `api_token.updated` (`fields` changed, plus `subjects` and
  `permissionCount` when the scope changed), `api_token.revoked`. Never the
  raw token.
- Authentication on content routes (T20+): `@UseGuards(ApiTokenGuard,
PermissionGuard)`. `ApiTokenGuard` hashes the bearer value (it must start
  with `ak_live_`), looks it up by hash and sets `req.user.actor` with the
  creator's **current** role, so effective permissions are scope ∩ creator
  (§12-6). `401` for a missing, unknown, revoked or expired token, a
  malformed stored scope, and a disabled, deleted or missing creator.
  `last_used_at` is written at most once a minute (`updated_at` does not
  move). Tokens are not cached: revocation applies on the next request.

### Content types (T17b, `src/modules/content-types`)

Read-only discovery of the registered content types and their field paths,
for the admin permission matrix now and the document UIs later. Both routes
need `Authorization: Bearer` (an account session).

| Method | Path                          | Response                                       |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/v1/content-types`       | `200 { data: ContentType[] }` (sorted by slug) |
| GET    | `/api/v1/content-types/:slug` | `200 ContentType`                              |

- `ContentType`: `{ slug, kind, draftAndPublish, fields: Field[] }`.
  `Field`: `{ path, type, system, component, repeatable, rootScalar,
conditionKind, sensitive }`. Content fields come first, depth-first in
  definition order (`reference`, then `reference.phone`), then the system
  fields conditions may use (`createdBy`, `updatedBy`, `documentId`, with
  `system: true` and `type` = their value kind). `conditionKind` is the value
  kind a condition compares the field with, or `null` when conditions can't
  use it (components, nested fields, `json`).
- Filtering: a type is listed when the caller may `read` it; only the paths
  its readable field list reaches are included (a component stays when one
  of its fields is readable). Reviewers and anonymous actors never get
  `createdBy` / `updatedBy`.
- Callers with `roles:update` (and the owner) see every type and every field,
  so they can build any role's matrix; the rank rule still limits which roles
  they edit.
- An unknown slug and one the caller cannot read both answer `404
CONTENT_TYPE_NOT_FOUND` with the same message. The slug is only ever a
  registry lookup key.

### Documents, read (T20, `src/modules/documents`)

| Method | Path                                  | Response                                                 |
| ------ | ------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/documents/:slug`             | `200 { data: Record[], meta { page, pageSize, total } }` |
| GET    | `/api/v1/documents/:slug/:documentId` | `200 Record`, or `404 DOCUMENT_NOT_FOUND`                |

- **Who**: `DocumentAuthGuard` accepts a JWT session, an API token
  (`Bearer ak_live_...`) or **no `Authorization` header** (the anonymous
  `public` role, `AnonymousActorService`). A header that is present but
  invalid is always 401; it never falls back to anonymous. Then
  `PermissionGuard` needs `read` on `:slug` (unknown slug 404, no `read` 403).
  If the `public` role is missing, anonymous requests get 401.
- **`status`**: `published` (default) or `draft`. `draft` needs `read` and
  `update` on the type (so reviewers, anonymous visitors and read-only tokens
  get 403). A type with `draftAndPublish: false` has live rows: `status` does
  not filter them (the draft permission rule still applies).
- **Paging**: `page` (default 1, max 10000), `pageSize` (default 20, max 100),
  `meta.total` counts every matching row. Default order `-updatedAt`; ties
  are broken by row id.
- **`sort`**: comma-separated, `-` prefix for descending, at most 3 keys:
  `sort=-priority,title`.
- **`filter`** (flat keys, at most 10): `filter[title]=x` (same as
  `filter[title][eq]=x`), `filter[priority][gte]=3`, `filter[priority][in]=1&filter[priority][in]=2`
  (up to 20 values). Operators: `eq ne in gt gte lt lte contains`, by field
  kind (`contains` is a case-insensitive substring match for text fields and
  escapes `%` / `_`; ordering operators for numbers, dates and datetimes;
  booleans and uuids take `eq ne in`). Values are typed by the column
  (integers fit Postgres `integer`, dates are `YYYY-MM-DD`, datetimes are
  ISO 8601 with an offset or a plain date). Fields: top-level scalar fields
  and the system fields (`documentId version publishedAt locale createdAt
updatedAt createdBy updatedBy`); components, nested paths and `json` are
  400 `BAD_REQUEST`. No free-text `search` yet.
- **Errors (400)**: unknown field `FIELD_UNKNOWN`; a field the actor cannot
  read (including `createdBy` / `updatedBy` for anonymous and reviewer) `FIELD_NOT_READABLE`; unknown
  parameter, operator or malformed value `ACCESS_INVALID_REQUEST` / `BAD_REQUEST`.
  Errors never echo the submitted value.
- **Body**: a `SerializedRecord` ([masking](../../docs/modules/access-control.md)):
  unreadable fields are `"***"` / `null` and listed in `_maskedFields`; their
  columns are never selected. The role's row conditions apply to list, total
  and detail (a hidden row is a 404). `date` fields are `"YYYY-MM-DD"`
  strings (the content pool's pg date parser returns text, no time-zone
  shift); `decimal` fields are strings.
- **Throttle**: anonymous reads only, 120 per minute per client IP
  (fixed window, in memory): the 121st gets `429 TOO_MANY_REQUESTS` with
  `Retry-After`. Signed-in accounts and API tokens are not counted. The
  throttle runs after `DocumentAuthGuard` and `PermissionGuard`, so a request
  they reject (401/403/404) is not counted.
- Responses are `Cache-Control: no-store`.

### Documents, write (T21, `src/modules/documents`)

`POST /documents/:slug` and `PUT /documents/:slug/:documentId`. Auth: JWT account or API token (`DocumentAuthGuard`); anonymous and reviewer sessions get 403. Needs `create` / `update` on the content type, plus the `update` row conditions on PUT (a hidden row is 404 `DOCUMENT_NOT_FOUND`). Body = the document tree `{ values?, components? }`; PUT also needs `version` (the version the client edited; it is read first and never reaches the field allowlist).

Order of every write: allowlist (D4: resent `"***"` dropped, `FIELD_UNKNOWN` / `FIELD_NOT_WRITABLE` 400) -> tree shape (`assertTreeInput`) -> value rules (`value-validator.ts`: type per field type, `required`, richtext through `sanitizeRichtext` (`sanitize-html` allowlist: editor tags, `a[href|title|target|rel]`, schemes http/https/mailto/tel; script, `on*`, `javascript:`, style stripped); 400 `DOCUMENT_INVALID`, message has the input path, never the value) -> one transaction.

- **Create** inserts a draft (`published_at` null, `version` 1, `created_by` = the actor or the token creator). A type with `draftAndPublish: false` stores one live row instead (`published_at` set at create); PUT then updates that row. The response (201) is the new record serialized for the actor, but only when the actor may read that row (read permission, read row conditions, and `read`+`update` for a draft); otherwise it is just `{ documentId, version }`. `create` permissions take no conditions: saving a role with one is 400 `PERMISSION_INVALID_CONDITION`.
- **Update**: `UPDATE ... SET version = version + 1 WHERE document_id AND version = $v` (takes the row lock) then `replaceTree`, in one transaction; after the write the row is re-checked against the `update` row conditions and the request is rolled back with 403 if the new content moved it out of scope. 200 returns the record under the same read gate as create (else `{ documentId, version }`). Of N concurrent updates with the same version exactly one wins.
- **Conflict** (`409 DOCUMENT_VERSION_CONFLICT`): `details = { currentVersion, server, submitted, diff }`. `server` is the stored document and `submitted` the sent changes applied on it, both through `RecordSerializer` with the actor's read access (masked fields are `***` / `null`, `_maskedFields` listed). `diff` is computed from those serialized records (`diff.ts`): entries `{ path, change: added|removed|changed|moved, server?, submitted? }`; components are matched by `componentUid`, an item without uid is `[new#<index>]`. An actor without `read` on the row (or whose read conditions exclude it) gets `server`/`submitted` null and an empty diff; `currentVersion` is still returned.

### Documents, publish and delete (T22, `src/modules/documents`)

`POST /documents/:slug/:documentId/publish` (body `{ expectedVersion }`, nothing else), `POST .../unpublish`, `DELETE /documents/:slug/:documentId`. Auth as for writes (JWT account or API token; anonymous and reviewer 403). Needs `publish` / `unpublish` / `delete` on the content type. The row conditions of that action pick the rows the actor can reach; rows outside them are 404 `DOCUMENT_NOT_FOUND`.

- **Publish** locks the draft row (`FOR UPDATE`), checks `expectedVersion` (stale = `409 DOCUMENT_VERSION_CONFLICT`, `details { currentVersion }` only), then in the same transaction deletes the published row and inserts a deep copy of the draft tree (`tree-cloner.ts`; `component_uid`s kept, new row ids). The published row takes the draft's `version`; the draft is not changed. 200 `{ documentId, version }`. Concurrent publishes queue on the lock, so one published row remains (the partial unique indexes are the backstop). A republish with an unchanged draft is allowed. A type with `draftAndPublish: false` is 400 `DOCUMENT_NOT_PUBLISHABLE`.
- **Unpublish** deletes the published row (the tree cascades), keeps the draft: 204, or 404 when nothing is published.
- **Delete** deletes the draft and the published row (cascade): 204. Every row of the document must be inside the actor's `delete` conditions, else 404 and nothing is deleted. A `draftAndPublish: false` type deletes its one live row.
- **Activity tracking** is a port (`src/infrastructure/activity`: `ActivityRecorder`, token `ACTIVITY_RECORDER`). Publish, unpublish and delete call `record({ action, subject, documentId, accountId, tokenId?, version? })` after the commit; a failure is logged, never returned. Only the `none` adapter exists (default): the `database` adapter (SPEC D15) is not built yet. Create/update do not emit events yet.

### Documents, presence (T26, `src/modules/documents`)

`POST /documents/:slug/:documentId/presence` (SPEC D16), body `{ state?: 'viewing' | 'editing' }` (default `editing`, nothing else allowed). Needs `update` on the content type and the document's draft row inside the actor's `update` row conditions (else 404). Only account sessions: anonymous, reviewer and API token callers get 403. Heartbeat every 20 s; an entry expires 45 s after its last heartbeat (`PRESENCE_TTL_MS`). 200 returns everyone active on the document, each `{ accountId, displayName, state, lastSeenAt }` and nothing else (`accountId` is the account's public UUID, the `id` of `GET /auth/me`, never the internal numeric id; the caller is included, clients filter themselves out). In-memory store, one replica; capped at `PRESENCE_MAX_ENTRIES` (new editors get 429 at the cap). No audit event (not a content change).

### Security audit (T17, D15)

`SecurityAuditService` (`src/modules/access/security-audit.service.ts`)
writes one `audit_logs` row per security event, always on, in the same
transaction as the change it records. Events with no write of their own
(failed sign-in, failed re-auth) insert a standalone row. Action names live
in `security-audit.constants.ts` (`<domain>.<event>`): `auth.login_succeeded`
/ `login_failed` / `logout` / `refresh_reuse_detected` / `otp_issued`,
`password.reset` / `set` / `changed` / `change_failed`, `two_factor.enabled`
/ `disabled` / `verify_failed` / `manage_failed` / `reset_by_operator`,
`account.invited` / `updated` / `role_changed` / `disabled` / `enabled`
(metadata `status`) / `invite_resent` / `sessions_revoked`, `role.created` / `updated` / `deleted` /
`permissions_replaced`, `api_token.created` / `updated` / `revoked`.

- `target_id` is the target's `document_id`; `subject` is the system subject
  (`accounts`, `roles`) or null for sign-in and self-service events; `ip` is
  the resolved client IP.
- Metadata holds names only: field names, role slugs, a 2FA method, an OTP
  purpose, a reason. Never field values, codes, passwords or tokens.
- `auth.login_failed` reasons: `unknown_account`, `no_password`,
  `bad_password`, `not_active`. An unknown email gets no actor and no raw
  email, only `emailHmac`: HMAC-SHA256 of the trimmed, lower-cased email
  under a key derived from `OTP_PEPPER` with HKDF (`abyss/audit-email/v1`),
  so repeated attempts on one address can be linked. Null when `OTP_PEPPER`
  is unset (development only).
- No read endpoint yet (`GET /audit-logs` is a later task).

## Core database (Prisma)

Core tables (accounts, roles, permissions, tokens, media, audit, settings)
live in schema `public`, managed by Prisma 7 with `@prisma/adapter-pg`
(`prisma/schema.prisma`, `prisma.config.ts`). The client is generated into
`src/generated/prisma` (gitignored); turbo runs `db:generate` before build,
lint, typecheck and test. `db:migrate` applies migrations and seeds the six
system roles and their default permissions; `owner:bootstrap` creates the single owner once. Decisions and
usage: [docs/modules/core-schema.md](../../docs/modules/core-schema.md).

## Access control

`src/modules/access/` decides what an actor (account, reviewer, API token,
anonymous) may do: `PolicyEvaluator.can()` / `fieldsFor()` / `rowFilter()`,
the conditions DSL compiler and the save-time validators T17/T19 call.
Routes opt in with `@UseGuards(JwtAuthGuard, PermissionGuard)` and
`@RequirePermission(...)`. `tv`/`pv` revocation goes through the in-process
`VersionCache` (5 s TTL, one replica; swap it before scaling out).
Rules, the default role matrix, the DSL and the revocation flow: [docs/modules/access-control.md](../../docs/modules/access-control.md).

## Content types

Content types are JSON files in `content/schemas/` (e.g. `cv-page.json`).
`src/modules/content-engine/definition.validator.ts` checks them (shape,
naming, depth ≤ 3, 63-byte names, collisions) and returns structured errors;
`naming.ts` is the single source of generated SQL names. Tables are created
only by migrations in `content/migrations/` (`content:generate`, then
`content:migrate`). At runtime, `RegistryService` resolves a slug to its
table plans and `ContentRepository` reads and writes whole documents (root +
component tree) with batched, parameterized Kysely queries. Format, rules
and repository behaviour:
[docs/modules/content-schema.md](../../docs/modules/content-schema.md).

## Scripts

| Script                           | What it does                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `build`                          | `tsc` to `dist/`                                                                            |
| `test`                           | Unit (`src/**/*.spec.ts`) and integration (`test/integration`) tests                        |
| `test:unit` / `test:integration` | One Jest project only                                                                       |
| `lint`                           | Oxlint, then ESLint with typescript-eslint (type-aware)                                     |
| `typecheck`                      | `tsc --noEmit` over `src` and `test`                                                        |
| `content:generate`               | Build, then write the next content migration (`--dry-run`, `--name`, `--allow-destructive`) |
| `content:migrate`                | Apply pending content migrations (needs a build and `DATABASE_URL`)                         |
| `db:generate`                    | Generate the Prisma client                                                                  |
| `db:migrate`                     | Apply core Prisma migrations, then seed system roles + default permissions (needs a build)  |
| `db:migrate:dev`                 | Development: create a core migration from schema changes                                    |
| `db:seed`                        | Seed system roles + default permissions only (idempotent)                                   |
| `owner:bootstrap`                | Create the single owner (`OWNER_EMAIL`, hidden password prompt or `--password-stdin`)       |
| `owner:reset-2fa`                | Break-glass: turn 2FA off for one account and end its sessions (`--email`, `--yes`)         |

Integration tests start Postgres 16 with Testcontainers, so Docker must be
running. Jest runs with `--experimental-vm-modules` because the Prisma 7
client loads its query compiler with a dynamic `import()`.

## Docker

```bash
docker build -f apps/cms-api/Dockerfile -t abyss-cms-api .   # from the repo root
```

Multi-stage: `turbo prune` keeps cms-api only, the build stage compiles it,
and `pnpm deploy --prod` copies production dependencies into a runtime image
that runs as the `node` user on port 3000. Pass config as env vars; `.env*`
files are never copied into the build context (`.dockerignore`).

The image also carries `prisma/`, `prisma.config.ts` and `content/`, so
migrations run in the container before (re)starting the API, in this order
(the CLIs load the full config, so pass the same env as the API):

```bash
docker run --rm --env-file api.env abyss-cms-api npm run db:migrate
docker run --rm --env-file api.env abyss-cms-api node dist/modules/content-engine/cli/migrate.js
# once, on first deploy:
docker run --rm -it --env-file api.env -e OWNER_EMAIL=me@example.com abyss-cms-api npm run owner:bootstrap
# break-glass only, lost authenticator (see "Break-glass 2FA reset"):
docker run --rm --env-file api.env abyss-cms-api npm run owner:reset-2fa -- --email someone@example.com --yes
```

`pnpm smoke` (repo root) runs this image behind Traefik together with both
SPAs; see `scripts/smoke.sh`.
