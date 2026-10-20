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
must be at least 32 bytes; `ADMIN_ORIGIN` is required.

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

The readiness ping goes through the `DATABASE_HEALTH` token
(`src/infrastructure/database/database-health.ts`), bound to
`PrismaDatabaseHealth` (`SELECT 1` through `PrismaService`).

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
