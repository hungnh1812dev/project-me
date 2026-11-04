# CI and release
Done: 2026-11-04 · Commits: 9db3759..12cebd75 · Apps / packages: root (.github, scripts, release-tag skill, docs/deployments, CHANGELOG, docs/global/FLOW.md), docs/apps patch notes for cms-api, cms-admin, web

## Overview
The GitHub pipeline runs checks on develop, builds staging without publishing, and builds main without pushing. Images and deploy-repo bumps happen only on a `v<x.y.z>` release tag, released through a two-sitting `release-tag` skill. The cms-api integration tests run only on release tags and gate the cms-api publish.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| CI follows the earlier deployment config | Staging builds for linux/amd64 on ubuntu-24.04; build args validated before output | CI-old-1, CI-old-2, CI-old-4 |
| Tag-driven release | Per-branch pipeline depth; images tagged by app version; release only on a tag at origin/main; prod bump in the deploy repo | REL-1, REL-2, REL-3, REL-4 |
| Integration tests on release tags | Separate `integration` job, tag-only, gates publish cms-api | CI-INT-1 |

## Structure
- `.github/workflows/`: `_publish.yml`, `ci.yml`, `app-checks.yml`, `cms-api.yml` (changed)
- `.github/scripts/`: `pipeline-target.sh`, `release-apps.sh`, `build-args.sh` and their `*.test.sh` (added or changed)
- `scripts/`: `release.sh`, `release.test.sh` (added)
- `.claude/skills/release-tag/`: `SKILL.md` (added)
- `docs/deployments/`: `ci-cd.md`, `release.md` (changed)
- `docs/apps/{cms-api,cms-admin,web}/`: `patch-<app>-0.0.2.md` (added)
- `docs/global/FLOW.md`: SPEC job for the release flow (changed)
- `CHANGELOG.md`: `## Unreleased` DevOps item (changed)

## Major issues
None. No critical or high finding was raised; the medium findings on CI-A (CCI-2 expectation, CCI-3 prettier) were fixed in their checkpoint round.
