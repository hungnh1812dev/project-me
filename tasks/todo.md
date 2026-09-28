# Todo: CI/CD pipeline

Spec: [../SPEC-ci.md](../SPEC-ci.md) · Plan: [plan.md](plan.md)

## Phase 1: Foundation

- [x] T0: Verify externals (XS, research only)
  - Acceptance: current major versions recorded for `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`, and `docker/{setup-buildx,login,metadata,build-push}-action`. Whether `ubuntu-24.04-arm` is usable by `hungnh1812dev/project-me` (public vs private + plan) is confirmed, or the QEMU fallback is chosen. The JSON output shape of `pnpm turbo query affected --packages cms-api cms-admin frontend --base <sha> --head HEAD` is captured.
  - Verify: findings added to SPEC-ci.md Tech Stack / Implementation Notes
  - Files: SPEC-ci.md

- [x] T1: `typecheck` script per app + turbo task (S)
  - Acceptance: `typecheck` exists in all 3 apps (`tsc --noEmit` for cms-api/frontend, the project-reference variant for cms-admin). `turbo.json` has `"typecheck": { "dependsOn": ["^typecheck"] }`, added after reading the bundled `docs/reference/configuration.mdx`. It passes on a clean checkout (no `.next/`, no `dist/`).
  - Verify: `rm -rf apps/frontend/.next apps/*/dist && pnpm turbo run typecheck lint build --force` exits 0. Introduce a deliberate type error in one app, confirm `typecheck` fails, then revert it.
  - Files: apps/cms-api/package.json, apps/cms-admin/package.json, apps/frontend/package.json, turbo.json, apps/cms-api/test/app.e2e-spec.ts (approved import fix)

## Checkpoint A
- [x] `pnpm turbo run typecheck lint build` green · T0 findings in SPEC-ci.md · review with you

## Phase 2: PR path

- [x] T2: Workflow skeleton + `changes` job (M)
  - Acceptance: `ci.yml` has the `push`/`pull_request` triggers on develop/staging/main, the concurrency groups (cancel only for PRs) and `permissions: contents: read`. `changes` outputs `apps` (JSON array, apps only), `any`, `platforms` + the `image` matrix include (runner per arch) from the branch map, and `tag` (`<branch>-<sha7>`). Base = PR base sha or `github.event.before`, with a fallback to all apps on a zero or missing `before`. Untrusted values go through `env:` only.
  - Verify: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest` is clean. The detection shell block, run against synthetic plumbing commits (see SPEC-ci.md T0 notes), gives these results: (a) a commit touching only `apps/cms-admin` → `["cms-admin"]`; (b) only `README.md` → `[]`; (c) `packages/types` → the apps that depend on it (currently none, since no `@repo/*` deps exist, so expect `[]` and note it); (d) base `0000000…` → all 3.
  - Files: .github/workflows/ci.yml

- [ ] T3: `checks` + `build` jobs (S)
  - Acceptance: both are gated on `needs.changes.outputs.any == 'true'`, run on `ubuntu-latest` with pnpm + Node from `.nvmrc` + the pnpm store cache and `--frozen-lockfile`, and use `--filter` built from `apps`. `build` needs `checks`. PR runs stop here.
  - Verify: actionlint is clean. The exact filter command, run locally, typechecks, lints and builds only the listed apps.
  - Files: .github/workflows/ci.yml

## Checkpoint B
- [ ] actionlint clean · detection cases pass · **ask before pushing** a branch/PR for a live PR-path run

## Phase 3: Publish + deploy

- [ ] T4: `image` + `manifest` jobs (M)
  - Acceptance: `image` runs only on `push`, with a matrix over the `changes` include list (app × arch) and `packages: write`. It uses `build-push-action` with `platforms: <one>`, `push-by-digest`, GHA cache `scope=<app>-<arch>`, and uploads the `digest-<app>-<arch>` artifact (1-day retention). `manifest` (matrix over apps) uses `metadata-action` for the `<branch>-<sha7>` and `<branch>` tags + OCI labels, then `imagetools create` from all of that app's digests, then `imagetools inspect`.
  - Verify: actionlint is clean. Locally, `docker buildx build --platform linux/arm64 -f apps/cms-api/Dockerfile .` succeeds (native on this Mac). A live check comes in T6.
  - Files: .github/workflows/ci.yml

- [ ] T5: `deploy` job (M)
  - Acceptance: push only, `needs: manifest`, `environment: <branch>`, concurrency `deploy-<branch>` (no cancel). It checks out `vars.DEPLOYMENT_REPO` with `secrets.DEPLOYMENT_REPO_TOKEN` and validates every sync file and key **before** editing any of them (no partial commit). It rewrites `APP_IMAGE_TAG` with sed, makes one commit (`chore(<branch>): bump <apps> to <tag>`), and pushes, retrying up to 3 times with rebase. If nothing changed, it exits 0.
  - Verify: actionlint is clean. The deploy shell block runs in `ubuntu:24.04` against scratch fixtures (a local bare repo as "remote"): nested key → only that line changes (`diff`); the old value quoted/unquoted → both replaced; missing file → fails, no commit; missing key → fails, no commit; same tag twice → second run makes no commit; a concurrent commit on the remote → the retry succeeds.
  - Files: .github/workflows/ci.yml

## Checkpoint C
- [ ] actionlint clean · fixtures pass · you create: repo var `DEPLOYMENT_REPO`, Environments `develop`/`staging`/`main` each with `DEPLOYMENT_CLUSTER_PATH`, secret `DEPLOYMENT_REPO_TOKEN` · **ask before committing/pushing**

## Phase 4: Verify

- [ ] T6: Live verification (S)
  - Acceptance: SPEC-ci.md Success Criteria 1–9 are checked off with evidence (run URLs, `imagetools inspect` output, deployment-repo commit). Implementation notes are added to SPEC-ci.md.
  - Verify: a PR touching only `apps/cms-admin` → only cms-admin checked/built, no image. A README-only PR → green with jobs skipped. A push to `develop` → multi-arch images + one deploy commit. A push to `staging` → arm64-only image. `main` is checked on the first real release, or by a test push if you allow it.
  - Files: SPEC-ci.md
