# @abyss/cms-api

REST API for the Abyss headless CMS. NestJS 11 on Express, TypeScript strict.

## Run

```bash
cp .env.example .env            # then fill in values
pnpm --filter @abyss/cms-api build        # nest build -> dist/
pnpm --filter @abyss/cms-api start:prod   # node dist/main
```

Development: `pnpm --filter @abyss/cms-api start:dev` (or `pnpm start:cms-api:dev` from the root)
runs the standard NestJS CLI watch (`nest start --watch`, config in
`nest-cli.json`) with `--env-file-if-exists=.env.local`, and restarts on every
change. Copy `.env.example` to `.env.local` for it.
`start:debug` is the same watch with the Node inspector on. Only `start:dev` and
`start:debug` load that file; `db:migrate`, the CLIs, `start` and production
read the shell env only.

Config is validated once at boot (`src/config/Env.schema.ts`) into a frozen
`IAppConfig`, injected as `APP_CONFIG`. Invalid config stops the process with
a list of keys and rules (never values). The boot log prints a summary with
secrets and DB credentials redacted. Every key is documented in
[`.env.example`](.env.example).

Database: the connection comes from `DB_HOST`, `DB_NAME`, `DB_USERNAME` and
`DB_PASSWORD` (all required) and `DB_PORT` (default 5432, the PostgreSQL
port). They replace the old `DATABASE_URL`, which is no longer read. The
values stay separate fields all the way to the `pg` pool (no URL is built), so
a password with `@ : / ? # %` needs no encoding. Only the Prisma CLI
(`prisma.config.ts`) needs a URL; it builds one from the same `DB_*` values
with the URL API, which encodes them. The boot summary shows host, port,
database and user, and the password as redacted.

Database roles in production (ADR 0012): the API runs as `abyss_api`, which
has no DDL right, and `deploy:migrate` runs as the migration role
(`abyss_migrator`; on Supabase `postgres`), each with its own Secret. The
migration commands load only the `DB_*` keys and `NODE_ENV`, so the init
container needs no app secret. `scripts/db/database-roles.sql` creates the
roles and grants; with `NODE_ENV=production` the API logs one warning at boot
when its own role can run DDL. First-install steps and the Supabase runbook:
`docs/deployment/k3s-traefik.md` and `docs/deployment/supabase-database.md`.

Database TLS: `DB_SSL_MODE` is `disable` (default), `require` (encrypted, the
server is not checked) or `verify-full` (certificate chain and host name
checked against the CA in `DB_SSL_ROOT_CERT_PATH`, an absolute path that is
required for `verify-full`). The CA file is read once at startup; a missing,
unreadable or non-PEM file stops the process with an error naming the key.
`prisma.config.ts` maps the same keys to URL parameters for
`prisma migrate deploy`: the schema engine ignores `sslmode=verify-full`, so
`verify-full` becomes `sslmode=require&sslcert=<CA>&sslaccept=strict`.

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
- Security headers (SPEC D17): every response, errors and `POST /graphql`
  included, carries `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`,
  `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin` (same values as apps/web),
  and no `X-Powered-By`. The reverse proxy must not add its own CSP. The set
  is pinned in `SecurityHeaders.middleware.spec.ts`.
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
`src/common/validation/SharedSchemas.rules.ts`, `MAX_CUSTOM_ROLES` in
`src/modules/access/management/domain/AccessManagement.constants.ts`. `GET /roles` stays a full
list; custom roles are capped at 50 (`MAX_CUSTOM_ROLES`, system roles do not
count).

## Endpoints

| Method | Path                   | Response                                                                                       |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/health/live`  | `200 { "status": "ok" }`                                                                       |
| GET    | `/api/v1/health/ready` | `200 { "status": "ok" }`, or `503 { "status": "error" }` when the DB ping fails or exceeds 2 s |

### Auth (T09, `src/modules/identity`)

| Method | Path                   | Auth                    | Response                                                                               |
| ------ | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/login`   | none                    | `200 { accessToken }` + refresh cookie, or `200 { requires2FA, tempToken, methods }`   |
| POST   | `/api/v1/auth/refresh` | refresh cookie + Origin | `200 { accessToken }` + rotated refresh cookie (no cookie inside the grace window)     |
| POST   | `/api/v1/auth/logout`  | refresh cookie + Origin | `204`, family revoked, cookie cleared                                                  |
| GET    | `/api/v1/auth/me`      | `Authorization: Bearer` | `200 { id, email, displayName, role, twoFactorEnabled, twoFactorMethod, permissions }` |

- `permissions` (T33a) is the caller's effective `subject:action` strings (e.g. `article:read`, `roles:update`), sorted, listing concrete content types and system subjects (never `*`); conditions are ignored. Owner gets every valid action; reviewer and public roles only `:read`. It carries no secrets.
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

### Owner setup (ADR 0005, `src/modules/identity`)

The one owner is created either by the `owner:bootstrap` CLI (fallback) or by a
one-time setup request guarded by a setup token. Design:
[docs/modules/owner-setup.md](../../docs/modules/owner-setup.md).

| Method | Path                   | Auth              | Body                                            | Response                                                                                                                      |
| ------ | ---------------------- | ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/setup/status` | none (30/min/IP)  | none                                            | `200 { open }`, `Cache-Control: no-store`                                                                                     |
| POST   | `/api/v1/setup/owner`  | token in the body | `{ setupToken, email, displayName?, password }` | `201 { email }`; `401 SETUP_TOKEN_INVALID`; `400` fields; `409 OWNER_EMAIL_TAKEN`; `404` when closed; `429` (5 per 15 min/IP) |

- **Open** only while `OWNER_SETUP_TOKEN` is set and no live owner exists.
  Closed, the submit route answers `404 NOT_FOUND` exactly like an unknown
  route (token or not), and `status` says `{ open: false }`.
- The token is checked first (SHA-256 digests, `timingSafeEqual`), before the
  body is parsed or a password is hashed. A missing, non-string or over-long
  (256+) token counts as wrong (401).
- No session comes out of setup: the owner signs in on the normal login, then
  turns on two-factor. Route and CLI share `bootstrapOwner()` (advisory lock,
  single-owner index), so exactly one owner exists whatever the mix of callers;
  the loser gets 404 (route) or `owner.exists` (CLI).
- Audit: `owner.created` (`channel` `setup_page` or `cli`) and
  `owner.setup_rejected` (`reason` `bad_token`, or `closed` when a closed
  submit carried a token). No token, password or email is stored.
- **Generate** the token with `openssl rand -base64 32` and put it in the
  cms-api Secret as `OWNER_SETUP_TOKEN` (never a build arg, never in the admin
  or web). Production needs at least 32 bytes.
- **Close and rotate:** setup closes itself when the owner exists. Then remove
  `OWNER_SETUP_TOKEN` from the Secret and restart; until then cms-api logs
  `OWNER_SETUP_TOKEN is set but an owner exists; remove it from the secret.`
  To rotate before use, replace the value and restart (the old one stops
  working at once). If the owner row is ever deleted in SQL while a token is
  still configured, setup reopens to whoever holds the token.

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
- `OtpService` (`application/Otp.service.ts`): 6 digits, 300 s, stored as
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
(`src/modules/health/application/CheckReadiness.service.ts`), bound in
`HealthModule` to `PrismaDatabaseHealth` (`SELECT 1` through `PrismaService`).

Multi-write core flows use the `CORE_TRANSACTION_RUNNER` token
(`src/infrastructure/database/TransactionRunner.port.ts`), bound to
`PrismaTransactionRunner` (`prisma.$transaction`, default options). `run(work)`
commits when `work` resolves and rolls back when it throws; `unit.afterCommit(cb)`
runs `cb` once after the commit, in registration order, never on rollback (a
failing callback is logged, the commit stands). Locks stay in repository SQL.
Only adapters call `prismaTxOf(unit)`; a unit exists only inside `run`. The
content (Kysely) runner is `CONTENT_TRANSACTION_RUNNER`.

### Module layout (ADR 0006)

Every module under `src/modules/` (`Layers.architecture.spec.ts` checks each
folder, so a new module is covered without a list to edit) keeps only `<Module>.module.ts`,
`index.ts` and the layer folders `domain/`, `application/`, `adapters/`,
`http/` (plus `cli/`, `jobs/` where it has them). Import rules per layer are
in `LAYER_RULES`; `Layers.architecture.spec.ts` enforces them. Checklist,
as the content-types pilot (CR-hc-2) used it:

File names follow ADR 0008 (`<PascalName>.<function>.ts`, tests add
`.spec.ts` and an optional lower-case scenario variant such as
`Auth.service.refresh.spec.ts`); folders are kebab-case.
The `abyss/file-names` ESLint rule (`pnpm lint`, options in `eslint.config.mjs`)
checks every file and folder in `src/` and `test/`: a function word is
required, `index.ts` and `main.ts` are the framework names, and the test
suffix is `spec`.

File granularity follows `code-standards` §4.4 and ADR 0006 §7.13 (rules
G1-G10 in `tasks/todo.md`): one ports file and one constants file per layer,
no file under 30 lines except entry points, a constant used by one file lives
in that file.

1. Moves first, edits second (a separate commit when the diff is large):
   `git mv` each file to its layer folder with the ADR 0008 name
   (`<Name>.<function>.ts`), then fix import paths.
2. Splits: Prisma enums become domain constants; errors thrown by rules
   become `DomainError` in the module's main `domain/` rules or entity file, or in
   `domain/<Module>.errors.ts` once it reaches 30 lines (same status, code,
   message); framework and Prisma/Kysely code leaves `domain/` and
   `application/` (ports in `application/`, implementations in `adapters/`).
3. A value from another module's facade is not allowed in `domain/` (only
   `import type` and the names in `DOMAIN_CROSS_MODULE_HELPERS`): the
   application layer passes it in. Put `import type` and value imports from
   one facade in separate statements; the guard reads inline `type` names as
   values.
4. Fix every consumer's import of it; `KNOWN_LAYER_VIOLATIONS`
   (`test/architecture/LayerRules.constants.ts`) is empty and an entry needs
   a removing task.
5. Update `test/architecture/SourcePaths.constants.ts` for pinned paths,
   the module's README section and `docs/modules/*.md`.
6. Specs: unit specs sit next to their file; integration specs change import
   paths only. Run `pnpm test:unit`, then the module's integration specs.

`content-engine` is migrated (CR-ce-1, CR-ce-2). `domain/`: rules, entities,
constants, `field-types/` and the registry (`ContentTypeRegistry.entity.ts`).
`application/`: the ports file `ContentEngine.port.ts`, and `ContentRegistry.service.ts` (lazy load,
retry after a failure, empty registry when `content:migrate` never ran).
`adapters/`: the Kysely repository, tree loader, component sync, migration
runner and files, the content pool (`ContentDbProvider`), the registry
reader `PgContentType.repository.ts` and
`KyselyContentTransactionRunner.adapter.ts` (`CONTENT_TRANSACTION_RUNNER`,
with `runInSavepoint`). `createMigrationDb` (in `ContentDatabase.adapter.ts`) is imported only by
`ContentEngine.module.ts` and `cli/ContentEngineCli.setup.ts`. Documents
runs every write through `CONTENT_TRANSACTION_RUNNER`.
Specs that seed rows open a unit with `inContentUnit(db, work)`
(`test/fixtures/ContentUnit.fixture.ts`), which runs the real runner.

### Rate limits (T10)

Fixed windows, per resolved client IP and, for login, per email. Each module
owns its policies in a constants file of its own (identity:
`src/modules/identity/http/IdentityHttp.constants.ts`; access, documents, media,
reviewer: `<module>.rate-limits.constants.ts`); `src/common/constants/Limits.constants.ts`
holds only the mechanism (rule type, key sources, window lengths, store caps).
Unit conversions (`MS_PER_SECOND`, `SECONDS_PER_DAY`, ...) are declared only in
`src/common/constants/Time.constants.ts`; a lint rule rejects a literal `1000` in
any other `*.constants.ts`:

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
| `MEDIA_UPLOAD`               | 120 / hour per IP, then 60 / hour per caller (`POST /media`)  |

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
- Limit overrides: a rule opts in with `limitOverrideEnvKey`; the key must be in
  `RATE_LIMIT_OVERRIDE_ENV_KEYS` (`src/config/Config.constants.ts`), which also
  drives the env parsing and the production opt-in check. Identity's
  `rateLimitOverrideBindings` lists the pairs. A rule name must be unique across
  all modules (one shared counter store; an architecture spec checks it).
- Key sources: `ip`, `email` (body.email, hashed) and `actor` (the signed-in
  account id; needs `JwtAuthGuard` before it, which a method-level
  `@Throttle` is; skipped when there is no signed-in account).
- Apply with `@Throttle(<MODULE>_RATE_LIMIT_POLICIES.X)` (`src/common/guards/Throttle.guard.ts`),
  placed last so it runs before the route's other guards. Over the limit:
  `429 TOO_MANY_REQUESTS` in the unified error shape plus `Retry-After`
  (seconds). The body is the same whichever rule fired.
- Who the caller is: `RateLimitModule.forRoot({ subjectResolver })` is called only
  from `App.module.ts`; access binds `ActorThrottleSubjectResolver`
  (`common/rate-limit` owns the `ThrottleSubjectResolver` port). `Clock` and
  `ClientIpResolver` come from the global `ClockModule` and `ClientIpModule`.
- Client IP: `ClientIpResolver` (`src/common/http/ClientIp.resolver.ts`) is the
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
  `src/common/constants/Limits.constants.ts`.

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
  (`409 API_TOKEN_REVOKED`). An expired token cannot be updated at all, not
  even to give it a new expiry (`409 API_TOKEN_EXPIRED`); it can still be
  revoked (`204`). Scope errors: `400 TOKEN_SCOPE_INVALID` or the
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

`POST /documents/:slug` and `PUT /documents/:slug/:documentId`. Auth: JWT account or API token (`DocumentAuthGuard`); anonymous and reviewer sessions get 403. Needs `create` / `update` on the content type, plus the `update` row conditions on PUT (a hidden row is 404 `DOCUMENT_NOT_FOUND`, and so is a row deleted by someone else while the update runs). Body = the document tree `{ values?, components? }`; PUT also needs `version` (the version the client edited; it is read first and never reaches the field allowlist).

Order of every write: allowlist (D4: resent `"***"` dropped, `FIELD_UNKNOWN` / `FIELD_NOT_WRITABLE` 400) -> tree shape (`assertTreeInput`) -> value rules (`documents/domain/ValueValidator.rules.ts`: type per field type, `required`, each value through its field type's `coerceValue` in the registry (`content-engine/field-types/`); richtext goes through `sanitizeRichtext` there (`sanitize-html` allowlist: editor tags, `a[href|title|target|rel]`, schemes http/https/mailto/tel; script, `on*`, `javascript:`, style stripped); 400 `DOCUMENT_INVALID`, message has the input path, never the value) -> one transaction.

- **Create** inserts a draft (`published_at` null, `version` 1, `created_by` = the actor or the token creator). A type with `draftAndPublish: false` stores one live row instead (`published_at` set at create); PUT then updates that row. The response (201) is the new record serialized for the actor, but only when the actor may read that row (read permission, read row conditions, and `read`+`update` for a draft); otherwise it is just `{ documentId, version }`. `create` permissions take no conditions: saving a role with one is 400 `PERMISSION_INVALID_CONDITION`.
- **Update**: `UPDATE ... SET version = version + 1 WHERE document_id AND version = $v` (takes the row lock) then `replaceTree`, in one transaction; after the write the row is re-checked against the `update` row conditions and the request is rolled back with 403 if the new content moved it out of scope. 200 returns the record under the same read gate as create (else `{ documentId, version }`). Of N concurrent updates with the same version exactly one wins.
- **Conflict** (`409 DOCUMENT_VERSION_CONFLICT`): `details = { currentVersion, server, submitted, diff }`. `server` is the stored document and `submitted` the sent changes applied on it, both through `RecordSerializer` with the actor's read access (masked fields are `***` / `null`, `_maskedFields` listed). `diff` is computed from those serialized records (`documents/domain/Diff.rules.ts`): entries `{ path, change: added|removed|changed|moved, server?, submitted? }`; components are matched by `componentUid`, an item without uid is `[new#<index>]`. An actor without `read` on the row (or whose read conditions exclude it) gets `server`/`submitted` null and an empty diff; `currentVersion` is still returned.

### Documents, publish and delete (T22, `src/modules/documents`)

`POST /documents/:slug/:documentId/publish` (body `{ expectedVersion }`, nothing else), `POST .../unpublish`, `DELETE /documents/:slug/:documentId`. Auth as for writes (JWT account or API token; anonymous and reviewer 403). Needs `publish` / `unpublish` / `delete` on the content type. The row conditions of that action pick the rows the actor can reach; rows outside them are 404 `DOCUMENT_NOT_FOUND`.

- **Publish** locks the draft row (`FOR UPDATE`), checks `expectedVersion` (stale = `409 DOCUMENT_VERSION_CONFLICT`, `details { currentVersion }` only), then in the same transaction deletes the published row and inserts a deep copy of the draft tree (`documents/domain/TreeCloner.rules.ts`; `component_uid`s kept, new row ids). The published row takes the draft's `version`; the draft is not changed. 200 `{ documentId, version }`. Concurrent publishes queue on the lock, so one published row remains (the partial unique indexes are the backstop). A republish with an unchanged draft is allowed. A type with `draftAndPublish: false` is 400 `DOCUMENT_NOT_PUBLISHABLE`.
- **Unpublish** deletes the published row (the tree cascades), keeps the draft: 204, or 404 when nothing is published.
- **Delete** deletes the draft and the published row (cascade): 204. Every row of the document must be inside the actor's `delete` conditions, else 404 and nothing is deleted. A `draftAndPublish: false` type deletes its one live row.
- **Activity tracking** is a port (`src/modules/documents/application/Documents.port.ts`: `ActivityRecorder`, token `ACTIVITY_RECORDER`; `Documents.module.ts` binds the `none` recorder). Publish, unpublish and delete call `record({ action, subject, documentId, accountId, tokenId?, version? })` after the commit; a failure is logged, never returned. Only the `none` adapter exists (default): the `database` adapter (SPEC D15) is not built yet. Create/update do not emit events yet.

### Documents, bulk (T34, `src/modules/documents/bulk.*`)

`POST /documents/:slug/bulk/create|publish|unpublish|delete`, body `{ atomic: boolean, items: [...] }`. **Collections only**: a single type is 400 `DOCUMENT_BULK_NOT_COLLECTION`. Auth and permissions as the single-document routes (JWT account or API token; anonymous and reviewer 403; the route's action on `:slug` is needed, else 403). Limits: 1 to 50 items (`DOCUMENT_BULK_LIMIT`), 200 component rows per create item (that item is rejected with `DOCUMENT_BULK_LIMIT`), body 1 MB (413 `PAYLOAD_TOO_LARGE`, middleware `documents/http/BulkBodyLimit.middleware.ts`; other routes keep Nest's 100 KB parser).

- **Items**: `create` = a document tree (`{ values?, components? }`, same allowlist and value rules as `POST /documents/:slug`, checked per item); `publish` = `{ documentId, expectedVersion }`; `unpublish` / `delete` = `{ documentId }`. Malformed publish/unpublish/delete items and repeated `documentId`s are 400 for the whole request.
- **`atomic: true`**: one transaction. The first failing item aborts everything: the request fails with that item's status and error code, and `details: { index, details }`. Nothing is written.
- **`atomic: false`**: always 200 with `{ atomic, succeeded, failed, results }`; `results[i]` is `{ index, status: 'ok', documentId, version? }` or `{ index, status: 'error', statusCode, errorCode, message, details? }`. Non-create items run in one transaction with a savepoint per item, so a failed item undoes only itself. Valid create items are inserted together.
- **Per item rules** are those of T21/T22 (reused code: `DocumentsCommandService.prepareCreate`, `PublishService.publishIn/unpublishIn/removeIn`): stale `expectedVersion` is 409 `DOCUMENT_VERSION_CONFLICT { currentVersion }`; rows outside the action's row conditions are 404 `DOCUMENT_NOT_FOUND` (not 403); publish/unpublish on a `draftAndPublish: false` type is 400 `DOCUMENT_NOT_PUBLISHABLE` for the whole request.
- **Batched inserts**: `ContentRepository.insertTrees` writes all roots in one INSERT and each component table level in one INSERT, all `RETURNING id`; the statement count does not grow with the item count.
- **Bodies hold ids and versions only** (create: `{ documentId, version: 1 }`), never records. Publish/unpublish/delete tell the activity port after commit, per succeeded item.
- Routing: `BulkController` is registered before `DocumentsController` so `bulk` is never read as a `:documentId`.

### Documents, presence (T26, `src/modules/documents`)

`POST /documents/:slug/:documentId/presence` (SPEC D16), body `{ state?: 'viewing' | 'editing' }` (default `editing`, nothing else allowed). Needs `update` on the content type and the document's draft row inside the actor's `update` row conditions (else 404). Only account sessions: anonymous, reviewer and API token callers get 403. Heartbeat every 20 s; an entry expires 45 s after its last heartbeat (`PRESENCE_TTL_MS`). 200 returns everyone active on the document, each `{ accountId, displayName, state, lastSeenAt }` and nothing else (`accountId` is the account's public UUID, the `id` of `GET /auth/me`, never the internal numeric id; the caller is included, clients filter themselves out). In-memory store, one replica; capped at `PRESENCE_MAX_ENTRIES` (new editors get 429 at the cap). No audit event (not a content change).

### Media (T27, D12, `src/modules/media`)

- `POST /media`: `multipart/form-data`, one `file` part and an optional `alt` text field (max 500 characters); any other part is 400 `MEDIA_INVALID_UPLOAD`, a non-multipart body is 415. Needs `media` `create`; JWT sessions only. Throttled by `MEDIA_UPLOAD`. 201 returns `{ id, fileName, mimeType, size, width, height, alt, url, thumbnailUrl, isReviewerPreset, createdAt }` (`id` = `document_id`; the storage key and hash are never returned).
- Pipeline (`adapters/UploadProcessing.adapter.ts`, port `UploadProcessor` in `application/Media.port.ts`, use case `application/UploadMedia.service.ts`): `busboy` streams the file to a temp file (deleted afterwards), so a request is never buffered whole. The type is detected from the magic bytes with `file-type`; the declared type and the file name are ignored. Allowlist: JPEG, PNG, WebP, GIF, AVIF, PDF, MP4. Anything else, SVG and HTML included, is 415 `MEDIA_UNSUPPORTED_TYPE`. Limits per detected type (`MEDIA_MAX_BYTES`): image 10 MB, pdf 20 MB, video 100 MB; over the limit stops the stream and answers 413 `MEDIA_FILE_TOO_LARGE`; a `Content-Length` far above the largest limit is refused up front.
- Images are decoded and re-encoded with sharp in the same format (orientation applied, ICC profile kept, no EXIF/GPS/XMP, input capped at 50 million pixels); bytes that pass the magic check but do not decode are 415. This also drops anything appended to the image (polyglots). PDF and MP4 are stored as received (their magic bytes are checked, not their content); they are served from the storage provider's domain, never the API's.
- The storage key is a UUIDv7 (`src/modules/media/domain/Uuidv7.rules.ts`, time from `Clock`); the full SHA-256 of the stored bytes is kept in `file_library.sha256` (no dedupe yet). The file name is kept only for display (path and control characters removed, 255 characters). If the row cannot be written, the stored object is removed again.
- Storage port: `MEDIA_STORAGE` (`MediaStorage` in `application/Media.port.ts`: `put`, `delete`; adapters `adapters/Cloudinary.adapter.ts` and `adapters/Fake.adapter.ts`). `MEDIA_PROVIDER=fake` keeps bytes in memory (dev and tests, rejected in production by the env schema and again by its factory); providers are chosen through `MEDIA_STORAGE_FACTORIES` in `Media.module.ts` (a `Record` per provider; a new provider adds one entry, mail does the same with `MAIL_SENDER_FACTORIES`); `cloudinary` uploads with the SDK (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional `CLOUDINARY_FOLDER`; all three required with that provider). Rows from both are stored with `provider = cloudinary`. Images get a thumbnail URL (320 px longest side); PDF is stored as a Cloudinary `raw` resource, video as `video`.
- `GET /media?page=&pageSize=` (the shared list convention): newest first, soft-deleted rows hidden. Needs `media` `read`. The policy row filter (`PolicyEvaluator.rowFilter`) limits read-only actors (reviewer, anonymous) to `is_reviewer_preset = true` rows, whatever their role is called. Reviewer sessions reach this route at T32.
- `DELETE /media/:id` (T28, `MediaLibraryService.remove`): needs `media` `delete` (row filter applied; JWT sessions only). 204 on success: soft delete (`deleted_at`) plus a `media.deleted` audit row (subject `media`, target = the file's `document_id`, metadata `{ mimeType }`) in the same transaction. 409 `MEDIA_IN_USE` while any `media` column of any content table (root or component, draft or published row) holds the file; the check runs under a row lock on the file. 404 `MEDIA_NOT_FOUND` for an unknown, already deleted or out-of-scope file; 400 for a non-UUID id.
- Purge (`jobs/MediaPurge.job.ts` on `infrastructure/scheduling/IntervalJob.adapter.ts`, use case `application/PurgeDeletedMedia.service.ts`): an in-process job, hourly (`MEDIA_PURGE_INTERVAL_MS`), removes the stored object and then the row of files soft-deleted over 24 h ago (`MEDIA_PURGE_GRACE_MS`), walking all eligible rows in id order in batches of 100 (rows that stay never block later ones). A file a document points at again is skipped. Every replica runs it (harmless). A failed storage delete is logged and retried next run. Known limit: a document can attach the file between the reference check and the row delete; the object is then gone while the document still points at the (deleted) row.
- `PATCH /media/:id` (T29, `MediaLibraryService.updateAlt`): strict body `{ alt: string | null }` (trimmed; blank or `null` clears; max 500 characters, else 400 `ACCESS_INVALID_REQUEST`). Needs `media` `update` (row filter applied; JWT sessions only). 200 returns the same view as upload. 404 `MEDIA_NOT_FOUND` for an unknown, deleted or out-of-scope file; 400 for a non-UUID id. Not audited (SPEC §7 audits media delete only). The row filter is applied in the update statement itself, so a row that leaves the actor's scope between check and write is not changed.
- Media views (upload, list, PATCH) include `provider`.
- Media in documents (T29, `application/DocumentMedia.service.ts`): a `media` field is written as the file's uuid (`id` of the media views) or `null`; an integer, unknown, deleted or (by the `media` read row filter) unreadable file is 400 `DOCUMENT_INVALID`. The column stores `file_library.id`, so `MEDIA_IN_USE` keeps working. Every document read (list, detail, write response, 409 `server` and `submitted`) returns the file instead: `{ id, fileName, url, thumbnailUrl, provider, alt, size, createdAt }` (`null` when empty, masked or gone). The embed follows the field's read permission, not `media` read. The internal id is never returned; `media` fields cannot be used in list `filter` or `sort` (400). Test type `content/schemas/profile.json` (`name`, `photo` media; migration `0002_content.sql`).

### Reviewer (T31, D2, `src/modules/reviewer`)

| Route                                    | Who                                | Result                                                                                                         |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /reviewer/status`                   | public (120/min/IP)                | `{ enabled }`, the owner's toggle (`app_settings` key `reviewer.enabled`, default off)                         |
| `POST /reviewer/sessions`                | public                             | 201 `{ accessToken, expiresAt }`: ephemeral `reviewer` account, 24 h access token, no refresh token, no cookie |
| `GET /reviewer/sessions?page=&pageSize=` | owner (`reviewer_settings` read)   | `{ data, meta }`, newest first; `notes` is plain text (render as text); the IP is never returned               |
| `PUT /reviewer/settings`                 | owner (`reviewer_settings` update) | body `{ enabled }`; 200 `{ enabled }`                                                                          |

`POST /reviewer/sessions` body (strict): `visitorRole` (1-64 chars, one line), `purposeTags` (at most 10 labels of 1-40 chars, default none), `notes` (optional, at most 500 characters, plain text: no control characters other than tab and newline), `turnstileToken` (the widget response). Deploy switch (ADR 0014): with `REVIEWER_FEATURE_ENABLED=false` (the default) all four reviewer routes answer 404 `REVIEWER_FEATURE_OFF` as soon as the request passes the guards, throttles and body validation (no Turnstile call, no DB access), and the cleanup job does not start; the owner routes still answer 401/403 to a caller without rights first. Order of checks with the switch on: body 400, then enabled (403 `REVIEWER_DISABLED`), global cap of 200 active sessions (503 `REVIEWER_CAPACITY_REACHED`), 1 session per IP per 10 min (429 `REVIEWER_IP_LIMITED` with `Retry-After`), then Turnstile server-side (400 `REVIEWER_TURNSTILE_FAILED`; 503 `REVIEWER_UNAVAILABLE` when Cloudflare cannot be reached). The cap and the IP rule are re-checked under an advisory lock in the creating transaction. The IP is stored only as an HMAC-SHA256 (key derived from `OTP_PEPPER` with HKDF). `TURNSTILE_SECRET_KEY` (or `OTP_PEPPER`) unset: 503 `REVIEWER_UNAVAILABLE`, never a bypass. `TURNSTILE_EXPECTED_HOSTNAME` (optional) makes a passing verification also have to report that hostname. The audit row stores the IP HMAC, never the raw IP. Reviewer accounts never appear in `GET /accounts` and answer 404 on every account management route; reviewer tokens get 403 on the self-service 2FA and password routes. An extra in-memory limit of 20 attempts per IP per 10 min bounds Turnstile calls.

Layout: `application/ReviewerAccess.service.ts` (status, toggle, create session, list) and `ReviewerCleanup.service.ts` over the ports in `application/Reviewer.port.ts` (`ReviewerRepository`, `ReviewerAccountGateway`, `TurnstileVerifier`); Prisma adapters `adapters/PrismaReviewer.repository.ts` and `PrismaReviewerAccount.adapter.ts` (the only reviewer file that writes `token_version`); `adapters/Turnstile.client.ts` (secret kept inside, 5 s timeout, zod-parsed reply). `Reviewer.module.ts` binds the verifier from config (unset secret: the unconfigured verifier) and derives the IP HMAC key once. Refusals are `DomainError`s built in `domain/ReviewerAdmission.rules.ts`.

`PUT /reviewer/settings` always bumps the `reviewer` role's `policy_version`; switching **off** also bumps `token_version` of every reviewer account, so live sessions get 401 on their next request (and stay dead if reviewer access is switched on again). Audited as `reviewer.settings_changed` (metadata: `enabled`, `sessionsRevoked`) and `reviewer.session_created` (actor = the new reviewer account). A JWT whose account holds the `reviewer` role is always the read-only `reviewer` actor (published content only, no writes, whatever the role rows say). `jobs/ReviewerCleanup.job.ts` (every 10 min, in-process, on `infrastructure/scheduling/IntervalJob.adapter.ts`) runs `application/ReviewerCleanup.service.ts`, which deletes reviewer accounts whose session expired; their session rows go with them and audit rows keep the text with the actor link set to null.

### Security audit (T17, D15)

`SecurityAuditService` (`src/modules/security-audit/application/SecurityAudit.service.ts`,
provided only by `SecurityAuditModule`; rows are stored through the `AuditLogWriter` port, implemented by `adapters/PrismaAuditLog.repository.ts`)
writes one `audit_logs` row per security event, always on, in the same
transaction as the change it records. Events with no write of their own
(failed sign-in, failed re-auth) insert a standalone row. Action names live
in `src/modules/security-audit/domain/SecurityAudit.constants.ts` (`<domain>.<event>`): `auth.login_succeeded`
/ `login_failed` / `logout` / `refresh_reuse_detected` / `otp_issued`,
`password.reset` / `set` / `changed` / `change_failed`, `two_factor.enabled`
/ `disabled` / `verify_failed` / `manage_failed` / `reset_by_operator`,
`account.invited` / `updated` / `role_changed` / `disabled` / `enabled`
(metadata `status`) / `invite_resent` / `sessions_revoked`, `role.created` / `updated` / `deleted` /
`permissions_replaced`, `api_token.created` / `updated` / `revoked`,
`media.deleted`.

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
Layout: `http/` (controller, routes), `application/` (`ContentTypes.service`,
`FULL_CATALOG_PERMISSION`), `domain/` (`ContentTypeView.rules`, the
`contentTypeNotFound()` `DomainError`). The view rules take the access
values they need (`CONDITION_SYSTEM_FIELDS`, `joinFieldPath`) as a
`ViewVocabulary` from the service, because `domain/` imports only types and
`isComponentField` from other modules.

Rules, the default role matrix, the DSL and the revocation flow: [docs/modules/access-control.md](../../docs/modules/access-control.md).

## Content types

Content types are JSON files in `content/schemas/` (e.g. `cv-page.json`).
`src/modules/content-engine/domain/DefinitionValidator.rules.ts` checks them (shape,
naming, depth ≤ 3, 63-byte names, collisions) and returns structured errors;
`domain/Naming.rules.ts` is the single source of generated SQL names. Tables are created
only by migrations in `content/migrations/` (`content:generate`, then
`content:migrate`). At runtime, `ContentTypeRegistry` resolves a slug to its
table plans and `ContentRepository` reads and writes whole documents (root +
component tree) with batched, parameterized Kysely queries. Format, rules
and repository behaviour:
[docs/modules/content-schema.md](../../docs/modules/content-schema.md).

## GraphQL schema (D18)

`src/modules/graphql/schema/schema.builder.ts` builds the GraphQL schema from
the content definitions with a pure function (`buildGraphqlSchema`: no Nest,
no database). The generated SDL is committed as `content/schema.graphql`
(never hand-edit it): run `pnpm --filter @abyss/cms-api graphql:print-schema`
after changing `content/schemas/*.json`; `-- --check` exits 1 when the file
is stale. A name clash (two slugs, `<x>List` vs another item field, a type
named like a shared one) fails the build of the schema and renames nothing.
Design: [docs/modules/graphql.md](../../docs/modules/graphql.md).

### Public constants snapshot

`content/public-constants.json` holds the cms-api constants that the admin,
web, kit and e2e suite mirror (password bounds, OTP and TOTP lengths, setup
token max, reviewer input limits, refresh cookie name, error codes,
permission actions, system subjects, richtext URL schemes). It is built by
`src/contract/PublicConstants.contract.ts` from `*.constants.ts` exports only, so no
env value or secret can reach it. Run `pnpm --filter @abyss/cms-api
contract:print` after changing a mirrored constant; `-- --check` (CI) exits 1
when the file is stale. Only client tests import the JSON.

### GraphQL endpoint (GQ2, `src/modules/graphql`)

`POST /api/v1/graphql`, queries only, JSON body `{ query, variables?,
operationName? }` (non-JSON is 415, an array or a missing `query` is 400).
Same callers as document reads (`DocumentAuthGuard`: JWT, API token, or no
header = `public`; an invalid credential is 401 in the REST error shape) and
the same anonymous throttle (120/min/IP, one request counts once). Root
fields read through `DocumentsQueryService` unchanged, so masking, row
conditions, drafts (`status: DRAFT` needs read + update) and `QueryGuard`
behave as in REST. `page` 1..10000, `pageSize` 1..100, at most 3 distinct
sort keys, filter count and value limits as REST; empty `sort` = newest
`updatedAt` first. A content type the caller cannot read is reported exactly
like an unknown field (400, no `data`). Errors after parsing are
`{ errors: [{ message, path, extensions: { code, details?, requestId } }] }`
with the REST `errorCode` values plus `GRAPHQL_PARSE_FAILED`,
`GRAPHQL_VALIDATION_FAILED` and `GRAPHQL_LIMIT_EXCEEDED`; 400 before
execution, 200 after.

**Limits** (`GRAPHQL_LIMITS` in `application/Graphql.constants.ts`):

| Limit           | Value  | Over the limit                                                |
| --------------- | ------ | ------------------------------------------------------------- |
| Body size       | 32 KiB | 413 `PAYLOAD_TOO_LARGE`, GraphQL error shape, body not parsed |
| Parser tokens   | 2000   | 400 `GRAPHQL_LIMIT_EXCEEDED`                                  |
| Field depth     | 8      | 400 `GRAPHQL_LIMIT_EXCEEDED`                                  |
| Root fields     | 5      | 400 `GRAPHQL_LIMIT_EXCEEDED` (aliases count)                  |
| Selected fields | 500    | 400 `GRAPHQL_LIMIT_EXCEEDED` (after fragment expansion)       |

The body cap is a middleware on the GraphQL path, mounted before Nest's JSON
parser (`http/GraphqlBodyLimit.middleware.ts`). The token, depth, root-field and
field-node checks run before the access policy or the schema is loaded, so an
over-limit query costs no database work. Each operation of a document is
judged on its own. Dev introspection roots (`__schema`, `__type`) are not
counted; production refuses introspection anyway.

**Production** (`NODE_ENV=production`): introspection is refused for everyone
(400 `GRAPHQL_VALIDATION_FAILED`) and "Did you mean" hints are removed from
every message. No environment serves a playground; use the committed SDL
(`content/schema.graphql`) or an external GraphQL client. No new env keys.

## Scripts

| Script                           | What it does                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build`                          | `nest build` to `dist/` (clears `dist/` first)                                                                                                                                                               |
| `start`                          | `nest start`: build, then run (shell env only)                                                                                                                                                               |
| `start:dev` / `start:debug`      | `nest start --watch` (`--debug` for the inspector), loading `.env.local`                                                                                                                                     |
| `start:prod`                     | `node dist/main` (needs a build)                                                                                                                                                                             |
| `test`                           | Unit (`src/**/*.spec.ts`) and integration (`test/integration`) tests                                                                                                                                         |
| `test:unit` / `test:integration` | One Jest project only                                                                                                                                                                                        |
| `lint`                           | Oxlint, then ESLint with typescript-eslint (type-aware)                                                                                                                                                      |
| `typecheck`                      | `tsc --noEmit` over `src` and `test`                                                                                                                                                                         |
| `content:generate`               | Build, then write the next content migration (`--dry-run`, `--name`, `--allow-destructive`)                                                                                                                  |
| `graphql:print-schema`           | Build, then write `content/schema.graphql` from `content/schemas` (`--check` fails if stale)                                                                                                                 |
| `contract:print`                 | Build, then write `content/public-constants.json` from the `*.constants.ts` exports the clients mirror (`--check` fails if stale)                                                                            |
| `content:migrate`                | Apply pending content migrations (needs a build and the `DB_*` connection)                                                                                                                                   |
| `deploy:migrate`                 | Init-container command: `db:migrate`, then `content:migrate` (stops at first failure)                                                                                                                        |
| `db:generate`                    | Generate the Prisma client                                                                                                                                                                                   |
| `db:migrate`                     | Apply core Prisma migrations, then seed system roles + default permissions (needs a build)                                                                                                                   |
| `db:migrate:dev`                 | Development: create a core migration from schema changes                                                                                                                                                     |
| `db:seed`                        | Seed system roles + default permissions only (idempotent)                                                                                                                                                    |
| `owner:bootstrap`                | Create the single owner (`OWNER_EMAIL`, hidden password prompt or `--password-stdin`); fallback to the setup route                                                                                           |
| `owner:reset-2fa`                | Break-glass: turn 2FA off for one account and end its sessions (`--email`, `--yes`)                                                                                                                          |
| `seed:account`                   | Smoke stacks only: create one active test account (`--email`, `--role admin\|guest`, `--email-2fa`, `--password-stdin`); in production needs `ALLOW_ACCOUNT_SEED=smoke` on that one command, never in config |

Integration tests start Postgres 17 with Testcontainers, so Docker must be
running. The Jest global setup starts one container for the whole run, and
each test file gets its own database on it (`startPostgres()` in
`test/fixtures/Postgres.fixture.ts`). Jest runs with `--experimental-vm-modules` because the Prisma 7
client loads its query compiler with a dynamic `import()`.

`S3BackupStorage.integration.spec.ts` also starts an S3 stand-in container
(`chrislusf/seaweedfs:4.51`) to check listing, lookup and presigned downloads
of the backup adapter.

### Backup storage config (ADR 0013)

Six optional keys describe the off-site bucket that holds the nightly database
dumps: `BACKUP_STORAGE_ENDPOINT` (S3 API origin, `https:` in production),
`BACKUP_STORAGE_REGION` (default `auto`), `BACKUP_STORAGE_BUCKET`,
`BACKUP_STORAGE_PREFIX` (default `postgres/`, ends with `/`),
`BACKUP_STORAGE_ACCESS_KEY_ID` and `BACKUP_STORAGE_SECRET_ACCESS_KEY`. Endpoint,
bucket and both key parts are set together or not at all; unset, the feature is
off (`loadAppConfig(...).backups` is `undefined`). The key pair is a read-only
token (list + get), never the backup job's write credential, and both parts are
redacted in the boot summary. `modules/backups/adapters/S3BackupStorage.adapter.ts`
implements the `BackupStorage` port (`list`, `find`, `createDownloadUrl`) with
the official S3 SDK. Design: `docs/adr/0013-backup-download.md`. The bucket, the
nightly job and the key placement (ConfigMap or Secret) are in
`docs/deployment/k3s-traefik.md` section 7.

## Docker

```bash
docker build -f apps/cms-api/Dockerfile -t abyss-cms-api .   # from the repo root
```

Multi-stage: `turbo prune` keeps cms-api only, the build stage compiles it,
and `pnpm deploy --prod` copies production dependencies into a runtime image
that runs as the numeric `node` user (`USER 1000:1000`) on port 3000. Pass config as env vars; `.env*`
files are never copied into the build context (`.dockerignore`).

### Two containers: init + main (T37a)

cms-api ships as one image run as two containers in one pod (or compose
project). Same image, different command; no second Dockerfile.

| Container | Command                   | Does                                                                                                              |
| --------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| init      | `npm run deploy:migrate`  | `db:migrate` (Prisma `migrate deploy` + role seed), then `content:migrate` (committed `content/migrations/*.sql`) |
| main      | `node dist/main.js` (CMD) | Serves the API; runs no migrations                                                                                |

- Order: core migrations first, content migrations second. It stops at the
  first failure with a non-zero exit, so the main container never starts on
  a half-migrated database (compose: `depends_on` with
  `service_completed_successfully`; Kubernetes: `initContainers`).
- Idempotent: a second run prints "No pending migrations to apply." and "No
  pending content migrations." and exits 0. Concurrent runs are safe (Prisma
  migrate lock; the content runner takes `pg_advisory_xact_lock`).
- Applies committed migrations only. It never runs `content:generate` (no
  schema parsing or merging at deploy time; CI checks that the committed
  migrations are current) and never runs `owner:bootstrap` (a manual,
  one-time step).
- Env: the full API config, same as the main container (the CLIs load it):
  `DB_*`, `JWT_*`, `OTP_PEPPER`, `TOTP_ENC_*`, `ADMIN_ORIGIN`, `WEB_ORIGIN`,
  `MAIL_*`, `MEDIA_*` (see `.env.example`).

The individual steps can also be run by hand, in this order:

```bash
docker run --rm --env-file api.env abyss-cms-api npm run deploy:migrate   # init container command
# or the two steps separately:
docker run --rm --env-file api.env abyss-cms-api npm run db:migrate
docker run --rm --env-file api.env abyss-cms-api node dist/modules/content-engine/cli/ContentMigrate.command.js
# once, on first deploy:
docker run --rm -it --env-file api.env -e OWNER_EMAIL=me@example.com abyss-cms-api npm run owner:bootstrap
# break-glass only, lost authenticator (see "Break-glass 2FA reset"):
docker run --rm --env-file api.env abyss-cms-api npm run owner:reset-2fa -- --email someone@example.com --yes
```

`pnpm smoke` (repo root) runs this image behind Traefik together with both
SPAs; see `scripts/smoke.sh`.
