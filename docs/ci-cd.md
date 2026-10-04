# CI/CD

CI checks every push to `develop`, `staging` and `main`, and deploys `staging` and `main`. It is split into one entrypoint, one flow per app and one shared publish workflow, so each app is checked, built, published and deployed on its own. A run works only on the apps a commit actually affects, publishes their images to GHCR and updates their image tag in the GitOps deployment repo. Argo CD / Flux takes it from there.

| File                                                                      | Kind            | What it does                                                                                 |
| ------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)                 | entrypoint      | triggers, run-level concurrency, the `changes` job, one call per affected app                |
| [`.github/workflows/cms-api.yml`](../.github/workflows/cms-api.yml)       | `workflow_call` | cms-api: checks → build → publish                                                            |
| [`.github/workflows/cms-admin.yml`](../.github/workflows/cms-admin.yml)   | `workflow_call` | cms-admin: checks → build → API URL → publish (with `VITE_API_URL` and a bundle smoke check) |
| [`.github/workflows/frontend.yml`](../.github/workflows/frontend.yml)     | `workflow_call` | frontend: checks → build → publish                                                           |
| [`.github/workflows/_publish.yml`](../.github/workflows/_publish.yml)     | `workflow_call` | one app: image (non-root guard, optional smoke check, push) → manifest → deploy              |
| [`.github/scripts/affected.sh`](../.github/scripts/affected.sh)           | script          | affected apps, image apps and workflow-file routing, written to `$GITHUB_OUTPUT`             |
| [`.github/scripts/affected.test.sh`](../.github/scripts/affected.test.sh) | script          | local assertions for `affected.sh` (stub turbo, throwaway git repo)                          |
| [`.github/scripts/image-user.sh`](../.github/scripts/image-user.sh)       | script          | non-root guard for a locally loaded image                                                    |
| [`.github/scripts/bundle-check.sh`](../.github/scripts/bundle-check.sh)   | script          | cms-admin bundle smoke check for the baked API base                                          |

```text
ci.yml (entrypoint)
  changes ──┬─ if cms-api affected   ──> cms-api.yml   : checks ─> build ─> [publish: _publish.yml(app=cms-api)]
            ├─ if cms-admin affected ──> cms-admin.yml : checks ─> build ─> [API URL ─> publish: _publish.yml(app=cms-admin,
            │                                                                 build_args VITE_API_URL, smoke check)]
            └─ if frontend affected  ──> frontend.yml  : checks ─> build ─> [publish: _publish.yml(app=frontend)]

  [publish] = image (per platform: build + load ─> non-root guard ─> bundle smoke check (cms-admin) ─> push by digest)
              ─> manifest (tag <branch>-<sha7> and <branch>) ─> deploy (bump <app>-sync-overlay.yaml)
              only on a push to staging / main, and only when the app's build inputs changed
```

The app flows never depend on each other. A failing `checks` or `build` in one app doesn't cancel or skip another app's flow, and an app whose flow is green still publishes and deploys.

## What runs where

| Event                         | Per affected app                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Push to `develop`             | checks → build                                                                            |
| Push to `staging` or `main`   | checks → build → publish (image → manifest → deploy), when the app's build inputs changed |
| Any push with no affected app | only `changes` runs; the run is green                                                     |

`pull_request` is commented out in `ci.yml`. The entrypoint still keeps its PR-aware expressions (base/head SHAs, concurrency cancellation), so re-enabling it is a trigger change only.

| Branch    | Image platform                        | Build runner       | GitHub Environment | Deployment repo branch |
| --------- | ------------------------------------- | ------------------ | ------------------ | ---------------------- |
| `develop` | — (no image)                          | —                  | —                  | —                      |
| `staging` | `linux/arm64` (Ubuntu VM on Apple M1) | `ubuntu-24.04-arm` | `staging`          | `staging`              |
| `main`    | `linux/amd64` (Ubuntu on Intel)       | `ubuntu-latest`    | `production`       | `main`                 |

This mapping lives in one place: the `case` block in the `Resolve deploy target` step of the `changes` job. A push to any other branch doesn't trigger the workflow.

`build`, cms-admin's `API URL`, `image`, `manifest` and `deploy` all run in the branch's GitHub Environment, so they can read its variables and secrets. On `develop` the environment is empty and `build` runs without one.

If apps are affected but none of their build inputs changed (for example only docs or tests, or only a workflow file), `checks` and `build` still run, and `publish` is skipped. No image is built and no tag is bumped.

### Status check names

Each per-app call in `ci.yml` is named after the app, so its checks show as `<app> / <job>`:

- `cms-api / Checks`, `cms-api / Build`
- `cms-admin / Checks`, `cms-admin / Build`, `cms-admin / API URL`
- `frontend / Checks`, `frontend / Build`
- publish jobs: `<app> / Publish / Image (<arch>)`, `<app> / Publish / Tag`, `<app> / Publish / Deploy to <environment>`

The single-workflow names (`checks`, `build`, …) no longer exist. **If branch protection lists required status checks, rename them** to the `<app> / <job>` names, or a protected branch waits forever on a check that never reports. Keep in mind that a skipped app reports no check, so require only checks that run on every change, or none.

## Jobs

**`changes`** (in `ci.yml`, named "Detect affected apps") runs [`affected.sh`](../.github/scripts/affected.sh):

- **Affected apps:** runs `turbo query affected` between the push's `before` commit and the head. turbo runs through `npx` at the pinned `TURBO_VERSION`, with no `pnpm install`.
- **Image apps:** runs `turbo query affected --tasks build` over the same range. With `futureFlags.affectedUsingTaskInputs` in `turbo.json`, an app is listed only when a file matching its `build.inputs` changed, either in the app or in a workspace package it builds on. Those inputs are every tracked file except Markdown, `docs/`, `docs-*/`, `e2e/`, `test/`, `__tests__/`, `*.test.*`, `*.spec.*`, and the Vitest and Playwright configs. Root `package.json`, `turbo.json` and real lockfile changes count for every app. Only these apps get an image and a tag bump.
- **Workflow-file routing:** see [Which changes trigger which apps](#which-changes-trigger-which-apps).
- **Fallback:** a new branch or a force push has no usable base commit, so every app is affected and gets an image.
- **Outputs:** per app `<app>_affected`, `<app>_image` and `<app>_matrix` (keys use underscores: `cms_api_*`, `cms_admin_*`, `frontend_*`), plus `publish`, `tag`, `branch`, `environment`, `deploy_ref`, `turbo_version` and `image_prefix`. An app without a new image gets the matrix `{"include":[]}`.

`TURBO_VERSION` and `IMAGE_PREFIX` are defined once, as workflow `env` in `ci.yml`, and re-exported as `changes` outputs, because `env` is not available in a reusable-workflow call's `with:`.

**Per-app calls** (in `ci.yml`): one job per app, gated by `if: needs.changes.outputs.<app>_affected == 'true'`, with `secrets: inherit` and the inputs above.

**`Checks`** (per app): `pnpm turbo run typecheck lint --filter=<app>`.

**`Build`** (per app, in the Environment): `pnpm turbo run build --filter=<app>`. This is the normal Node/Vite/Next build, and it catches breakage before Docker.

**`API URL`** (cms-admin only, in the Environment, only when it publishes): reads the Environment variable `VITE_API_URL` and hands it to `publish`. See [VITE_API_URL](#vite_api_url-cms-admin).

**`Publish`** (per app): calls `_publish.yml` when `publish` is true (a push to `staging` or `main`) and the app has a new image.

**`image`** (in `_publish.yml`)

- Runs once per platform, on a native runner, so there's no QEMU emulation.
- Builds `apps/<app>/Dockerfile` with `load: true`, so the image can be checked before anything is pushed.
- Runs the [non-root guard](#non-root-guard) on the loaded image.
- cms-admin only: runs the [bundle smoke check](#vite_api_url-cms-admin).
- Pushes to GHCR **untagged, by digest**, with a GitHub Actions layer cache per app and arch (scope `<app>-<arch>`). The push rebuilds from the same cache, so it's effectively a no-op build.
- Hands the digest to `manifest` as a small artifact.

**`manifest`** (job name `Tag`): combines the app's digests into one image and tags it `<branch>-<sha7>` and `<branch>`.

**`deploy`**

- Checks out the deployment repo at the mapped branch.
- Checks that `<DEPLOYMENT_CLUSTER_PATH>/<app>-sync-overlay.yaml` exists and has an `APP_IMAGE_TAG` key before editing it, so a bad file never leaves a half-applied bump.
- Rewrites that key, makes **one commit for this app** (`chore(<branch>): bump <app> to <tag>`) and pushes it.
- If another push landed first, it rebases and retries, up to 3 times.
- Runs in the concurrency group `deploy-<environment>` with `cancel-in-progress: false`: one deploy at a time per Environment, across apps, never cancelled mid-way. Two apps deploying in the same run produce two serialized commits, and neither fails.

### Permissions

The run defaults to `contents: read`. Only `_publish.yml`'s `image` and `manifest` jobs use `packages: write`. A reusable workflow can't get more than its caller grants, so `packages: write` is also granted as a ceiling on the calling jobs along the way: the three per-app jobs in `ci.yml` and the `publish` job in each `<app>.yml`. Every other job, including `deploy`, has `contents: read` only. Deploy pushes with `DEPLOYMENT_REPO_TOKEN`, not `GITHUB_TOKEN`.

No called workflow declares a workflow-level `concurrency`: it would collide with the entrypoint's run-level group (`ci-<ref>`, which never cancels a push run).

## Non-root guard

Every image runs as the non-root user `abyss`, UID/GID **1001**, with a numeric `USER 1001` in the final stage, so Kubernetes `runAsNonRoot` can verify it. [`image-user.sh`](../.github/scripts/image-user.sh) enforces this before every push, for every app and platform:

- `Config.User` must be a numeric, non-zero UID (optionally `uid:gid`); empty, `0`, `root` or a name fails.
- `id -u` inside the image must print that same UID, and not `0`.

On failure it prints `::error::<image> runs as '<user>'; the final stage must set a numeric non-root USER`, the `image` job fails, and nothing is pushed, tagged or deployed.

**Overlay impact:** cms-api and frontend used to run as `node` (UID 1000). A deployment-repo overlay that pins `securityContext.runAsUser: 1000` or `fsGroup: 1000` for either must change to `1001`, or drop the pin, **before the first staging push that carries the new images**. `runAsNonRoot: true` with `runAsUser: 1001` now works for all three images. Neither app mounts a writable volume, so no PVC ownership changes are needed.

## VITE_API_URL (cms-admin)

cms-admin calls the backend at `VITE_API_URL` + `/api/v1`. Vite bakes the value into the bundle at build time, so it is a Docker build arg (`ARG VITE_API_URL=""` in the builder stage only, after the dependency install, so changing it reruns only the build layer). It is never injected at runtime and never in the runner stage.

- **Source:** the GitHub Environment variable `VITE_API_URL` on `staging` and `production`. It's a variable, not a secret, because the value ends up in the public bundle.
- **Value:** the backend origin, without `/api/v1` (trailing slashes are stripped), e.g. `https://cms-api.example.com`.
- **Empty or unset is allowed.** The build doesn't fail. The `API URL` job logs `::notice::VITE_API_URL is empty for <environment>; the admin will call the relative /api/v1`, and the bundle calls `/api/v1` on the admin's own origin.
- **Single line only.** A value containing a newline or carriage return fails the `API URL` job with `::error::VITE_API_URL for <environment> must be a single line`, because it would inject extra build args.
- **Flow:** the `API URL` job (in the Environment) reads it through `env:` and outputs it; `publish` passes it to `_publish.yml` as `build_args: VITE_API_URL=<value>` and as `smoke_api_url`.
- `.env*` files never reach the image: `.dockerignore` excludes them (only `.env.example` passes, and Vite doesn't load it).

**Bundle smoke check.** After the build and before the push, [`bundle-check.sh <image> [api_url]`](../.github/scripts/bundle-check.sh) greps `/usr/share/nginx/html/assets` inside the loaded image. `buildApiBaseUrl()` joins the origin and the `/api/v1` constant at runtime, so the minified bundle never holds the joined `<origin>/api/v1` literal. The check therefore looks for the two parts separately (quote-agnostic, since the minifier emits backticks):

- **`VITE_API_URL` set:** the `/api/v1` constant is present, and the origin (all trailing slashes stripped) is present.
- **`VITE_API_URL` empty:** the `/api/v1` constant is present, there is no absolute `http(s)://…/api/v1`, and no bare call receives an absolute `http(s)://` literal (how a baked origin shows up in the minified bundle).

A failed assertion prints `::error::` and fails the `image` job, so nothing is pushed, tagged or deployed.

## Images and tags

```text
ghcr.io/hungnh1812dev/project-me/<app>:<branch>-<sha7>   # e.g. cms-api:staging-a1b2c3d  <- deployed
ghcr.io/hungnh1812dev/project-me/<app>:<branch>          # moving tag, convenience only
```

- **What deploys use:** they always pin the immutable `<branch>-<sha7>` tag.
- **Labels:** images carry `org.opencontainers.image.source` and `.revision` labels.
- **Attestation entries:** `docker buildx imagetools inspect` also lists `unknown/unknown` entries. Those are the provenance attestations `build-push-action` adds by default.
- **Deployment repo edit:** the bump changes exactly one line in the app's file, and the value is always double-quoted:

```text
APP_IMAGE_TAG: "staging-a1b2c3d"
```

If the file already has that tag, nothing is committed and the job still succeeds. A trailing `# comment` on the `APP_IMAGE_TAG` line is dropped.

## Which changes trigger which apps

This is turbo's own change detection plus the workflow-file routing in `affected.sh`:

| Changed                                                          | Apps checked and built                        | Image and deploy                    |
| ---------------------------------------------------------------- | --------------------------------------------- | ----------------------------------- |
| `apps/<app>/**` source, config or Dockerfile                     | that app                                      | that app                            |
| `apps/<app>/**` docs or tests only                               | that app                                      | none                                |
| `turbo.json`, root `package.json`                                | all                                           | all                                 |
| `packages/*`                                                     | apps that depend on the package               | the same, when build inputs changed |
| `pnpm-lock.yaml`                                                 | only apps whose resolved dependencies changed | the same                            |
| `.github/workflows/<app>.yml`                                    | that app                                      | none                                |
| `.github/workflows/ci.yml`, `_publish.yml`, `.github/scripts/**` | all                                           | none                                |
| `README.md`, `docs/**`, `.nvmrc`, other `.github/**` files       | none                                          | none                                |

A workflow-file change only runs checks and build; it never builds an image or bumps a tag. To publish after a workflow change, include a change to an app's build inputs.

## One-time setup

In the GitHub repo, go to **Settings → Secrets and variables → Actions** and **Settings → Environments**:

| Name                      | Kind     | Scope                        | Value                                                                                                                                          |
| ------------------------- | -------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOYMENT_REPO`         | variable | repository                   | `owner/repo` of the GitOps repo                                                                                                                |
| `DEPLOYMENT_REPO_TOKEN`   | secret   | repository                   | fine-grained PAT: **only** the deployment repo, **Contents: read and write**                                                                   |
| `DEPLOYMENT_CLUSTER_PATH` | variable | `staging`, `production` envs | folder of the overlays in the deployment repo, e.g. `cluster/me/staging` and `cluster/me/prod`                                                 |
| `VITE_API_URL`            | variable | `staging`, `production` envs | **optional.** cms-admin's backend origin, without `/api/v1`. Empty or unset means the relative `/api/v1` on the admin's origin. Never a secret |

**In the deployment repo:**

- **Branches:** `staging` and `main` must exist.
- **Files:** `cms-api-sync-overlay.yaml`, `cms-admin-sync-overlay.yaml` and `frontend-sync-overlay.yaml` each need an `APP_IMAGE_TAG:` line, under the Environment's `DEPLOYMENT_CLUSTER_PATH` on the mapped branch.
- **Security context:** every image runs as UID 1001. Overlays should use `runAsNonRoot: true` with `runAsUser: 1001`; move any cms-api or frontend `runAsUser`/`fsGroup` of 1000 to 1001 (see [Non-root guard](#non-root-guard)).
- **Branch protection:** if a branch is protected, the token must be allowed to push to it.

**In this repo:** if branch protection requires status checks, use the [`<app> / <job>` names](#status-check-names).

**GHCR:**

- **Access:** packages are created on the first push and are **private** by default. Give the cluster an image pull secret, or make each package public.
- **Repository link:** pushes made with `GITHUB_TOKEN` link the package to this repo automatically.

## Running the checks locally

```bash
pnpm install --frozen-lockfile
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest   # lint the workflows (includes shellcheck)
bash .github/scripts/affected.test.sh                               # routing tests
BASE_SHA=$(git rev-parse origin/staging) HEAD_SHA=$(git rev-parse HEAD) TURBO_VERSION=2.11.5 \
  bash .github/scripts/affected.sh                                  # what CI would run and publish
pnpm turbo run typecheck lint build --filter=cms-api
docker build -f apps/cms-api/Dockerfile -t cms-api:local .
bash .github/scripts/image-user.sh cms-api:local                    # non-root guard
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_URL=https://api.example.test -t cms-admin:abs .
bash .github/scripts/bundle-check.sh cms-admin:abs https://api.example.test
docker build -f apps/cms-admin/Dockerfile -t cms-admin:rel .
bash .github/scripts/bundle-check.sh cms-admin:rel ''
```

When editing the workflows or scripts, keep shell compatible with bash 3.2 as well as 5, e.g. `read -r -a`, not `mapfile`, so it runs locally on macOS. Pass every `${{ }}` value into scripts through `env:`, never inline in `run:`. Keep `TURBO_VERSION` in sync with the Dockerfiles and the root `package.json`.

## Troubleshooting

| Symptom                                                                                               | Cause / fix                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes` fails with `No deploy target for branch`                                                    | The workflow was triggered for a branch missing from the mapping `case`. Add it there.                                                                                                                                                                                                                                                                                           |
| `deploy` fails with `DEPLOYMENT_CLUSTER_PATH is not set for this environment`                         | Set the variable on the Environment. See One-time setup.                                                                                                                                                                                                                                                                                                                         |
| `deploy` fails with `<path>/<app>-sync-overlay.yaml not found` or `APP_IMAGE_TAG not found`           | The file is missing under `DEPLOYMENT_CLUSTER_PATH` on that branch, or lacks the key. Nothing was committed.                                                                                                                                                                                                                                                                     |
| `deploy` fails on push (403)                                                                          | The token lacks Contents write on the deployment repo, or branch protection blocks it.                                                                                                                                                                                                                                                                                           |
| `deploy` fails after 3 retries, or on a rebase conflict                                               | Someone edited the same line in the deployment repo concurrently. Re-run the job.                                                                                                                                                                                                                                                                                                |
| Image-user guard failed: `<image> runs as '<user>'; the final stage must set a numeric non-root USER` | The app's runner stage has no `USER`, `USER root`/`0`, or a named user (`USER node`). End it with `USER 1001` after creating `abyss` (see the other Dockerfiles). Nothing was pushed.                                                                                                                                                                                            |
| Pod fails with `container has runAsNonRoot and image will run as root`, or can't read its files       | The overlay pins `runAsUser`/`fsGroup` 1000, or the image predates the change. Use `runAsUser: 1001` (or drop the pin) and deploy an image built after the change.                                                                                                                                                                                                               |
| Admin calls the wrong origin (CORS errors, or requests go to the admin's own host)                    | `VITE_API_URL` on that Environment is wrong, or empty when the API is on another origin. Fix the variable and rebuild: it's baked at build time, so redeploying the old image or restarting the pod doesn't help. The `API URL` job log shows the value used. Also add the admin origin to the backend's `CORS_ORIGINS`, and the API origin to the container's `CSP_API_ORIGIN`. |
| `API URL` fails with `VITE_API_URL for <environment> must be a single line`                           | The variable contains a newline. Re-enter it as one line.                                                                                                                                                                                                                                                                                                                        |
| Bundle smoke check fails                                                                              | The bundle doesn't match `VITE_API_URL` (for example the build arg didn't reach the builder stage, or an absolute origin is baked while the variable is empty). Nothing was pushed. Reproduce with `bundle-check.sh` locally.                                                                                                                                                    |
| A required status check never reports                                                                 | Branch protection still lists the old single-workflow names, or an app that was skipped. See Status check names.                                                                                                                                                                                                                                                                 |
| Cluster can't pull the image                                                                          | The GHCR package is private. See One-time setup.                                                                                                                                                                                                                                                                                                                                 |
| A workflow-only change didn't publish                                                                 | Expected: workflow files route to checks and build only. See "Which changes trigger which apps".                                                                                                                                                                                                                                                                                 |

## Design decisions

- **One flow per app,** called from one entrypoint, so apps are isolated: one app's failure never skips another's publish, status checks name the app, and each app's pipeline reads on its own.
- **One shared `_publish.yml`,** so image, manifest and deploy logic exist once. It publishes one app per call.
- **One deployment-repo commit per app,** serialized per Environment by the `deploy-<environment>` concurrency group, plus the rebase retry.
- **Change detection with `turbo query affected`,** not path filters. It follows the workspace dependency graph and parses the lockfile per package. If the base commit is unusable, turbo itself treats everything as changed. Workflow-file routing is the one path-based addition, and it never publishes.
- **Native runners per architecture,** not QEMU. arm64 runners are free for public repos, and emulated `pnpm install` + builds are 5–10× slower.
- **Build, check, then push by digest; tag in `manifest`:** the guards need a loaded image, and pushing by digest is Docker's pattern for building one image across several runners. With one platform per branch it merges a single digest, but it still supports multi-arch without changes. Docker's reusable `docker/github-builder` workflow was considered and not used. It needs `id-token: write` and hand-built GHCR credentials.
- **`VITE_API_URL` as a build arg from an Environment variable,** since Vite bakes it at build time. The staging and production images are built separately anyway (arm64 vs amd64).
- **Direct commit to the deployment repo,** not a PR, so a push to `staging` or `main` deploys without a manual step. It uses a fine-grained PAT scoped to that one repo.
- **Setup steps duplicated** in `checks` and `build` of each flow, rather than a composite action. They're short blocks.

## Open items

- **Tests in CI:** the unit and e2e suites are not in CI yet.
- **Production approval:** the `production` Environment has no required reviewer, so `main` deploys fully automatically. Add one in the Environment settings if you want an approval gate.
- **Manual full run:** there's no `workflow_dispatch` button to run everything on demand.
- **First live run, not done yet.** Before it, update any cms-api or frontend overlay `runAsUser`/`fsGroup` from 1000 to 1001. Checklist:
  1. A push to `develop` touching only `apps/cms-admin`: only `cms-admin / Checks` and `cms-admin / Build` run; the cms-api and frontend flows show as skipped, and nothing is published. (A README-only push is green with every per-app flow skipped.)
  2. A push to `staging` with `VITE_API_URL` set on the `staging` Environment: the bundle smoke check passes, arm64 images appear with tag `staging-<sha7>`, and the admin calls that origin.
  3. A push to `staging` with `VITE_API_URL` empty: the run is green, the `API URL` job logs the notice, and the admin calls `/api/v1` on its own origin.
  4. All three pods run with `runAsNonRoot: true` / `runAsUser: 1001` and become Ready. cms-api answers its health route, and `kubectl exec … id` shows uid 1001.
  5. One app's build fails while another still deploys, with one deployment-repo commit per deployed app (`chore(<branch>): bump <app> to <tag>`).

  After that, a push to `main` (first real release) gives amd64 images and one commit per app on the deployment repo's `main` branch through the `production` Environment.
