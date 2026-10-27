# CI/CD

GitHub Actions. The workflows follow the configuration of the owner's earlier k3s + FluxCD deployment, adapted for this repo (see "Carried over from the earlier deployment"). Workflows live in `.github/workflows/`, helper scripts in `.github/scripts/`.

## Flow

```
push to develop / staging / main
  -> changes (turbo query affected, .github/scripts/affected.sh)
  -> repo          version pins check + format:check + dependency audit (always runs)
  -> cms-api       Checks -> Build   (when cms-api is affected)
  -> cms-admin     Checks -> Build   (when cms-admin is affected; app-checks.yml)
  -> web           Checks -> Build   (when web is affected; app-checks.yml)
  -> publish-<app> image -> manifest -> deploy bump (push to staging/main, app image changed, app flow green)
```

The app flows never depend on each other, so one failing app does not skip another. Docker compose is local-test only (`docker-compose.smoke.yml`); no CI workflow or script runs or references it.

## Jobs

| Job                | What it runs                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | Lists affected apps (`apps`, `<app>_affected`, `<app>_image`) and resolves the branch target. Routing is tested by `bash .github/scripts/affected.test.sh`.                                        |
| `repo`             | `.github/scripts/pins-check.sh` (Turbo and Node pins agree), `pnpm format:check`, `pnpm audit --prod --audit-level high`                                                                           |
| `cms-api` Checks   | `turbo run typecheck lint`, `test:unit`, `test:integration` (Testcontainers on the runner's Docker), `content:generate -- --check`, `graphql:print-schema -- --check`, `contract:print -- --check` |
| `cms-admin` Checks | `turbo run typecheck lint`, `pnpm --filter @abyss/cms-admin test`                                                                                                                                  |
| `web` Checks       | `turbo run typecheck lint`, `pnpm --filter @abyss/web test`                                                                                                                                        |
| `<app>` Build      | `pnpm turbo run build --filter=@abyss/<app>` (no Docker image here)                                                                                                                                |
| `publish-<app>`    | `_publish.yml`: per-platform image (build, non-root guard, admin bundle check, push by digest), manifest, deploy bump. See "Publish".                                                              |

## Carried over from the earlier deployment

The old `frontend` app is `web` here, and the deploy repo overlay is `web-sync-overlay.yaml`.

| Part                                                                  | Verdict | Where it lives now                                                                                                     |
| --------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `changes` job, `affected.sh` routing, zero or unknown base = all apps | carried | `ci.yml`, `affected.sh` (`@abyss/` scope, `app-checks.yml` routing; `apps/e2e` and `scripts/` affect no app)           |
| Branch targets: develop checks only, staging and main publish         | adapted | `ci.yml` "Resolve deploy target"; staging builds `linux/amd64` on `ubuntu-24.04`, same as production (both run x86_64) |
| Image prefix and tags `<branch>-<sha7>`, `<branch>`                   | carried | `ci.yml`, `_publish.yml`                                                                                               |
| Image, manifest, deploy flow of `_publish.yml`                        | carried | `_publish.yml` (adds `TURBO_VERSION`, the web `NEXT_PUBLIC_*` build args, required `VITE_API_BASE_URL`)                |
| Deploy contract (repo and path variables, token secret, overlay tag)  | carried | `_publish.yml` deploy job (adds `persist-credentials: false`, token only as a per-command header)                      |
| Per-app flow files with a nested `publish` job                        | adapted | shared `app-checks.yml` plus `publish-<app>` jobs in `ci.yml`, gated on the app flow result                            |
| `build` job inside the GitHub Environment                             | changed | read-only jobs run without an Environment; only the publish jobs read Environment values                               |
| Optional `VITE_API_URL` with a relative fallback                      | changed | cms-admin requires the full `VITE_API_BASE_URL`; the Dockerfile refuses to build without it                            |
| Actions referenced by tag                                             | changed | every action pinned to a full commit SHA                                                                               |
| Tooling self-test of the old repo                                     | dropped | belongs to another repo                                                                                                |

Stays in this project (never removed by a CI change): SHA-pinned actions; the `repo` job (pins check, `format:check`, audit); unit tests in every app flow; cms-api integration tests and the three `--check` generators; publish gated on the app flow, not on e2e; `persist-credentials: false` with the header-only token on the deploy push; `packages: write` only on the image and manifest jobs; the `pull_request` trigger stays commented out.

## Adding an app

1. Add the package name to `packages` in `.github/scripts/affected.sh` (and to `app_checks_packages` when it uses `app-checks.yml`).
2. In `ci.yml`: add the `changes` outputs (`<app>_affected`, `<app>_image`, `<app>_matrix`), the `<APP>_IMAGE` env line and `matrix_for` echo line, the app job (calls `app-checks.yml` with `app: <app>`) and a `publish-<app>` job.
3. Add the Dockerfile with `ARG NODE_IMAGE` and `ARG TURBO_VERSION`; `pins-check.sh` picks it up from `apps/*/Dockerfile`.

## Version pins

Turbo is pinned in `ci.yml` (`TURBO_VERSION`), each `apps/*/Dockerfile` (`ARG TURBO_VERSION`) and the root `package.json`; the Node major in `.nvmrc` and each Dockerfile (`ARG NODE_IMAGE`). The `repo` job runs `.github/scripts/pins-check.sh` and fails on any mismatch, so a bump edits all of them in one commit.

## Change detection

`turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/cms-api.yml` re-runs cms-api, and `app-checks.yml` re-runs cms-admin and web; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. A new branch or force push treats every app as affected.

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
bash .github/scripts/pins-check.sh
bash .github/scripts/pins-check.test.sh
bash .github/scripts/build-args.test.sh
```

`content:generate --check` exits non-zero when the content type schemas changed without a committed migration; fix it by running `pnpm --filter @abyss/cms-api content:generate` and committing the result.

## e2e (local only)

GitHub CI never runs Playwright. Before pushing to `staging` or `main`, run the suite against the local compose stack with `SMOKE_E2E=1 pnpm smoke` (Docker running, `pnpm --filter @abyss/e2e browsers:install` once). For a single spec, keep a stack with `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke` and run `pnpm e2e:spec <spec>`. Details: [apps/e2e/README.md](../apps/e2e/README.md).

## Publish

`publish-cms-api`, `publish-cms-admin` and `publish-web` in `ci.yml` call `.github/workflows/_publish.yml`. Each runs only when all of these hold: the event is a push to `staging` or `main`, the app's build inputs changed (`<app>_image`), and the app flow (`Checks` and `Build`) succeeded (`needs: [changes, <app>]` with `always()` and a result check). It does not wait for the `repo` job (format, audit) and e2e is not a gate. A failing sibling app does not block another app's publish.

Images, one per service, built straight from `apps/<app>/Dockerfile` by `docker/build-push-action` (docker compose is never used):

| Image                                        | Used by                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ghcr.io/hungnh1812dev/project-me/cms-api`   | both cms-api containers: init (`npm run deploy:migrate`) and main (`node dist/main.js`); one tag for both |
| `ghcr.io/hungnh1812dev/project-me/cms-admin` | admin console (nginx, uid 101)                                                                            |
| `ghcr.io/hungnh1812dev/project-me/web`       | public site (Next.js standalone, uid 1000)                                                                |

Tags: `<branch>-<sha7>` and the moving `<branch>`. Platforms: `staging` and `main` both linux/amd64 on `ubuntu-24.04` (one native runner per platform; the build cache scope is per app, environment and arch). Per platform: build and load, non-root guard (`.github/scripts/image-user.sh`: numeric non-zero `USER`, checked with `id -u`), for cms-admin `.github/scripts/bundle-check.sh` (the bundle contains `VITE_API_BASE_URL`), then push by digest; the manifest job merges the digests and applies both tags; the deploy job bumps `APP_IMAGE_TAG` in `<DEPLOYMENT_CLUSTER_PATH>/<app>-sync-overlay.yaml` of the deploy repo (commit and push with retry on a race). For cms-api the one tag in `cms-api-sync-overlay.yaml` is what both containers use.

Least privilege: workflow default `contents: read`; `packages: write` only on the image and manifest jobs (the call job grants the ceiling); the deploy job has no `packages` access and uses only `DEPLOYMENT_REPO_TOKEN`: the checkout does not persist it (`persist-credentials: false`) and only the push step receives it, as a per-command header.

Every action in every workflow is pinned to a full commit SHA with the tag as a comment (the latest tag of the major version in use). Bump them deliberately; adding Dependabot (`github-actions` ecosystem) is recommended. The registry login uses the run's `GITHUB_TOKEN`.

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
