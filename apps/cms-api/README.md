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

Production guards (`NODE_ENV=production`): `MAIL_PROVIDER=console` is
rejected, and `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY` are required and
must be at least 32 bytes.

## HTTP pipeline

- Global prefix `/api/v1`. Express `strict routing` is off, so `/x/` and `/x`
  hit the same route without a redirect.
- `trust proxy` is set to `TRUST_PROXY_HOPS` (a number, never `true`).
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

The readiness ping goes through the `DATABASE_HEALTH` token
(`src/infrastructure/database/database-health.ts`). T02 binds it to a
one-connection `pg` pool; T08 rebinds it to Prisma without touching the health
module.

## Scripts

| Script                           | What it does                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| `build`                          | `tsc` to `dist/`                                                     |
| `test`                           | Unit (`src/**/*.spec.ts`) and integration (`test/integration`) tests |
| `test:unit` / `test:integration` | One Jest project only                                                |
| `lint`                           | Oxlint, then ESLint with typescript-eslint (type-aware)              |
| `typecheck`                      | `tsc --noEmit` over `src` and `test`                                 |

Integration tests start Postgres 16 with Testcontainers, so Docker must be
running.
