# Local run guide

How to run the stack on your machine: install, the three apps in dev mode, a local database, and the smoke stack. The checks CI runs: [run-checks-locally.md](run-checks-locally.md). Production deployment: [docs/deployments/](../deployments/devops-runbook.md).

## Quick start

Needs Docker (running), Node >= 24 and pnpm 11. Use a Chromium-based browser: it resolves `*.localhost` names to your machine.

```
pnpm install
pnpm demo
pnpm dev:stack:stop     # when you are done
```

The dev stack and `pnpm demo` run with `REVIEWER_FEATURE_ENABLED` `true`, so the reviewer flow works from the cms-admin Reviewer page; production runs with `false`. Web has no reviewer button and no `/status` switch.

The stack runs Postgres 17. A dev-stack volume created on Postgres 16 does not start on 17: run `pnpm dev:stack:stop` once, which stops the stack and removes its containers and volumes, then start again. The data is demo data.

`pnpm demo` starts Postgres and Mailpit in containers and cms-api, cms-admin and web in dev mode on your machine, applies the migrations, turns reviewer access on, and publishes sample CV content (a made-up person with `example.com` addresses and `555` phone numbers, from `scripts/demo/content/`; one file per content type, so a new type is a new file). It ends by printing the web, admin and Mailpit addresses. Open the web and sign in (needs internet for the Turnstile widget).

The generated values (ports, secrets) live in the git-ignored `.localEnv.agent`, created on the first run; change a port there if the run reports it taken. Signing in to the admin locally needs a separate owner setup (section 3, "Create the one owner account").

Requirements: Node >= 24, pnpm 11, Docker (database, smoke stack, cms-api integration tests).

```
pnpm install
```

## 1. Choose how to run

| Goal                                          | Use                                                   |
| --------------------------------------------- | ----------------------------------------------------- |
| See the web and the sign-in flow at once      | Quick start (`pnpm demo`)                             |
| Run the apps in dev mode on a throwaway stack | `pnpm dev:stack` (the demo without the reviewer step) |
| Work on one app with hot reload               | Section 2 to 5 (dev servers + a local Postgres)       |
| See the whole thing behind Traefik, like prod | Section 6 (smoke stack, needs only Docker)            |
| Run the browser tests                         | `SMOKE_E2E=1 pnpm smoke` (section 6)                  |

## 2. Local database

cms-api needs PostgreSQL 17. Any instance works; the quickest is a throwaway container (values below are examples; pick your own password):

```
docker run -d --name abyss-dev-db -p 5432:5432 \
  -e POSTGRES_DB=abyss -e POSTGRES_USER=abyss -e POSTGRES_PASSWORD=<password> \
  postgres:17-alpine
```

Remove it with `docker rm -f abyss-dev-db` (data is lost with the container).

## 3. cms-api (port 3000)

cms-api reads `process.env` only. **It does not load a `.env` file itself** (`apps/cms-api/prisma.config.ts` says the same for the Prisma CLI), so export the values into the shell that runs it.

Shortcut for development: `start:dev` is the standard NestJS CLI watch (`nest start --watch`, configured in `apps/cms-api/nest-cli.json`); it loads `apps/cms-api/.env.local` through Node (`--env-file-if-exists`) and restarts on every change. Variables already set in the shell win over the file. Only `start:dev` and `start:debug` (the same watch with the Node inspector) do this; `db:migrate`, the CLIs (`owner:bootstrap`, ...), `start` and production read the shell env only.

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
pnpm start:prod             # node dist/main; http://localhost:3000/api/v1, health: /api/v1/health/ready
```

(`pnpm deploy:migrate` runs the two migrate steps in order.) After a code change, `pnpm build` again, then `pnpm start:prod`. Create the one owner account once, in either way:

- **Setup page:** export `OWNER_SETUP_TOKEN` (at least 32 bytes in production, any non-empty value in development; `openssl rand -base64 32`) before `pnpm start:prod`, run the admin (`pnpm --filter @abyss/cms-admin dev`), open `http://admin.domain.localhost:5173/setup`, enter the token and the owner details, then sign in on the login page. The page closes itself once an owner exists; unset the token afterwards.
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
| `MEDIA_PROVIDER`                                   | `local` (files in `.dev-stack/media`, served by cms-api; clear: see below)    |

With `local`, also set `MEDIA_LOCAL_DIR` (an absolute directory) and `MEDIA_LOCAL_PUBLIC_URL` (the `/api/v1/media-files` URL of cms-api). `pnpm dev:stack` sets both: files go to `.dev-stack/media` and `pnpm dev:stack:stop` removes them; to clear them while the stack runs, delete that directory.

Every other key is optional locally. `apps/cms-api/.env.example` is the list: it names each key, says when it applies and what the default is, and marks the CLI-only ones (`OWNER_EMAIL`, `OWNER_DISPLAY_NAME`). A spec (`config/EnvExample.contract.spec.ts`) fails when that file and the config schema drift apart. Do not set the `*_RATE_LIMIT_*` keys; they are for the smoke stack.

Tests: `pnpm --filter @abyss/cms-api test:unit`, and `test:integration` (Testcontainers; Docker must be running).

## 4. cms-admin (port 5173)

```
cp apps/cms-admin/.env.example apps/cms-admin/.env.local
pnpm --filter @abyss/cms-admin dev
```

Open `http://admin.domain.localhost:5173` (Chromium resolves `*.localhost` to loopback), so the origin matches cms-api `ADMIN_ORIGIN`.

| Key                    | Meaning                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | cms-api base on the admin origin: `https://admin.<domain>/api/v1` in production; in dev `/api/v1` with `DEV_API_PROXY_TARGET=http://localhost:3000`, or the absolute `http://localhost:3000/api/v1`. Bundled at build |
| `DEV_SERVER_PORT`      | dev only, default 5173                                                                                                                                                                                                |
| `DEV_API_PROXY_TARGET` | dev only, `http://localhost:3000`; the dev server forwards `/api` to it; empty = no proxy                                                                                                                             |

## 5. web (port 5174)

```
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @abyss/web dev
```

Open `http://domain.localhost:5174`. The browser calls only web's own routes; the Node server reaches cms-api through `API_INTERNAL_URL`.

| Key                                    | Kind                | Meaning                                                                    |
| -------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ADMIN_URL`                | browser, build time | optional; empty hides the "Open CMS" link                                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | browser, build time | public site key (required). Cloudflare publishes test keys                 |
| `API_INTERNAL_URL`                     | server, runtime     | cms-api as the Next server reaches it: `http://localhost:3000/api/v1`      |
| `WEB_ORIGIN`                           | server, runtime     | exact origin of the site (required), `http://domain.localhost:5174` in dev |
| `WEB_SESSION_SECRET`                   | server, runtime     | session cookie key (required; 32+ bytes in production)                     |
| `TURNSTILE_SECRET_KEY`                 | server, runtime     | Turnstile secret (required); Cloudflare publishes test secrets             |
| `TURNSTILE_EXPECTED_HOSTNAME`          | server, runtime     | bare host a Turnstile answer must carry; required in production            |
| `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER` | server, runtime     | visitor IP source, see `apps/web/.env.example`                             |
| `WEB_REVALIDATE_SECONDS`               | server, runtime     | data cache seconds, default 60; use `0` while developing content           |
| `WEB_PORT`                             | server, runtime     | port of `pnpm start` (production server), default 8080                     |
| `DEV_SERVER_PORT`                      | dev only            | read from the shell, not `.env.local`; default 5174                        |

`NEXT_PUBLIC_*` values are baked into the browser bundle: never put a secret in them. Web holds its secrets (`WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY`) as server-only env; admin has none.

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
