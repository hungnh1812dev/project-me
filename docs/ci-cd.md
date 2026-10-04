# CI/CD

One workflow, [.github/workflows/ci.yml](../.github/workflows/ci.yml), checks every change and deploys `staging` and `main`. It works only on the apps a commit actually affects, publishes their images to GHCR and updates their image tag in the GitOps deployment repo. Argo CD / Flux takes it from there.

```text
changes ──> checks ──> build ──> image ──> manifest ──> deploy
(affected   (typecheck  (turbo    (per app,  (tag in     (bump APP_IMAGE_TAG
 apps)       + lint)     build)    native     GHCR)       in deployment repo)
                                   runner)
                                  └──── push to staging / main only ────┘
```

## What runs where

| Event                                            | Jobs                     |
| ------------------------------------------------ | ------------------------ |
| Pull request into `develop`, `staging` or `main` | changes → checks → build |
| Push to `develop`                                | changes → checks → build |
| Push to `staging` or `main`                      | the full pipeline        |

| Branch    | Image platform                        | Build runner       | GitHub Environment | Deployment repo branch |
| --------- | ------------------------------------- | ------------------ | ------------------ | ---------------------- |
| `develop` | — (no image)                          | —                  | —                  | —                      |
| `staging` | `linux/arm64` (Ubuntu VM on Apple M1) | `ubuntu-24.04-arm` | `staging`          | `staging`              |
| `main`    | `linux/amd64` (Ubuntu on Intel)       | `ubuntu-latest`    | `production`       | `main`                 |

This mapping lives in one place: the `case` block in the `Resolve deploy target` step of the `changes` job. A push to any other branch doesn't trigger the workflow.

`build`, `image`, `manifest` and `deploy` all run in the branch's GitHub Environment, so they can read its variables and secrets. On `develop` the environment is empty and `build` runs without one.

If no app is affected, every job after `changes` is skipped and the run is green.

If apps are affected but none of their build inputs changed (for example only docs or tests), `checks` and `build` still run, and `image`, `manifest` and `deploy` are skipped. No image is built and no tag is bumped.

## Jobs

**`changes`**

- **Affected apps:** runs `turbo query affected` between the push's `before` commit (or the PR base) and the head. turbo runs through `npx` at the pinned `TURBO_VERSION`, with no `pnpm install`.
- **Fallback:** a new branch or a force push has no usable base commit, so it builds all apps.
- **Image apps:** runs `turbo query affected --tasks build` over the same range. With `futureFlags.affectedUsingTaskInputs` in `turbo.json`, an app is listed only when a file matching its `build.inputs` changed, either in the app or in a workspace package it builds on. Those inputs are every tracked file except Markdown, `docs/`, `docs-*/`, `e2e/`, `test/`, `__tests__/`, `*.test.*`, `*.spec.*`, and the Vitest and Playwright configs. Root `package.json`, `turbo.json` and real lockfile changes count for every app. Only these apps get an image and a tag bump. If there's no usable base commit, every app is listed.
- **Outputs:** `apps`, `any`, `image_apps`, `publish`, `tag`, `branch`, `matrix`, `environment` and `deploy_ref`.

**`checks`:** `pnpm turbo run typecheck lint --filter=<each affected app>`.

**`build`:** `pnpm turbo run build --filter=<each affected app>`. This is the normal Node/Vite/Next build, and it catches breakage before Docker.

**`image`**

- Runs once per app × platform, on a native runner, so there's no QEMU emulation.
- Builds `apps/<app>/Dockerfile` and pushes it to GHCR **untagged, by digest**, with a GitHub Actions layer cache per app and arch.
- Hands the digest to `manifest` as a small artifact.

**`manifest`:** once per image app, it combines the digests into one image and tags it `<branch>-<sha7>` and `<branch>`.

**`deploy`**

- Checks out the deployment repo at the mapped branch.
- Checks that every image app's `cluster/me/<staging|prod>/<app>-sync-overlay.yaml` exists and has an `APP_IMAGE_TAG` key. It checks all of them before editing any, so a bad file never leaves a half-applied bump.
- Rewrites that key, makes one commit and pushes it.
- If another push landed first, it rebases and retries, up to 3 times.
- Runs one deploy at a time per Environment, and is never cancelled mid-way.

## Images and tags

```text
ghcr.io/hungnh1812dev/project-me/<app>:<branch>-<sha7>   # e.g. cms-api:staging-a1b2c3d  <- deployed
ghcr.io/hungnh1812dev/project-me/<app>:<branch>          # moving tag, convenience only
```

- **What deploys use:** they always pin the immutable `<branch>-<sha7>` tag.
- **Labels:** images carry `org.opencontainers.image.source` and `.revision` labels.
- **Attestation entries:** `docker buildx imagetools inspect` also lists `unknown/unknown` entries. Those are the provenance attestations `build-push-action` adds by default.
- **Deployment repo edit:** the bump changes exactly one line in each affected file, and the value is always quoted:

```yaml
APP_IMAGE_TAG: 'staging-a1b2c3d'
```

If a file already has that tag, nothing is committed and the job still succeeds. A trailing `# comment` on the `APP_IMAGE_TAG` line is dropped.

## Which changes trigger which apps

This is turbo's own change detection, measured on this repo:

| Changed                                                          | Apps rebuilt                                  |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `apps/<app>/**` (including its Dockerfile)                       | that app                                      |
| `turbo.json`                                                     | all                                           |
| `packages/*`                                                     | apps that depend on the package (none yet)    |
| `pnpm-lock.yaml`                                                 | only apps whose resolved dependencies changed |
| `README.md`, `docs/**`, `.nvmrc`, **`.github/workflows/ci.yml`** | none                                          |

A commit that only edits the workflow runs nothing after `changes`. To exercise a workflow change, include a change to an app, or touch `turbo.json`.

## One-time setup

In the GitHub repo, go to **Settings → Secrets and variables → Actions** and **Settings → Environments**:

| Name                    | Kind     | Scope      | Value                                                                        |
| ----------------------- | -------- | ---------- | ---------------------------------------------------------------------------- |
| `DEPLOYMENT_REPO`       | variable | repository | `owner/repo` of the GitOps repo                                              |
| `DEPLOYMENT_REPO_TOKEN` | secret   | repository | fine-grained PAT: **only** the deployment repo, **Contents: read and write** |

**In the deployment repo:**

- **Branches:** `staging` and `main` must exist.
- **Files:** `cms-api-sync-overlay.yaml`, `cms-admin-sync-overlay.yaml` and `frontend-sync-overlay.yaml` each need an `APP_IMAGE_TAG:` line, under `cluster/me/staging/` on the `staging` branch and `cluster/me/prod/` on the `main` branch. The folders are set in the branch mapping `case` in `ci.yml`.
- **Branch protection:** if a branch is protected, the token must be allowed to push to it.

**GHCR:**

- **Access:** packages are created on the first push and are **private** by default. Give the cluster an image pull secret, or make each package public.
- **Repository link:** pushes made with `GITHUB_TOKEN` link the package to this repo automatically.

## Running the checks locally

```bash
pnpm install --frozen-lockfile
pnpm turbo query affected --packages cms-api cms-admin frontend --base origin/staging --head HEAD
pnpm turbo query affected --tasks build --packages cms-api cms-admin frontend --base origin/staging --head HEAD   # apps that get an image
pnpm turbo run typecheck lint build --filter=cms-api
docker build -f apps/cms-api/Dockerfile -t cms-api:local .
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest   # lint the workflow (includes shellcheck)
```

When editing `ci.yml`, keep shell steps compatible with bash 3.2 as well as 5, e.g. `read -r -a`, not `mapfile`. That way they can be run locally on macOS. Pass every `${{ }}` value into scripts through `env:`, never inline in `run:`.

## Troubleshooting

| Symptom                                                                                     | Cause / fix                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `changes` fails with `No deploy target for branch`                                          | The workflow was triggered for a branch missing from the mapping `case`. Add it there.                                        |
| `deploy` fails with `<path>/<app>-sync-overlay.yaml not found` or `APP_IMAGE_TAG not found` | The file is missing from `cluster/me/staging/` or `cluster/me/prod/` on that branch, or lacks the key. Nothing was committed. |
| `deploy` fails on push (403)                                                                | The token lacks Contents write on the deployment repo, or branch protection blocks it.                                        |
| `deploy` fails after 3 retries, or on a rebase conflict                                     | Someone edited the same line in the deployment repo concurrently. Re-run the job.                                             |
| Cluster can't pull the image                                                                | The GHCR package is private. See One-time setup.                                                                              |
| A workflow-only change didn't run anything                                                  | Expected. See "Which changes trigger which apps".                                                                             |

## Design decisions

- **Change detection with `turbo query affected`,** not path filters. It follows the workspace dependency graph and parses the lockfile per package. If the base commit is unusable, turbo itself treats everything as changed.
- **Native runners per architecture,** not QEMU. arm64 runners are free for public repos, and emulated `pnpm install` + builds are 5–10× slower.
- **Push by digest, then tag in `manifest`:** this is Docker's pattern for building one image across several runners. With one platform per branch it merges a single digest, but it still supports multi-arch without changes. Docker's reusable `docker/github-builder` workflow was considered and not used. It needs `id-token: write` and hand-built GHCR credentials.
- **Direct commit to the deployment repo,** not a PR, so a push to `staging` or `main` deploys without a manual step. It uses a fine-grained PAT scoped to that one repo.
- **Setup steps duplicated** in `checks` and `build`, rather than a composite action. It's two short blocks in one file.

## Open items

- **Tests in CI:** `cms-api`'s tests (`pnpm test`) are not in CI yet.
- **Production approval:** the `production` Environment has no required reviewer, so `main` deploys fully automatically. Add one in the Environment settings if you want an approval gate.
- **Manual full run:** there's no `workflow_dispatch` button to run everything on demand.
- **First live run, not done yet.** Checklist:
  1. A PR touching only `apps/cms-admin`: only cms-admin is checked and built, and nothing is published.
  2. A README-only PR: the run is green, and every job after `changes` is skipped.
  3. A push to `develop`: changes → checks → build only.
  4. A push to `staging`:
     - arm64 images appear with tag `staging-<sha7>`;
     - `imagetools inspect` shows only `linux/arm64`;
     - the deployment repo's `staging` branch gets one commit that changes only the affected `APP_IMAGE_TAG` lines.
  5. A push to `main` (first real release): amd64 images, one commit on the deployment repo's `main` branch through the `production` Environment.
