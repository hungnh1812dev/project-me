# Local run guide

How to run the stack on your machine: install, the three apps in dev mode, a local database, and the smoke stack. Production deployment is in `docs/deployment/k3s-traefik.md`; secrets there are in `docs/deployment/k3s-secrets-sops.md`.

Requirements: Node >= 24, pnpm 11, Docker (database, smoke stack, cms-api integration tests).

```
pnpm install
```

## 1. Choose how to run

| Goal                                          | Use                                             |
| --------------------------------------------- | ----------------------------------------------- |
| Work on one app with hot reload               | Section 2 to 5 (dev servers + a local Postgres) |
| See the whole thing behind Traefik, like prod | Section 6 (smoke stack, needs only Docker)      |
| Run the browser tests                         | `SMOKE_E2E=1 pnpm smoke` (section 6)            |

## 2. Local database

cms-api needs PostgreSQL 16. Any instance works; the quickest is a throwaway container (values below are examples; pick your own password):

```
docker run -d --name abyss-dev-db -p 5432:5432 \
  -e POSTGRES_DB=abyss -e POSTGRES_USER=abyss -e POSTGRES_PASSWORD=<password> \
  postgres:16-alpine
```

Remove it with `docker rm -f abyss-dev-db` (data is lost with the container).

## 3. cms-api (port 3000)

cms-api reads `process.env` only. **It does not load a `.env` file itself** (`apps/cms-api/prisma.config.ts` says the same for the Prisma CLI), so export the values into the shell that runs it.

Shortcut for development: `start:dev` loads `apps/cms-api/.env.local` through Node (`--env-file-if-exists`), builds, and restarts on every rebuild. Variables already set in the shell win over the file. Only `start:dev` does this; `db:migrate`, the CLIs (`owner:bootstrap`, ...), `start` and production read the shell env only.

```
cp apps/cms-api/.env.example apps/cms-api/.env.local    # edit the values
pnpm start:cms-api:dev      # or pnpm start:dev for cms-api + admin + web (needs the local Postgres)
```

Without `.env.local` it still starts and stops on the config check, listing the failing keys.

The manual way (shell env, no watch):

```
cd apps/cms-api
cp .env.example .env        # edit: DB_PASSWORD and the three secrets below
set -a; . ./.env; set +a    # export every key into this shell
openssl rand -base64 48     # run three times: JWT_ACCESS_SECRET, OTP_PEPPER, TOTP_ENC_KEY
pnpm build
pnpm db:migrate             # Prisma migrations + system role seed
pnpm content:migrate        # content-type tables from content/migrations
pnpm start                  # http://localhost:3000/api/v1, health: /api/v1/health/ready
```

(`pnpm deploy:migrate` runs the two migrate steps in order.) After a code change, `pnpm build` again, then `pnpm start`. Create the one owner account once, in either way:

- **Setup page:** export `OWNER_SETUP_TOKEN` (at least 32 bytes in production, any non-empty value in development; `openssl rand -base64 32`) before `pnpm start`, run the admin (`pnpm --filter @abyss/cms-admin dev`), open `http://admin.domain.localhost:5173/setup`, enter the token and the owner details, then sign in on the login page. The page closes itself once an owner exists; unset the token afterwards.
- **CLI:**

```
OWNER_EMAIL=you@example.com pnpm owner:bootstrap     # password at a hidden prompt
```

A second owner is refused either way.

Required keys, from `apps/cms-api/.env.example` (the file documents every key; the app refuses to start on a bad value and lists the failing keys, never the values):

| Key                                                | Local value                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DB_HOST`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | the container from section 2 (`DB_PORT` defaults to 5432)                     |
| `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY`  | any random strings; each at least 32 bytes in production                      |
| `ADMIN_ORIGIN`                                     | `http://admin.domain.localhost:5173` (CORS origin; matches the admin dev URL) |
| `WEB_ORIGIN`                                       | `http://domain.localhost:5174`                                                |
| `MAIL_PROVIDER`                                    | `console` (OTP codes appear in the cms-api log)                               |
| `MEDIA_PROVIDER`                                   | `fake` (uploads kept in memory, lost on restart)                              |

Every other key is optional locally. `apps/cms-api/.env.example` is the list: it names each key, says when it applies and what the default is, and marks the CLI-only ones (`OWNER_EMAIL`, `OWNER_DISPLAY_NAME`). A spec (`config/env-example.parity.spec.ts`) fails when that file and the config schema drift apart. Do not set the `*_RATE_LIMIT_*` keys; they are for the smoke stack.

Tests: `pnpm --filter @abyss/cms-api test:unit`, and `test:integration` (Testcontainers; Docker must be running).

## 4. cms-admin (port 5173)

```
cp apps/cms-admin/.env.example apps/cms-admin/.env.local
pnpm --filter @abyss/cms-admin dev
```

Open `http://admin.domain.localhost:5173` (Chromium resolves `*.localhost` to loopback), so the origin matches cms-api `ADMIN_ORIGIN`.

| Key                 | Meaning                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | absolute cms-api base, no trailing slash: `http://localhost:3000/api/v1`. Bundled at build |
| `DEV_SERVER_PORT`   | dev only, default 5173                                                                     |

## 5. web (port 5174)

```
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @abyss/web dev
```

Open `http://domain.localhost:5174`. The dev server forwards `/api` to cms-api when `DEV_API_PROXY_TARGET` is set, so the browser sees one origin, like production.

| Key                              | Kind                | Meaning                                                                                 |
| -------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`       | browser, build time | `/api/v1` (required; a missing value fails the build)                                   |
| `NEXT_PUBLIC_ADMIN_URL`          | browser, build time | optional; empty hides the "Open CMS" link                                               |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | browser, build time | optional public site key; empty hides "Reviewer access". Cloudflare publishes test keys |
| `API_INTERNAL_URL`               | server, runtime     | cms-api as the Next server reaches it: `http://localhost:3000/api/v1`                   |
| `WEB_REVALIDATE_SECONDS`         | server, runtime     | data cache seconds, default 60; use `0` while developing content                        |
| `WEB_PORT`                       | server, runtime     | port of `pnpm start` (production server), default 8080                                  |
| `DEV_SERVER_PORT`                | dev only            | read from the shell, not `.env.local`; default 5174                                     |
| `DEV_API_PROXY_TARGET`           | dev only            | `http://localhost:3000`; empty = no proxy                                               |

`NEXT_PUBLIC_*` values are baked into the browser bundle: never put a secret in them. Web and admin have no secrets.

## 6. Smoke stack (everything behind Traefik, Docker only)

`docker-compose.smoke.yml` builds and starts Postgres, Mailpit (catches OTP mail), the cms-api init container (`deploy:migrate`), cms-api, web, cms-admin and Traefik, with the same routing as production. It is for local testing only; CI does not use it. Static cms-api settings are in `scripts/stack/cms-api.env`; per-run secrets are generated by `scripts/smoke.sh`, so you do not provide any. The checks live in `scripts/smoke/<group>.sh` (one `check_<group>()` function each); `smoke.sh` keeps the stack lifecycle, the assert helpers and the call order.

```
pnpm smoke                    # build, start, check routing/auth/mail/headers, tear down
SMOKE_KEEP=1 pnpm smoke       # keep it running for browser checks
SMOKE_E2E=1 pnpm smoke        # also run the Playwright suite
pnpm --filter @abyss/e2e browsers:install    # first time only
docker compose -p abyss-smoke down -v        # stop a kept stack
```

URLs with a kept stack: `http://domain.localhost:8080` (web, `/api` to cms-api) and `http://admin.domain.localhost:8080` (admin). Other switches (`SMOKE_DOMAIN`, `SMOKE_HTTP_PORT`, `SMOKE_TIMEOUT_SECONDS`, `SMOKE_NO_BUILD`) are listed at the top of `scripts/smoke.sh`. Run one e2e spec against a kept stack with `pnpm e2e:spec <spec> [-g <name>]`; the e2e keys are in `apps/e2e/.env.example`, and `pnpm smoke` sets them for you.

## 7. Everyday commands

| Task          | Command                                                   |
| ------------- | --------------------------------------------------------- |
| build / types | `pnpm build`, `pnpm typecheck`                            |
| lint          | `pnpm lint`                                               |
| unit tests    | `pnpm test` (all), `pnpm --filter <name> test`            |
| format        | `pnpm exec prettier --write <files>`, `pnpm format:check` |

## 8. Never commit real values

Only the `.env.example` files are committed, with names and descriptions. `.env`, `.env.local` and any real value stay local.
