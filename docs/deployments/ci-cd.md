# CI/CD

GitHub Actions. Workflows live in `.github/workflows/`, helper scripts in `.github/scripts/`. The workflows follow the configuration of the owner's earlier deployment, adapted for this repo (section 8). Running the same checks on your machine: [run-checks-locally.md](../guidelines/run-checks-locally.md).

Status: **ready** in code (the routing tests `affected.test.sh` and `pins-check.test.sh` pass locally); the pipeline shape is **verified earlier** on the owner's earlier deployment; **not run** from this repo on GitHub yet (blocker B4, [devops-runbook.md](devops-runbook.md)).

## 1. Flow

```
push to develop / staging / main, or a repo tag v<x.y.z>
  -> changes (turbo query affected, .github/scripts/affected.sh)
  -> repo          version pins check + format:check + dependency audit (always runs)
  -> cms-api       Checks -> Build   (when cms-api is affected)
  -> cms-admin     Checks -> Build   (when cms-admin is affected; app-checks.yml)
  -> web           Checks -> Build   (when web is affected; app-checks.yml)
  -> publish-<app> image -> manifest -> deploy bump (push to staging/main, app image changed, app flow green)
```

- The app flows never depend on each other, so one failing app does not skip or block another.
- Docker compose is local-test only (`docker-compose.smoke.yml`); no CI workflow or script runs it.
- e2e (Playwright) never runs in CI: run `SMOKE_E2E=1 pnpm smoke` locally before pushing to `staging` or `main` ([run-checks-locally.md](../guidelines/run-checks-locally.md)).
- The `pull_request` trigger is commented out in `ci.yml`, so checks run only after a push to one of the three branches.

## 2. Jobs

| Job                | What it runs                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | lists affected apps (`apps`, `<app>_affected`, `<app>_image`) and resolves the branch target; routing is tested by `bash .github/scripts/affected.test.sh`                                         |
| `repo`             | `.github/scripts/pins-check.sh` (Turbo and Node pins agree), `pnpm format:check`, `pnpm audit --prod --audit-level high`                                                                           |
| `cms-api` Checks   | `turbo run typecheck lint`, `test:unit`, `test:integration` (Testcontainers on the runner's Docker), `content:generate -- --check`, `graphql:print-schema -- --check`, `contract:print -- --check` |
| `cms-admin` Checks | `turbo run typecheck lint`, `pnpm --filter @abyss/cms-admin test`                                                                                                                                  |
| `web` Checks       | `turbo run typecheck lint`, `pnpm --filter @abyss/web test`                                                                                                                                        |
| `<app>` Build      | `pnpm turbo run build --filter=@abyss/<app>` (no Docker image here)                                                                                                                                |
| `publish-<app>`    | `_publish.yml`: per-platform image (build, non-root guard, admin bundle check, push by digest), manifest, deploy bump (section 4)                                                                  |

**Change detection.** `turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/cms-api.yml` re-runs cms-api, `app-checks.yml` re-runs cms-admin and web; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. A new branch or a force push treats every app as affected.

**Version pins.** Turbo is pinned in `ci.yml` (`TURBO_VERSION`), each `apps/*/Dockerfile` (`ARG TURBO_VERSION`) and the root `package.json`; the Node major in `.nvmrc` and each Dockerfile (`ARG NODE_IMAGE`). The `repo` job fails on any mismatch, so a bump edits all of them in one commit.

## 3. Branches, environments, images

| Branch    | GitHub Environment | Image platform | Runner         | Deploy repo branch bumped |
| --------- | ------------------ | -------------- | -------------- | ------------------------- |
| `develop` | none               | none           | none           | none (checks and build)   |
| `staging` | `staging`          | `linux/amd64`  | `ubuntu-24.04` | `staging`                 |
| `main`    | `production`       | `linux/amd64`  | `ubuntu-24.04` | `main`                    |

| Image                                        | Port | User | Used by                                                                      |
| -------------------------------------------- | ---- | ---- | ---------------------------------------------------------------------------- |
| `ghcr.io/hungnh1812dev/project-me/cms-api`   | 3000 | 1000 | both cms-api containers, init `migrate` and main `cms-api`, with **one tag** |
| `ghcr.io/hungnh1812dev/project-me/web`       | 8080 | 1000 | public site (Next.js standalone)                                             |
| `ghcr.io/hungnh1812dev/project-me/cms-admin` | 8080 | 101  | admin console (nginx)                                                        |

- Tags: a release image is tagged `<app version>` only (for example `cms-api:0.0.2`), immutable, no moving tag; it is pushed by a repo tag `v<x.y.z>` run (`.github/scripts/release-apps.sh` picks the apps whose version changed since the previous release; it refuses a commit that is not the origin/main tip and any version that is not x.y.z) and the deploy repo `main` is bumped. Branch pushes push nothing (ADR 0016).
- Each app is bumped only when its own image changed, so the three apps can sit on different tags.
- No git tag or GitHub Release today (Q-OPS5).
- Build-time values are baked into the images, so a change needs a new image, not a restart: web `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; cms-admin `VITE_API_BASE_URL`.

## 4. Publish and the deploy repo contract

`publish-cms-api`, `publish-cms-admin` and `publish-web` in `ci.yml` call `.github/workflows/_publish.yml`. Each runs only when the event is a push to `staging` or `main`, the app's build inputs changed (`<app>_image`), and the app flow (`Checks` and `Build`) succeeded. It does not wait for the `repo` job, and e2e is not a gate.

Per platform: build and load, the non-root guard (`.github/scripts/image-user.sh`: numeric non-zero `USER`), for cms-admin `.github/scripts/bundle-check.sh` (the bundle contains `VITE_API_BASE_URL`), then push by digest; the manifest job merges the digests and applies both tags.

The deploy job (contract **verified earlier**; this repo's `_publish.yml` **not run**):

1. Checks out `vars.DEPLOYMENT_REPO` at branch `staging` or `main` with `DEPLOYMENT_REPO_TOKEN`, without storing the token (`persist-credentials: false`; the token is sent only as a per-command header in the push step).
2. Opens `${DEPLOYMENT_CLUSTER_PATH}/<app>-sync-overlay.yaml` and fails if the file or a line `APP_IMAGE_TAG:` is missing.
3. Replaces the value on that line with `"<branch>-<sha7>"`; if nothing changes, it stops. For cms-api that one tag is used by both containers.
4. Commits `chore(<branch>): bump <app> to <branch>-<sha7>` as `github-actions[bot]` and pushes **directly** to the branch; on a rejected push it rebases and retries, up to 3 attempts. It opens no pull request, so a deploy repo branch that requires pull requests rejects the push (Q-OPS3: direct push, as built).
5. Only one bump runs at a time per environment (`concurrency: deploy-<environment>`).

The deploy repo's GitOps tool then applies the commit. No image-automation controller may write the same tags: CI already writes them, and two writers would fight over the field.

| Variable                  | Read as                        | Meaning                                                                                    |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `DEPLOYMENT_REPO`         | `vars.DEPLOYMENT_REPO`         | `owner/name` of the deploy repo (Q-OPS1)                                                   |
| `DEPLOYMENT_CLUSTER_PATH` | `vars.DEPLOYMENT_CLUSTER_PATH` | the directory in the deploy repo that holds this cluster's `<app>-sync-overlay.yaml` files |

Both can be repository variables or Environment variables on `staging` and `production`; an Environment variable overrides a repository variable of the same name, so use Environment variables when the value differs per environment (usually `DEPLOYMENT_CLUSTER_PATH`). An empty `DEPLOYMENT_CLUSTER_PATH` fails the job with "DEPLOYMENT_CLUSTER_PATH is not set for this environment".

**Least privilege.** Workflow default `contents: read`; `packages: write` only on the image and manifest jobs; the deploy job has no `packages` access and uses only `DEPLOYMENT_REPO_TOKEN`. Every action is pinned to a full commit SHA with the tag as a comment; bump them deliberately (Dependabot for `github-actions` is recommended). The registry login uses the run's `GITHUB_TOKEN`.

## 5. GitHub setup, step by step

Do the steps in order. Paths are GitHub web UI paths in this repo (`Settings > ...`) unless a step says the deploy repo. Never put a real token, domain or secret value in a file in this repo.

**1. Repository prerequisites**

1. `Settings > Actions > General > Actions permissions`: allow Actions for this repo (all actions, or the SHA-pinned actions the workflows use).
2. Same page, `Workflow permissions`: `Read repository contents and packages permissions`. Do not tick `Allow GitHub Actions to create and approve pull requests`.

**2. Environments**

1. `Settings > Environments > New environment`: create `staging`, then `production` (exact names; `ci.yml` resolves `staging` for `staging` and `production` for `main`).
2. In each, `Deployment branches and tags` > `Selected branches and tags`: pattern `staging` on `staging`, pattern `main` on `production`. This rule, not the workflow, stops any other branch from reading the Environment's variables and `DEPLOYMENT_REPO_TOKEN`.
3. Required reviewers are optional; v1 uses none on `production` (the gate is the protected `main` branch plus the `main`-only deployment rule).

**3. Environment variables** (`Settings > Environments > <environment> > Environment variables`), in both environments:

| Variable                         | Required | Value                                                                       | Read by                      |
| -------------------------------- | -------- | --------------------------------------------------------------------------- | ---------------------------- |
| `DEPLOYMENT_REPO`                | yes      | `<owner>/<deploy-repo>`                                                     | deploy job                   |
| `DEPLOYMENT_CLUSTER_PATH`        | yes      | directory of the `<app>-sync-overlay.yaml` files (step 6)                   | deploy job; fails when unset |
| `VITE_API_BASE_URL`              | yes      | full API base URL for cms-admin, for example `https://<domain>/api/v1`      | cms-admin image build arg    |
| `NEXT_PUBLIC_API_BASE_URL`       | yes      | `/api/v1` when the API is served on the web host                            | web image build arg          |
| `NEXT_PUBLIC_ADMIN_URL`          | no       | admin console URL                                                           | web image build arg          |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no       | real Cloudflare Turnstile site key (public); empty hides the reviewer entry | web image build arg          |

These are baked into public bundles, so they are variables, never secrets. A missing required variable fails the image job before the build starts.

**4. Environment secret `DEPLOYMENT_REPO_TOKEN`**

1. A fine-grained personal access token or a GitHub App installation token: resource owner the owner of the deploy repo, `Only select repositories` (the deploy repo only), permission `Contents: Read and write` and nothing else, with an expiry (for example 90 days).
2. `Settings > Environments > <environment> > Environment secrets`: name `DEPLOYMENT_REPO_TOKEN`, in `staging` and `production` (one token per environment for separate rotation). Never a repository secret.
3. Rotation: create the new token, replace the value in each Environment, run one publish to confirm the push, then revoke the old token. An expired token shows as a failed push in the deploy job.

**5. Branch protection for `staging` and `main`** (`Settings > Branches`, one rule each; create the branches first):

1. Require a pull request before merging, with at least 1 approval.
2. Require status checks: only `Repo checks` for now; after the first green run, add the per-app names that run shows (`<app> / Checks`, `<app> / Build`).
3. Block force pushes and deletion.

**6. Deploy repo prerequisites** (in `<owner>/<deploy-repo>`):

1. The branches `staging` and `main` exist.
2. The directory named by `DEPLOYMENT_CLUSTER_PATH` holds `cms-api-sync-overlay.yaml`, `cms-admin-sync-overlay.yaml` and `web-sync-overlay.yaml` (the earlier setup's `frontend` overlay renamed), each with a line `APP_IMAGE_TAG: <value>`. The web Deployment points at `ghcr.io/hungnh1812dev/project-me/web`.
3. The cluster layout is the deploy repo's own business; this repo states the contract ([kubernetes.md](kubernetes.md)).

**7. GHCR packages.** After the first push, the packages `project-me/cms-api`, `project-me/cms-admin` and `project-me/web` appear under the owner's `Packages`. Keep them private (Q-OPS7); for each, `Package settings > Manage Actions access`: add this repo with `Write`. The cluster pulls with its own pull secret ([kubernetes.md](kubernetes.md) section 1). The old package of the earlier site is deleted only after the owner confirms.

**8. First-run proof** (**not run**; the manager records it under LG-0 item 3):

1. Push to `staging`. The `CI` run is green: `Repo checks`, each affected app's `Checks` and `Build`, then `publish <app>`, each publish job in the environment `staging`.
2. `docker buildx imagetools inspect ghcr.io/hungnh1812dev/project-me/<app>:staging-<sha7>` shows `linux/amd64`; the moving tag points to the same image.
3. The deploy repo `staging` branch has one bump commit per published app, changing only `APP_IMAGE_TAG`.
4. On a staging node, `node -e "require('sharp')"` loads inside the cms-api image.
5. Return to step 5.2 (per-app checks) and step 7 (package access), then repeat on `main`.

## 6. Adding an app

1. Add the package name to `packages` in `.github/scripts/affected.sh` (and to `app_checks_packages` when it uses `app-checks.yml`).
2. In `ci.yml`: the `changes` outputs (`<app>_affected`, `<app>_image`, `<app>_matrix`), the `<APP>_IMAGE` env line and `matrix_for` echo line, the app job (`app-checks.yml` with `app: <app>`) and a `publish-<app>` job.
3. Add the Dockerfile with `ARG NODE_IMAGE` and `ARG TURBO_VERSION`; `pins-check.sh` picks it up.

## 7. What stays in this pipeline

Never removed by a CI change: SHA-pinned actions; the `repo` job (pins check, `format:check`, audit); unit tests in every app flow; cms-api integration tests and the three `--check` generators; publish gated on the app flow, not on e2e; `persist-credentials: false` with the header-only token on the deploy push; `packages: write` only on the image and manifest jobs; the `pull_request` trigger commented out.

## 8. Carried over from the earlier deployment

| Part                                                                  | Verdict | Where it lives now                                                                                           |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `changes` job, `affected.sh` routing, zero or unknown base = all apps | carried | `ci.yml`, `affected.sh` (`@abyss/` scope, `app-checks.yml` routing; `apps/e2e` and `scripts/` affect no app) |
| Branch targets: develop checks only, staging and main publish         | adapted | `ci.yml` "Resolve deploy target"; both staging and production build `linux/amd64` on `ubuntu-24.04`          |
| Image prefix and tags `<branch>-<sha7>`, `<branch>`                   | carried | `ci.yml`, `_publish.yml`                                                                                     |
| Image, manifest, deploy flow of `_publish.yml`                        | carried | `_publish.yml` (adds `TURBO_VERSION`, the web `NEXT_PUBLIC_*` build args, required `VITE_API_BASE_URL`)      |
| Deploy contract (repo and path variables, token secret, overlay tag)  | carried | `_publish.yml` deploy job (adds `persist-credentials: false`, token only as a per-command header)            |
| Per-app flow files with a nested `publish` job                        | adapted | shared `app-checks.yml` plus `publish-<app>` jobs in `ci.yml`, gated on the app flow result                  |
| `build` job inside the GitHub Environment                             | changed | read-only jobs run without an Environment; only the publish jobs read Environment values                     |
| Optional `VITE_API_URL` with a relative fallback                      | changed | cms-admin requires the full `VITE_API_BASE_URL`; the Dockerfile refuses to build without it                  |
| Actions referenced by tag                                             | changed | every action pinned to a full commit SHA                                                                     |
| Tooling self-test of the old repo                                     | dropped | belongs to another repo                                                                                      |
