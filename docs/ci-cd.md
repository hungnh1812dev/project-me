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
  -> publish-<app> image -> manifest -> deploy bump (push to staging/main, app image changed, app flow green)
```

The app flows never depend on each other, so one failing app does not skip another. Docker compose is local-test only (`docker-compose.smoke.yml`); no CI workflow or script runs or references it.

## Jobs

| Job                | What it runs                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | Lists affected apps (`apps`, `<app>_affected`, `<app>_image`) and resolves the branch target. Routing is tested by `bash .github/scripts/affected.test.sh`.                                        |
| `repo`             | `pnpm format:check`, `pnpm audit --prod --audit-level high`                                                                                                                                        |
| `cms-api` Checks   | `turbo run typecheck lint`, `test:unit`, `test:integration` (Testcontainers on the runner's Docker), `content:generate -- --check`, `graphql:print-schema -- --check`, `contract:print -- --check` |
| `cms-admin` Checks | `turbo run typecheck lint`, `pnpm --filter @abyss/cms-admin test`                                                                                                                                  |
| `web` Checks       | `turbo run typecheck lint`, `pnpm --filter @abyss/web test`                                                                                                                                        |
| `<app>` Build      | `pnpm turbo run build --filter=@abyss/<app>` (no Docker image here)                                                                                                                                |
| `publish-<app>`    | `_publish.yml`: per-platform image (build, non-root guard, admin bundle check, push by digest), manifest, deploy bump. See "Publish".                                                              |

## Change detection

`turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/<app>.yml` re-runs that app; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. A new branch or force push treats every app as affected.

Branches: `develop` runs checks and build only; `staging` and `main` are the publish targets. Nothing assumes they exist yet. `pull_request` is commented out in `ci.yml`.

## Run the checks locally

```
pnpm install --frozen-lockfile
pnpm turbo run typecheck lint test --filter=@abyss/<cms-api|cms-admin|web>
pnpm --filter @abyss/cms-api test:integration         # Docker must be running
pnpm --filter @abyss/cms-api content:generate -- --check
pnpm --filter @abyss/cms-api graphql:print-schema -- --check
pnpm --filter @abyss/cms-api contract:print -- --check
pnpm turbo run build --filter=@abyss/<app>
pnpm format:check
pnpm audit --prod --audit-level high
bash .github/scripts/affected.test.sh
```

`content:generate --check` exits non-zero when the content type schemas changed without a committed migration; fix it by running `pnpm --filter @abyss/cms-api content:generate` and committing the result.

## e2e (local only)

GitHub CI never runs Playwright. Before pushing to `staging` or `main`, run the suite against the local compose stack with `SMOKE_E2E=1 pnpm smoke` (Docker running, `pnpm --filter @abyss/e2e browsers:install` once). For a single spec, keep a stack with `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke` and run `pnpm e2e:spec <spec>`. Details: [apps/e2e/README.md](../apps/e2e/README.md).

Lint the workflows with `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`.

## Publish

`publish-cms-api`, `publish-cms-admin` and `publish-web` in `ci.yml` call `.github/workflows/_publish.yml`. Each runs only when all of these hold: the event is a push to `staging` or `main`, the app's build inputs changed (`<app>_image`), and the app flow (`Checks` and `Build`) succeeded (`needs: [changes, <app>]` with `always()` and a result check). It does not wait for the `repo` job (format, audit) and e2e is not a gate. A failing sibling app does not block another app's publish.

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
