# Implementation Plan: CI/CD pipeline

Spec: [../SPEC-ci.md](../SPEC-ci.md). The previous plan (the monorepo scaffold, finished) is in git history at `0cf1bf8`.

## Overview

Add `.github/workflows/ci.yml`. It detects which apps a commit affects, typechecks, lints and builds them, and on pushes it publishes per-arch images to GHCR, merges them into a tagged manifest, and bumps `APP_IMAGE_TAG` in the deployment repo. The only other code change is a `typecheck` script per app plus a turbo task.

## Architecture Decisions

- **One workflow file, no helper scripts.** Per the spec's Project Structure section. Shell logic that needs testing (affected detection, tag replacement) is exercised with throwaway git objects (plumbing commits) and a gitignored `out/` dir inside the project. Nothing goes in the scratchpad (global rule: no files outside the project), and nothing is committed as a separate script.
- **Build order follows the job chain.** Each task adds the next job(s) and leaves a workflow that is valid (`actionlint`-clean) and runnable on its own. After T3 the PR path is complete. T4 adds publishing, and T5 adds deploy.
- **Fail fast on the unknowns.** T0 checks action versions, arm64 runner availability and `turbo query affected` output before any workflow code is written.
- **Local tooling:** there is no `actionlint`, `gh` or GNU sed on this Mac, so we run `rhysd/actionlint` and `ubuntu:24.04` via Docker. The Mac is arm64, so the arm64 image builds natively here.

## Dependency graph

```
T0 research ─┬─> T2 changes job ──> T3 checks + build ──> T4 image + manifest ──> T5 deploy ──> T6 live verify
T1 typecheck ┘                         (needs T1)
```

T0 and T1 are independent. Everything after them runs in sequence because every job edits the same file and depends on the previous job's outputs.

## Task List

### Phase 1: Foundation
- [x] T0: Verify externals (action majors, arm64 runners, `turbo query affected` output shape)
- [x] T1: `typecheck` script per app + turbo task

### Checkpoint A
- [x] `pnpm turbo run typecheck lint build` is green, and T0 findings are recorded in SPEC-ci.md

### Phase 2: PR path
- [x] T2: Workflow skeleton + `changes` job
- [ ] T3: `checks` + `build` jobs

### Checkpoint B
- [ ] `actionlint` is clean. The detection script passes its scratch cases. **Ask:** push a branch/PR so the PR path runs live?

### Phase 3: Publish + deploy
- [ ] T4: `image` + `manifest` jobs
- [ ] T5: `deploy` job

### Checkpoint C
- [ ] `actionlint` is clean, and the tag-replace fixtures pass in `ubuntu:24.04`
- [ ] **Ask:** commit, then push to `develop` for the live run (needs your GitHub vars/secret set first)

### Phase 4: Verify
- [ ] T6: Live verification against SPEC-ci.md Success Criteria + implementation notes

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GitHub-hosted `ubuntu-24.04-arm` runners are unavailable for this repo/plan | High (staging + develop arm64 builds) | T0 checks this first. The fallback is `docker/setup-qemu-action` on `ubuntu-latest`, keeping the same matrix shape so only `runs-on` changes. |
| `turbo query affected` needs history back to `before`/the PR base, and a shallow clone marks everything as affected | Med | `fetch-depth: 0` in `changes`. Force pushes and new branches fall back to all apps explicitly. |
| Turbo treats root file changes (lockfile, `turbo.json`) as affecting everything | Low (extra builds, not wrong ones) | Accepted. It is correct behavior. |
| `tsc -b --noEmit` on cms-admin behaves differently with TS 6 project references | Low | T1 verifies it. The fallback is `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit`. |
| `next build` needs Next's generated types before `tsc --noEmit` passes on frontend (`.next/types`, `next-env.d.ts`) | Med | T1 runs typecheck on a clean checkout. If it fails, use `next typegen && tsc --noEmit` (check that Next 16.3 has `typegen`). |
| Digest artifacts collide across the matrix | Med | Name each artifact `digest-<app>-<arch>`, and have `manifest` download with the pattern `digest-<app>-*` + `merge-multiple`. |
| Deployment repo pushes race between two runs | Med | Concurrency group `deploy-<branch>` + rebase-retry loop (SPEC criterion 8). |
| Script injection via branch names | Med | All `github.*` values reach `run:` only through `env:`. `actionlint` (with shellcheck) flags violations. |
| The live run can't happen without your vars/secret (`DEPLOYMENT_REPO`, Environments, `DEPLOYMENT_REPO_TOKEN`) | Blocks T6 | Checkpoint C lists exactly what to create. T4 can be proven live before the deploy config exists, because `deploy` failing on missing vars is acceptable during bring-up. |

## Open Questions (carried from SPEC-ci.md, defaults used unless you say otherwise)

1. Tests in CI: default no.
2. GHCR pull access from the cluster: you confirm it on your side.
3. Manual approval for `main` deploys: default none.
