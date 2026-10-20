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
must be at least 32 bytes; `ADMIN_ORIGIN`, `WEB_ORIGIN` and `JWT_ACCESS_KID`
are required.

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
- Every error returns `{ statusCode, errorCode, message, requestId }`.
  5xx responses use a generic message; details go to the log only. To return
  a specific code, throw an `HttpException` whose response object has an
  `errorCode` property.

## Endpoints

| Method | Path                   | Response                                                                                       |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/health/live`  | `200 { "status": "ok" }`                                                                       |
| GET    | `/api/v1/health/ready` | `200 { "status": "ok" }`, or `503 { "status": "error" }` when the DB ping fails or exceeds 2 s |

### Auth (T09, `src/modules/identity`)

| Method | Path                   | Auth                    | Response                                                                             |
| ------ | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/api/v1/auth/login`   | none                    | `200 { accessToken }` + refresh cookie, or `200 { requires2FA, tempToken, methods }` |
| POST   | `/api/v1/auth/refresh` | refresh cookie + Origin | `200 { accessToken }` + rotated refresh cookie                                       |
| POST   | `/api/v1/auth/logout`  | refresh cookie + Origin | `204`, family revoked, cookie cleared                                                |
| GET    | `/api/v1/auth/me`      | `Authorization: Bearer` | `200 { id, email, displayName, role, twoFactorEnabled }`                             |

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
- `/auth/refresh` and `/auth/logout` require `Origin` to be exactly
  `WEB_ORIGIN` or `ADMIN_ORIGIN`, otherwise `403 AUTH_ORIGIN_NOT_ALLOWED`.
  CORS stays admin-only.
- 2FA accounts get a signed 300 s temp token (`typ: 2fa`) and no session.
  This is a stub until T13 adds the verify endpoint and the attempt limit.

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
  authenticator code; until T13 the check fails closed), `401
AUTH_INVALID_CREDENTIALS` (wrong current password), `400
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

| Policy              | Limit                                         |
| ------------------- | --------------------------------------------- |
| `LOGIN`             | 10 / 15 min per IP, then 5 / 15 min per email |
| `REFRESH`           | 30 / min per IP                               |
| `OTP_REQUEST`       | 5 / 15 min per IP, then 5 / hour per email    |
| `PASSWORD_SUBMIT`   | 10 / 15 min per IP (reset, set)               |
| `PASSWORD_CHANGE`   | 5 / 15 min per IP                             |
| `TWO_FACTOR_VERIFY` | 10 / 15 min per IP (attached by T13)          |

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

## Core database (Prisma)

Core tables (accounts, roles, permissions, tokens, media, audit, settings)
live in schema `public`, managed by Prisma 7 with `@prisma/adapter-pg`
(`prisma/schema.prisma`, `prisma.config.ts`). The client is generated into
`src/generated/prisma` (gitignored); turbo runs `db:generate` before build,
lint, typecheck and test. `db:migrate` applies migrations and seeds the six
system roles; `owner:bootstrap` creates the single owner once. Decisions and
usage: [docs/modules/core-schema.md](../../docs/modules/core-schema.md).

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
| `db:migrate`                     | Apply core Prisma migrations, then seed system roles (needs a build and `DATABASE_URL`)     |
| `db:migrate:dev`                 | Development: create a core migration from schema changes                                    |
| `db:seed`                        | Seed system roles only (idempotent)                                                         |
| `owner:bootstrap`                | Create the single owner (`OWNER_EMAIL`, hidden password prompt or `--password-stdin`)       |

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
```

`pnpm smoke` (repo root) runs this image behind Traefik together with both
SPAs; see `scripts/smoke.sh`.
