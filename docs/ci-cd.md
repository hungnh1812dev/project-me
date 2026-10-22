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
  -> publish-<app> image -> manifest -> deploy bump (push to staging/main, app image changed, app flow and e2e green)
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
| `publish-<app>`    | `_publish.yml`: per-platform image (build, non-root guard, admin bundle check, push by digest), manifest, deploy bump. See "Publish".                                 |
| `e2e` Playwright   | Builds the three images, starts them with `docker run` (`scripts/e2e-stack.sh`), runs `@abyss/e2e`. See "e2e in CI".                                                  |

## Change detection

`turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/<app>.yml` re-runs that app; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. Output `e2e` is true when any app is affected or a file under `apps/e2e/`, `scripts/e2e-stack.sh`, `scripts/lib/`, `scripts/stack/` or `.github/workflows/e2e.yml` changed (`scripts/smoke.sh` and the compose file do not trigger it). A new branch or force push treats every app as affected.

Branches: `develop` runs checks and build only; `staging` and `main` are the publish targets. Nothing assumes they exist yet. `pull_request` is commented out in `ci.yml`.

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

`.github/workflows/e2e.yml` (status check `e2e / Playwright`, called by the `e2e` job of `ci.yml`, `contents: read`, no secrets, 45 minute limit) builds the three images from their Dockerfiles with `docker/build-push-action` (`load: true`, GitHub Actions cache per app), then runs `bash scripts/e2e-stack.sh` with `E2E_NO_BUILD=1`. No docker compose. The images are built for e2e only: web with the Cloudflare test Turnstile site key and `/api/v1` (`scripts/stack/web-build.env`), cms-admin with `VITE_API_BASE_URL=http://domain.localhost:8080/api/v1`. They are not the images that publish builds.

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

## Publish

`publish-cms-api`, `publish-cms-admin` and `publish-web` in `ci.yml` call `.github/workflows/_publish.yml`. Each runs only when all of these hold: the event is a push to `staging` or `main`, the app's build inputs changed (`<app>_image`), the app flow (`Checks` and `Build`) succeeded and `e2e` succeeded (`needs: [changes, <app>, e2e]` with `always()` and result checks; a skipped e2e means no publish). A failing sibling app does not block another app's publish.

Images, one per service, built straight from `apps/<app>/Dockerfile` by `docker/build-push-action` (docker compose is never used):

| Image                                        | Used by                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ghcr.io/hungnh1812dev/project-me/cms-api`   | both cms-api containers: init (`npm run deploy:migrate`) and main (`node dist/main.js`); one tag for both |
| `ghcr.io/hungnh1812dev/project-me/cms-admin` | admin console (nginx, uid 101)                                                                            |
| `ghcr.io/hungnh1812dev/project-me/web`       | public site (Next.js standalone, uid 1000)                                                                |

Tags: `<branch>-<sha7>` and the moving `<branch>`. Platforms: `staging` linux/arm64, `main` linux/amd64 (one native runner per platform). Per platform: build and load, non-root guard (`.github/scripts/image-user.sh`: numeric non-zero `USER`, checked with `id -u`), for cms-admin `.github/scripts/bundle-check.sh` (the bundle contains `VITE_API_BASE_URL`), then push by digest; the manifest job merges the digests and applies both tags; the deploy job bumps `APP_IMAGE_TAG` in `<DEPLOYMENT_CLUSTER_PATH>/<app>-sync-overlay.yaml` of the deploy repo (commit and push with retry on a race). For cms-api the one tag in `cms-api-sync-overlay.yaml` is what both containers use.

Least privilege: workflow default `contents: read`; `packages: write` only on the image and manifest jobs (the call job grants the ceiling); the deploy job has no `packages` access and uses only `DEPLOYMENT_REPO_TOKEN`: the checkout does not persist it (`persist-credentials: false`) and only the push step receives it, as a per-command header.

Every action in every workflow is pinned to a full commit SHA with the tag as a comment (resolved from the latest tag of the major version the template used). Bump them deliberately; adding Dependabot (`github-actions` ecosystem) is recommended. The registry login uses the run's `GITHUB_TOKEN`.

### What you must create in GitHub

Two Environments, `staging` and `production` (Settings > Environments). Required on each: **Deployment branches and tags = Selected branches**, `staging` only on the `staging` Environment and `main` only on `production`. This rule, not the workflow, is what stops any other branch from reading the Environment's variables and `DEPLOYMENT_REPO_TOKEN` or deploying; without it a pushed `feature/x` workflow could declare `environment: production`. Also protect the `staging` and `main` branches (pull request review required) so a push there implies review, and add required reviewers on `production` if you want a manual gate. In each Environment:

| Kind     | Name                             | Meaning                                                                                                                                                                      |
| -------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| variable | `DEPLOYMENT_REPO`                | `owner/repo` of the deploy repo                                                                                                                                              |
| variable | `DEPLOYMENT_CLUSTER_PATH`        | directory in the deploy repo holding `<app>-sync-overlay.yaml` (each with an `APP_IMAGE_TAG:` line)                                                                          |
| variable | `VITE_API_BASE_URL`              | cms-admin build arg, full API base, required (for example `https://domain.com/api/v1`)                                                                                       |
| variable | `NEXT_PUBLIC_API_BASE_URL`       | web build arg, required (`/api/v1` when the API is on the web host)                                                                                                          |
| variable | `NEXT_PUBLIC_ADMIN_URL`          | web build arg, optional (admin console URL)                                                                                                                                  |
| variable | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web build arg, optional (real Cloudflare Turnstile site key; empty hides the reviewer entry)                                                                                 |
| secret   | `DEPLOYMENT_REPO_TOKEN`          | Environment secret only, never a repository secret. Fine-grained personal access token (or GitHub App token) limited to the deploy repo with `contents: write` and an expiry |

Build args are variables, never secrets: they are baked into the public bundles. A missing required variable fails the image job before the build. The deploy repo branches `staging` and `main` must exist. Registry packages are created on the first push under the repo; after that, set the package visibility or access you need. Nothing was run against GitHub yet: the first real publish is checked after the first push.

How the published images are deployed (K3s, Traefik, init and main container, env contract, backups): `docs/deployment/k3s-traefik.md`.

Run the guards locally against an image you built:

```
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=https://domain.com/api/v1 -t cms-admin:ci .
bash .github/scripts/image-user.sh cms-admin:ci
bash .github/scripts/bundle-check.sh cms-admin:ci https://domain.com/api/v1
```
