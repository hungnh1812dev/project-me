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

### GitHub setup, step by step

Do the steps in order. Paths are GitHub web UI paths in this repo (`Settings > ...`) unless a step says the deploy repo. `<owner>/<deploy-repo>` is the repo that holds the cluster manifests. Never put a real token, domain or secret value in a file in this repo. The status and per-item checklist for the owner is in [devops-runbook.md](deployment/devops-runbook.md) section 3.5; this section is the how-to.

**1. Repository prerequisites**

1. `Settings > Actions > General > Actions permissions`: allow Actions for this repo (all actions, or allow the SHA-pinned actions the workflows use).
2. Same page, `Workflow permissions`: choose `Read repository contents and packages permissions` (read-only default). Do not tick `Allow GitHub Actions to create and approve pull requests`. The workflows ask for more only where needed: `ci.yml` grants `packages: write` to the `publish-<app>` call jobs, and `_publish.yml` uses it only in the image and manifest jobs.

**2. Environments**

1. `Settings > Environments > New environment`: create `staging`, then `production`. The names must match exactly; `ci.yml` resolves `staging` for the `staging` branch and `production` for `main`.
2. In each Environment set `Deployment branches and tags` to `Selected branches and tags`, then `Add deployment branch or tag rule`: pattern `staging` on `staging`, pattern `main` on `production`. This rule, not the workflow, stops any other branch from reading the Environment's variables and `DEPLOYMENT_REPO_TOKEN`. Without it a pushed `feature/x` workflow could declare `environment: production`.
3. Required reviewers are optional. v1 uses none on `production`: the gate is the protected `main` branch plus the `main`-only deployment rule. Add reviewers on `production` only if you want a manual approval before each deploy.

**3. Environment variables**

`Settings > Environments > <environment> > Environment variables > Add environment variable`. Add these in both `staging` and `production` (values differ per environment). Use Environment variables, not repository variables, so each environment keeps its own values.

| Variable                         | Required | Value to enter                                                                           | Read by                                    |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `DEPLOYMENT_REPO`                | yes      | `<owner>/<deploy-repo>`                                                                  | deploy job, checkout of the deploy repo    |
| `DEPLOYMENT_CLUSTER_PATH`        | yes      | directory in the deploy repo that holds the `<app>-sync-overlay.yaml` files (see step 6) | deploy job; fails with an error when unset |
| `VITE_API_BASE_URL`              | yes      | full API base URL for cms-admin, for example `https://<domain>/api/v1`                   | cms-admin image build arg                  |
| `NEXT_PUBLIC_API_BASE_URL`       | yes      | API base for web; `/api/v1` when the API is served on the web host                       | web image build arg                        |
| `NEXT_PUBLIC_ADMIN_URL`          | no       | admin console URL                                                                        | web image build arg                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no       | real Cloudflare Turnstile site key (public); empty hides the reviewer entry              | web image build arg                        |

These are build args baked into the public bundles, so they are variables, never secrets. A missing required variable fails the image job before the build starts. All names are read in `.github/workflows/_publish.yml`.

**4. Environment secret `DEPLOYMENT_REPO_TOKEN`**

1. Create the credential. Either a fine-grained personal access token (`GitHub profile > Settings > Developer settings > Personal access tokens > Fine-grained tokens`) or a GitHub App installation token. Resource owner: the owner of the deploy repo. Repository access: `Only select repositories`, the deploy repo only. Permission: `Contents: Read and write`, nothing else. Set an expiry (for example 90 days) and note the date in your calendar.
2. `Settings > Environments > <environment> > Environment secrets > Add environment secret`: name `DEPLOYMENT_REPO_TOKEN`, value the token. Add it to `staging` and `production`; use one token per environment if you want separate rotation. Never a repository secret: only a job running in the Environment, on its allowed branch, may read it.
3. Rotation: create the new token, replace the secret value in each Environment, run one publish to confirm the deploy job still pushes, then revoke the old token. An expired token shows up as a failed push in the deploy job.
4. `GITHUB_TOKEN` is created by GitHub for every run; do not create it. The registry login uses it.

**5. Branch protection for `staging` and `main`**

`Settings > Branches > Add branch ruleset` (or `Add classic branch protection rule`), one rule for `staging` and one for `main`:

1. Require a pull request before merging, with at least 1 approval.
2. Require status checks to pass. For now add only `Repo checks` (the `repo` job in `ci.yml`).
3. After the first green run, add the per-app check names exactly as that run shows them (the `<app> / Checks` and `<app> / Build` jobs from `app-checks.yml`, for example `cms-api / Checks`). A check that has never run cannot be selected, so this step waits for the first run.
4. Block force pushes and deletion.

Create the `staging` and `main` branches in this repo first if they do not exist yet; the rules apply to existing branches only.

**6. Deploy repo prerequisites**

In `<owner>/<deploy-repo>`:

1. The branches `staging` and `main` exist. The deploy job checks out the one that matches the environment and pushes the bump to it.
2. The directory named by `DEPLOYMENT_CLUSTER_PATH` holds three files: `cms-api-sync-overlay.yaml`, `cms-admin-sync-overlay.yaml` and `web-sync-overlay.yaml`. Each has a line `APP_IMAGE_TAG: <value>`; the deploy job rewrites that value to `<branch>-<sha7>`. A missing file or line fails the bump.
3. Flux or the cluster layout is the deploy repo's own business: [deployment/k3s-traefik.md](deployment/k3s-traefik.md) and the devops runbook section 4 describe the contract.

**7. GHCR packages**

Packages appear under the owner's profile or organization (`Packages`) after the first successful push, as `project-me/cms-api`, `project-me/cms-admin` and `project-me/web`. Keep them private (owner decision). For each package: `Package settings > Manage Actions access`: add this repo with `Write` role so later runs can push; the cluster pulls with its own image pull secret (see the k3s guide). Do this after the first push in step 9, because the packages do not exist before it.

**8. Optional: Dependabot for actions**

Recommended, not required. Add a `.github/dependabot.yml` with the `github-actions` ecosystem on a weekly schedule so the SHA-pinned actions get update pull requests. This guide does not add the file; if you add it, merge its updates deliberately, one at a time.

**9. First-run check**

1. Push (or merge) to `staging`. In the `Actions` tab, the `CI` run is green: `Repo checks`, each affected app's `Checks` and `Build`, then `publish <app>`.
2. In the run, each `publish` job shows the environment `staging`; if a job waits or is denied, recheck step 2.
3. Image tags: `docker buildx imagetools inspect ghcr.io/<owner>/<repo>/<app>:staging-<sha7>` shows `linux/amd64`. The moving tag `staging` points to the same image.
4. In the deploy repo, branch `staging` has one new bump commit per published app, changing only `APP_IMAGE_TAG` in the matching overlay file.
5. Now return to step 5.3 (add the per-app checks) and step 7 (package access).
6. Repeat on `main` for `production`.

Remaining notes: build args are variables, never secrets; the deploy job gets no `packages` access and uses only `DEPLOYMENT_REPO_TOKEN`, which it passes as a per-command header. Nothing was run against GitHub yet: the first real publish is the check. How the published images are deployed (K3s, Traefik, init and main container, env contract, backups): [deployment/k3s-traefik.md](deployment/k3s-traefik.md).

Run the guards locally against an image you built:

```
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=https://domain.com/api/v1 -t cms-admin:ci .
bash .github/scripts/image-user.sh cms-admin:ci
bash .github/scripts/bundle-check.sh cms-admin:ci https://domain.com/api/v1
```
