# Spec: CI/CD pipeline (GitHub Actions → GHCR → GitOps tag bump)

Builds on [SPEC.md](SPEC.md) (scaffold + Dockerfiles). This spec covers one GitHub Actions workflow that checks, builds and publishes the three apps and bumps their image tag in the deployment repo.

## Objective

For every push to `develop`, `staging` or `main`, publish a new image to GHCR **only for the apps that changed**. Then point the matching cluster at that image by rewriting `APP_IMAGE_TAG` in the deployment repo. Argo CD / Flux (outside this repo) takes it from there. PRs get the same checks with no publishing.

**Who it's for:** the developer(s) pushing to this repo, who want "merge → deployed" with no manual image or tag handling.

**Flow (per the request):**

```
changes ──> checks (typecheck + lint) ──> build (turbo) ──> image (per app × arch) ──> manifest (tag) ──> deploy (tag bump)
   │                                                          └──────────── push events only ────────────┘
   └── zero affected apps is a valid outcome: every later job is skipped and the run is green
```

**Decisions (2026-09-28):**
| # | Decision |
|---|---|
| D1 | Triggers: a `push` to `develop`/`staging`/`main` runs the full flow. A `pull_request` into those branches runs `changes → checks → build` only (no GHCR push, no deploy). |
| D2 | Each branch maps to a **GitHub Environment** of the same name (`develop`, `staging`, `main`), and each Environment has its own `DEPLOYMENT_CLUSTER_PATH`. `DEPLOYMENT_REPO` is a single repository variable. |
| D3 | Image tag = `<branch>-<short-sha>` (7 chars), e.g. `develop-a1b2c3d`. That tag is written into `APP_IMAGE_TAG`. A moving `<branch>` tag is also pushed for convenience, but deploys never use it. |
| D4 | The tag bump is a **direct commit** to the deployment repo's default branch, using a fine-grained PAT secret. |
| D5 | `APP_IMAGE_TAG` is a plain YAML key (`APP_IMAGE_TAG: <value>`, may be nested or indented) in `<DEPLOYMENT_CLUSTER_PATH>/<app>-sync.yaml`. |
| D6 | Code changes allowed before the build: add a `typecheck` script to each app and a `typecheck` task to `turbo.json`. The one approved exception is a one-line import fix in `apps/cms-api/test/app.e2e-spec.ts` (see T1 notes). |
| D7 | Change detection uses turbo's own `turbo query affected --packages` (bundled docs: `guides/skipping-tasks.mdx`, `reference/query.mdx`). A change in `packages/*` or the root lockfile marks the dependent apps as affected. |
| D8 | **Image platform follows the target cluster.** `staging` → `linux/arm64` (Ubuntu VM on an Apple M1). `main` → `linux/amd64` (Ubuntu on Intel). `develop` → **both** (a multi-arch image, so the same tag runs on either host). All hosts run Ubuntu, and the images are ordinary `linux/*` images. Each arch builds on a **native runner**: `ubuntu-24.04-arm` for arm64, `ubuntu-latest` for amd64. That means no QEMU emulation, which would be 5–10× slower for `pnpm install` + Next/Nest builds. |

## Tech Stack

| Tool | Version / ref | Notes |
|---|---|---|
| GitHub Actions, `ubuntu-latest` | — | |
| `actions/checkout` | `v7` | `fetch-depth: 0` (or `filter: blob:none`), which turbo needs to compute affected packages |
| `pnpm/action-setup` | `v6` | version comes from `packageManager` (`pnpm@11.5.2`) |
| `actions/setup-node` | `v7` | `node-version-file: .nvmrc` (24), `cache: pnpm` |
| `actions/upload-artifact` / `actions/download-artifact` | `v7` / `v8` | digest hand-off `image` → `manifest` |
| `docker/setup-buildx-action` `v4`, `docker/login-action` `v4`, `docker/build-push-action` `v7` | as listed | cache `type=gha,scope=<app>-<arch>,mode=max` (per arch, so arm64 and amd64 layers don't evict each other) |
| Runners for `image` | `ubuntu-24.04-arm` (arm64), `ubuntu-latest` (amd64) | Confirmed (T0): the repo is public, and standard arm64 runners are free and unlimited for public repos. No QEMU needed. (`docker/setup-qemu-action` `v4` is the fallback if the repo ever goes private and minutes become a concern.) |
| turbo | 2.11.5 (from lockfile) | `turbo query affected`, `turbo run … --filter` |
| Registry | `ghcr.io/hungnh1812dev/project-me/<app>` | auth via `GITHUB_TOKEN` (`packages: write`) |

Actions are pinned to a major version tag. The majors above come from each repo's tags, checked on 2026-09-28 (T0).

## Workflow design

File: `.github/workflows/ci.yml`. There is one workflow with six jobs. The app list is `cms-api`, `cms-admin`, `frontend`, and the app name equals the `package.json` name, the folder and `<app-svc>`.

| Job | Runs on | What it does | Output |
|---|---|---|---|
| `changes` | push + PR | Checkout (full history), install turbo, run `turbo query affected --packages <apps> --base <base> --head HEAD`, and emit a JSON array of affected **apps** (packages under `apps/` only). Base = PR base sha for PRs, or `github.event.before` for pushes. If `before` is all zeros (new branch) or not in history (force push), fall back to **all apps**. | `apps` (JSON array), `any` (`true`/`false`) |
| `checks` | `any == 'true'` | `pnpm install --frozen-lockfile`, then `pnpm turbo run typecheck lint --filter=<each app>` | — |
| `build` | after `checks` | `pnpm turbo run build --filter=<each app>` (the plain Node/Next/Vite build, which catches build breaks before Docker) | — |
| `image` | push only, after `build`, matrix over `apps` × `platforms` | `changes` resolves the platform list from the branch → platform map (D8) and outputs it. Each matrix leg runs on its arch's native runner. The leg logs in to GHCR and runs `build-push-action` with `file: apps/<app>/Dockerfile`, `context: .`, `platforms: <one platform>`, and GHA cache. It pushes **by digest only** (`outputs: type=image,push-by-digest=true,name-canonical=true,push=true`) and uploads the digest as an artifact `digest-<app>-<arch>`. This is Docker's documented "distribute build across multiple runners" pattern. | digests |
| `manifest` | push only, after `image`, matrix over `apps` | Download that app's digests. `docker buildx imagetools create --tag=<image>:<branch>-<sha7> --tag=<image>:<branch>` combines them into one tagged manifest list, then `imagetools inspect` prints it. The OCI labels (`org.opencontainers.image.source`, `.revision`) are set on the per-arch images in `image`. The same code path covers 1 digest (staging/main) and 2 digests (develop). | — |
| `deploy` | push only, after `manifest`, `environment: <branch>` | Checkout `DEPLOYMENT_REPO` with the PAT. For each affected app, replace the `APP_IMAGE_TAG` value in `$DEPLOYMENT_CLUSTER_PATH/<app>-sync.yaml`. Make **one commit** for all apps (`chore(<branch>): bump <apps> to <tag>`) and push. If the push is rejected, `pull --rebase` and retry (up to 3 times). | — |

**Branch → target map** (one place in the workflow, the `changes` job, e.g. a `case "$BRANCH"` block):

| Branch | Environment | Platform | Runner for `image` |
|---|---|---|---|
| `develop` | `develop` | `linux/amd64`, `linux/arm64` | `ubuntu-latest` + `ubuntu-24.04-arm` (in parallel) |
| `staging` | `staging` | `linux/arm64` | `ubuntu-24.04-arm` |
| `main` | `main` | `linux/amd64` | `ubuntu-latest` |

`checks` and `build` stay on `ubuntu-latest` for every branch, because they're arch-independent JS/TS checks. Only the Docker image is arch-specific.

**Other rules:**
- `concurrency: ci-${{ github.ref }}`. For PRs, `cancel-in-progress: true`. For pushes it's `false`, so a deploy never gets cut mid-way. A second concurrency group `deploy-<branch>` on `deploy` serializes tag bumps per environment.
- Least-privilege `permissions`: `contents: read` at workflow level, and `packages: write` on `image` only.
- An empty `apps` array is not an error. `checks`/`build`/`image`/`manifest`/`deploy` are skipped via `if:` and the run passes.
- **Tag replacement** (D5), in plain sed so no extra tool is needed:
  ```bash
  f="$DEPLOYMENT_CLUSTER_PATH/${app}-sync.yaml"
  test -f "$f" || { echo "::error::$f not found"; exit 1; }
  grep -qE '^\s*APP_IMAGE_TAG:' "$f" || { echo "::error::APP_IMAGE_TAG not in $f"; exit 1; }
  sed -i -E "s|^(\s*APP_IMAGE_TAG:\s*).*$|\1\"${TAG}\"|" "$f"
  ```
  The value is written quoted (`"develop-a1b2c3d"`) so YAML never reads it as a number. If the file already holds this tag, `git diff --quiet` makes the commit a no-op and the step succeeds.

**Configuration you set up in GitHub (not stored in code):**
| Name | Kind | Scope | Value |
|---|---|---|---|
| `DEPLOYMENT_REPO` | variable | repository | `owner/repo` of the GitOps repo |
| `DEPLOYMENT_CLUSTER_PATH` | variable | Environment `develop` / `staging` / `main` | path inside the deployment repo, e.g. `clusters/dev` |
| `DEPLOYMENT_REPO_TOKEN` | secret | repository | fine-grained PAT: **Contents: read & write** on the deployment repo only |

## Code changes (D6)

```jsonc
// apps/cms-api/package.json → "scripts"
"typecheck": "tsc --noEmit"
// apps/cms-admin/package.json (project references) → "scripts"
"typecheck": "tsc -b --noEmit"
// apps/frontend/package.json → "scripts" (next-env.d.ts is gitignored; typegen creates it without a full build)
"typecheck": "next typegen && tsc --noEmit"
```
```jsonc
// turbo.json → "tasks"
"typecheck": { "dependsOn": ["^typecheck"] }
```
Before editing `turbo.json`, read the installed turbo's `docs/reference/configuration.mdx` (see AGENTS.md).

## Commands

```bash
# Local equivalents of the CI steps (from the repo root)
pnpm install --frozen-lockfile
pnpm turbo query affected --packages cms-api cms-admin frontend --base origin/develop --head HEAD
pnpm turbo run typecheck lint --filter=cms-api --filter=cms-admin --filter=frontend
pnpm turbo run build --filter=cms-api
docker build -f apps/cms-api/Dockerfile -t ghcr.io/hungnh1812dev/project-me/cms-api:develop-abc1234 .

# Validate the workflow file
actionlint .github/workflows/ci.yml   # or: docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest

# Tag-replace dry run against a sample file
printf 'spec:\n  postBuild:\n    substitute:\n      APP_IMAGE_TAG: "old"\n' > "$TMPDIR/cms-api-sync.yaml"
```

## Project Structure

```text
.github/
└── workflows/
    └── ci.yml               # the whole pipeline (new)
apps/*/package.json          # + "typecheck" script
turbo.json                   # + "typecheck" task
SPEC-ci.md                   # this spec
```

Nothing else is added: no composite actions and no reusable workflows. Split into more files only if `ci.yml` grows past ~200 lines.

## Code Style

- Job and step names are short and imperative (`Detect affected apps`, `Push image`).
- Every `run:` script starts with `set -euo pipefail` when it is more than one line.
- No `${{ }}` interpolation of untrusted input (branch names, PR titles) directly inside `run:`. Pass it through `env:` and reference `"$VAR"` (script-injection hardening).
- Matrix inputs (app list, platform list) flow via job `outputs` + `fromJSON`. The only artifacts are the per-arch image digests passed from `image` to `manifest` (tiny files, 1-day retention).

## Testing Strategy

A workflow can't be unit-tested, so verification is staged:
1. **Static:** `actionlint` passes with zero findings.
2. **Local logic:** run the `turbo query affected` command and the sed replacement against sample files. The samples cover a nested key, a key with a quoted old value, a missing key (must fail) and a missing file (must fail).
3. **Local build parity:** `pnpm turbo run typecheck lint build` passes for all 3 apps.
4. **Live (you run it, after approval to push):**
   - Open a PR that touches only `apps/cms-admin`. Only cms-admin is checked and built, and nothing is pushed.
   - Open a PR that touches only `README.md`. `changes` reports `[]`, the other jobs are skipped, and the run is green.
   - Push to `develop`. Images appear in GHCR with tag `develop-<sha7>`, the deployment repo gets one commit, and only the affected `<app>-sync.yaml` files change.

## Boundaries

- **Always:** keep permissions least-privilege, route untrusted values through `env:`, keep one commit per deploy run, fail loudly if a sync file or key is missing, and read the bundled turbo docs before touching `turbo.json`.
- **Ask first:** committing or pushing anything (including to trigger a live test run), adding tests (`pnpm test`) to the checks, any app code change beyond the `typecheck` script, adding third-party (non-`actions/`, non-`docker/`, non-`pnpm/`) actions, and changing Dockerfiles.
- **Never:** hardcode `DEPLOYMENT_REPO`, paths or tokens in the workflow; push images or bump tags from `pull_request` events; use `pull_request_target`; deploy the moving `<branch>` tag; touch `.env*` files other than `.env.example`.

## Success Criteria

1. `.github/workflows/ci.yml` exists and `actionlint` reports nothing.
2. Every app has a `typecheck` script, `turbo.json` has a `typecheck` task, and `pnpm turbo run typecheck lint build` exits 0 locally.
3. PR runs never execute `image`, `manifest` or `deploy`.
4. A commit that affects no app ends green, with `checks`/`build`/`image`/`manifest`/`deploy` skipped.
5. A commit that affects only app X builds, pushes and bumps only X. A change in `packages/*` or `pnpm-lock.yaml` affects every app that depends on it.
6. A push to branch B pushes `ghcr.io/hungnh1812dev/project-me/<app>:B-<sha7>` (and `:B`), and commits `APP_IMAGE_TAG: "B-<sha7>"` into `$DEPLOYMENT_CLUSTER_PATH(B)/<app>-sync.yaml` in `DEPLOYMENT_REPO`, leaving the rest of that file byte-identical.
7. A missing sync file or a missing `APP_IMAGE_TAG` key fails the `deploy` job with a clear error. No partial commit is made.
8. Two quick pushes to the same branch don't corrupt or lose a tag bump (deploy concurrency + rebase retry).
9. `docker buildx imagetools inspect <image>:<tag>` lists exactly the platforms for that branch, not counting `unknown/unknown` provenance attestation entries: `linux/arm64` for `staging`, `linux/amd64` for `main`, and both for `develop`. The staging image runs on the M1 Ubuntu VM, the main image runs on the Intel Ubuntu host, and the develop image runs on either.

## Implementation Notes

- **T0 (2026-09-28), `turbo query affected` behavior on this repo (turbo 2.11.5):**
  - **Output:** JSON on stdout with the shape `.data.affectedPackages.items[] | {name, path, reason.__typename}` and `.data.affectedPackages.length`. Warnings go to stderr, so `2>/dev/null | jq` is safe.
  - **Invalid or missing base** (e.g. `0000…0000`, or a SHA lost after a force push): turbo itself warns `unable to detect git range, assuming all files have changed` and returns **all** packages. The explicit fallback in the `changes` job is therefore belt-and-braces, not load-bearing.
  - **Measured with synthetic commits:**

    | Changed file | Affected apps |
    |---|---|
    | `README.md` | none |
    | `apps/cms-admin/src/App.tsx` | cms-admin |
    | `apps/cms-api/Dockerfile` | cms-api |
    | `packages/types/src/index.ts` | none (no app depends on `@repo/*` yet) |
    | `pnpm-lock.yaml` (no dependency change) | none (turbo diffs the lockfile per package) |
    | root `package.json` (whitespace only) | none |
    | `turbo.json` | all 3 (`DefaultGlobalFileChanged`) |
    | `.nvmrc` | none |
    | `.github/workflows/ci.yml` | **none** |

  - **Consequence:** a commit that only edits the workflow (or `.nvmrc`) runs no checks, builds or deploys. See Open Question 4.
- **T1 (2026-09-28), typecheck:**
  - **Frontend:** a clean checkout has no `next-env.d.ts` (it's gitignored), so frontend runs `next typegen` (Next 16.3) before `tsc --noEmit`.
  - **cms-api bug found:** the new typecheck exposed an existing bug in Nest's generated `test/app.e2e-spec.ts`. The file imports `supertest/types`, but cms-api is ESM (`"type": "module"`, `nodenext`) and supertest has no `exports` map, so the subpath needs its extension. Fixed to `supertest/types.js` (user-approved). Nobody noticed before because `nest build` excludes `test/` and Vitest doesn't typecheck. `test:e2e` still passes.
  - **Verified:** on a clean `git archive` export, `pnpm install --frozen-lockfile && turbo run typecheck lint build --force` passes 9/9. A deliberate type error in each app makes all 3 `typecheck` tasks fail.
  - **Gotcha for local clean-copy tests:** a copy placed under the gitignored `out/` makes oxlint and eslint find "no files". The copy needs its own `git init`.
- **T2 (2026-09-28), `changes` job:**
  - **turbo via npx:** turbo runs as `npx -y turbo@${TURBO_VERSION}` (workflow-level env, `2.11.5`, the same pin as the Dockerfiles). There's no `pnpm install` in this job. Verified on a fresh clone with no `node_modules` and a cold npm cache.
  - **Checkout:** `fetch-depth: 0`.
  - **Base commit:** the push base is `github.event.before`, and the PR base is `pull_request.base.sha`. If that commit is empty or missing (`git cat-file -e`), the job falls back to all apps explicitly, with a `::notice::`.
  - **PR target:** PRs resolve their target from `github.base_ref`, and the tag uses the PR head SHA. Only push runs use the tag.
  - **Tests:** a local harness (`out/t2/`, not committed) pulls each step's `run:` block out of `ci.yml` and runs it with `bash -eo pipefail`, like the runner does. 15 cases pass: affected per synthetic commit, zero/unknown/empty base, the branch → platform/runner matrix for develop/staging/main, an empty app list, and an unmapped branch failing. actionlint 1.7.12 with shellcheck is clean.
- **T3 (2026-09-28), `checks` and `build` jobs:**
  - **Filters:** both jobs turn `apps` into `--filter=<app>` args with `read -r -a`, not `mapfile`, so the same script runs under the local bash 3.2 harness and the runner's bash 5.
  - **Skipping:** `build` needs `[changes, checks]`, so it's skipped automatically whenever `checks` is skipped (no affected apps).
  - **Setup:** the setup steps (checkout, pnpm, Node from `.nvmrc` with the pnpm store cache, `pnpm install --frozen-lockfile`) are duplicated in the two jobs on purpose. The spec says no composite actions.
  - **Tests:** 9 harness cases pass. They run the real steps with a given `apps` and check that turbo executed only those apps' tasks, plus structural checks on gating, `needs`, the frozen lockfile and `.nvmrc`.
- **T4 (2026-09-28), `image` and `manifest` jobs:**
  - **Pattern:** the manual digest pattern (build by digest per arch, then merge), as specified. Docker's docs now point to the reusable `docker/github-builder` workflow (v1) for distributed multi-arch builds. We didn't adopt it: it needs `id-token: write` for signing and hand-built `registry-auths` for GHCR, and the per-app matrix + GITHUB_TOKEN setup here is already small.
  - **Simplification:** dropped `docker/metadata-action`. Both tags are known upfront (`changes` outputs `tag` + `branch`), and labels go straight on `build-push-action`.
  - **Action majors:** checked release notes for build-push v7, metadata v6 and download-artifact v8. The changes are runtime-only (Node 24, ESM, download-artifact v8 errors on hash mismatch). The inputs used here are unchanged.
  - **Attestations:** `build-push-action` adds a provenance attestation per platform by default. It shows up in `imagetools inspect` as `unknown/unknown`. Kept.
  - **Tests:** 17 harness cases pass (structure; the digest export step; the merge step with a fake `docker` checking the exact `imagetools` args).
  - **End-to-end locally:** cms-admin was built per arch by digest (`docker-container` builder, like `setup-buildx-action` creates; the plain `docker` driver can't push by digest) and pushed to a throwaway `registry:2`. Then the real merge step ran. Results: the develop tag has `linux/arm64` + `linux/amd64`, the moving `develop` tag exists, and a single-digest staging tag has only `linux/arm64`. `docker run --platform linux/{arm64,amd64} <image>:develop-<sha>` printed `aarch64` / `x86_64`.

## Open Questions

1. **Tests in CI:** `cms-api` has Vitest specs (`pnpm test`). The flow you gave has no test step. Default: leave it out, as specified. Should I add `test` next to `typecheck lint`?
2. **GHCR package visibility:** new GHCR packages are **private** by default, so the cluster needs an image pull secret, or you make each package public once after the first push. Nothing in the workflow depends on this. Just confirm your cluster can pull.
3. **Environment protection:** should `main` require manual approval (a GitHub Environment "required reviewer") before `deploy`? Default: no protection, so it's fully automatic.
4. **Workflow-only changes build nothing** (T0 finding). Default: accept it; the next app change exercises the new workflow. Alternative: add `workflow_dispatch` (manual "run for all apps" button), or treat a change to `.github/workflows/ci.yml` as "all apps affected". Either one adds a few lines to `changes`.
