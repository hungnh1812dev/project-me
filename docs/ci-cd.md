# CI/CD

GitHub Actions, built from the template in `.github_template/` (reference only). Workflows live in `.github/workflows/`, helper scripts in `.github/scripts/`.

## Flow

```
push to develop / staging / main
  -> changes (turbo query affected, .github/scripts/affected.sh)
  -> repo          format:check + dependency audit (always runs)
  -> cms-api       Checks -> Build   (when cms-api is affected)
  -> cms-admin     Checks -> Build   (when cms-admin is affected)
  -> web           Checks -> Build   (when web is affected)
  -> e2e           Playwright on a docker-run stack of the built images (when any app or the e2e suite changed)
  -> publish       added by T37e (images, deploy bump)
```

The app flows never depend on each other, so one failing app does not skip another. Docker compose is local-test only (`docker-compose.smoke.yml`); no CI workflow or script runs or references it. The `e2e` job is independent of the app flows (it builds its own images), so a failing Checks job does not skip it and the reverse.

## Jobs

| Job                | What it runs                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | Lists affected apps (`apps`, `<app>_affected`, `<app>_image`) and resolves the branch target. Routing is tested by `bash .github/scripts/affected.test.sh`.           |
| `repo`             | `pnpm format:check`, `pnpm audit --prod --audit-level high`                                                                                                           |
| `cms-api` Checks   | `turbo run typecheck lint`, `test:unit`, `test:integration` (Testcontainers on the runner's Docker), `content:generate -- --check`, `graphql:print-schema -- --check` |
| `cms-admin` Checks | `turbo run typecheck lint`, `pnpm --filter @abyss/cms-admin test`                                                                                                     |
| `web` Checks       | `turbo run typecheck lint`, `pnpm --filter @abyss/web test`                                                                                                           |
| `<app>` Build      | `pnpm turbo run build --filter=@abyss/<app>` (no Docker image here)                                                                                                   |
| `e2e` Playwright   | Builds the three images, starts them with `docker run` (`scripts/e2e-stack.sh`), runs `@abyss/e2e`. See "e2e in CI".                                                  |

## Change detection

`turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/<app>.yml` re-runs that app; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. Output `e2e` is true when any app is affected or a file under `apps/e2e/`, `scripts/e2e-stack.sh`, `scripts/lib/`, `scripts/stack/` or `.github/workflows/e2e.yml` changed (`scripts/smoke.sh` and the compose file do not trigger it). A new branch or force push treats every app as affected.

Branches: `develop` runs checks and build only; `staging` and `main` are the publish targets (T37e). Nothing assumes they exist yet. `pull_request` is commented out in `ci.yml`.

## Run the checks locally

```
pnpm install --frozen-lockfile
pnpm turbo run typecheck lint test --filter=@abyss/<cms-api|cms-admin|web>
pnpm --filter @abyss/cms-api test:integration         # Docker must be running
pnpm --filter @abyss/cms-api content:generate -- --check
pnpm --filter @abyss/cms-api graphql:print-schema -- --check
pnpm turbo run build --filter=@abyss/<app>
pnpm format:check
pnpm audit --prod --audit-level high
bash .github/scripts/affected.test.sh
```

`content:generate --check` exits non-zero when the content type schemas changed without a committed migration; fix it by running `pnpm --filter @abyss/cms-api content:generate` and committing the result.

## e2e in CI

`.github/workflows/e2e.yml` (status check `e2e / Playwright`, called by the `e2e` job of `ci.yml`, `contents: read`, no secrets, 45 minute limit) builds the three images from their Dockerfiles with `docker/build-push-action` (`load: true`, GitHub Actions cache per app), then runs `bash scripts/e2e-stack.sh` with `E2E_NO_BUILD=1`. No docker compose. The images are built for e2e only: web with the Cloudflare test Turnstile site key and `/api/v1` (`scripts/stack/web-build.env`), cms-admin with `VITE_API_BASE_URL=http://domain.localhost:8080/api/v1`. They are not the images that T37e publishes.

Topology, as in production, on the Docker network `abyss-e2e` (containers `abyss-e2e-*`, all labelled `abyss.stack=e2e`):

```
Traefik (host port E2E_HTTP_PORT, provider limited to the stack label)
  domain.localhost            -> web (Next.js, 8080), /api -> cms-api (3000, no StripPrefix)
  admin.domain.localhost      -> cms-admin (nginx, 8080)
  mail.domain.localhost       -> Mailpit (OTP mail sink)
postgres:16-alpine  <- cms-api-init (npm run deploy:migrate, must exit 0) <- cms-api
```

`scripts/e2e-stack.sh` waits for health (`E2E_TIMEOUT_SECONDS`, default 180), seeds the owner and the e2e accounts with `docker exec` (random secrets per run, never printed), exports the `E2E_*` values and runs `pnpm --filter @abyss/e2e test`. The exit code is Playwright's. On failure it writes the `docker logs` of every container to `apps/e2e/test-results/stack-logs/` (uploaded with the report); it always removes the containers, network and volumes unless `E2E_KEEP=1`.

| Variable                                                     | Meaning                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `E2E_DOMAIN`, `E2E_HTTP_PORT`                                | base domain (`domain.localhost`), host port (`8080`)            |
| `E2E_TIMEOUT_SECONDS`                                        | stack start timeout (`180`)                                     |
| `E2E_NO_BUILD=1` + `E2E_IMAGE_CMS_API`, `_WEB`, `_CMS_ADMIN` | use prebuilt images (CI does); otherwise the script builds them |
| `E2E_KEEP=1`                                                 | leave the stack running                                         |

Run it locally (Docker running, `pnpm --filter @abyss/e2e browsers:install` once; stop a running `pnpm smoke` stack first, both use port 8080 and the DB container name the specs expect):

```
bash scripts/e2e-stack.sh                    # build, start, seed, run the suite, tear down
E2E_KEEP=1 bash scripts/e2e-stack.sh         # keep the stack; the script prints the teardown command:
docker ps -aq --filter label=abyss.stack=e2e | xargs docker rm -fv; docker network rm abyss-e2e
```

Shared with local smoke so the two never drift: `scripts/lib/stack-seed.sh` (log fragments, account seeding, `E2E_*` export) and `scripts/stack/cms-api.env` (static, non-secret cms-api settings; compose reads it through `env_file:`, the script through `--env-file`). In CI the workflow adds the stack hosts to `/etc/hosts`, because Node does not resolve `*.localhost` on every runner (Chromium does).

Lint the workflows with `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`.
