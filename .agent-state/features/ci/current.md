# Current Unit: REL-A
## REL-1 Job depth per branch
Status: ready-for-checks
What was built: branch table moved to `.github/scripts/pipeline-target.sh` (develop checks, staging build, main unpushed image); `should_build` input on cms-api/app-checks; `should_push` input on `_publish.yml` (login, push, digest upload, manifest, deploy skipped when false); ci.yml uses the script and `should_build_image`.
Changed files:
- .github/scripts/pipeline-target.sh - new, branch depth + matrices
- .github/scripts/pipeline-target.test.sh - new, 9 cases
- .github/workflows/ci.yml - uses script, passes should_build/should_push, header
- .github/workflows/cms-api.yml, app-checks.yml - should_build input, build `if`
- .github/workflows/_publish.yml - should_push, optional tag/deploy_ref
Behaviour to verify:
- pipeline-target.test.sh, affected.test.sh, build-args.test.sh pass
- push to main (after merge): image job builds and guards, nothing pushed, no manifest/deploy
Security-relevant: none (pushes removed; tag output dropped from ci.yml, REL-2 reintroduces tags)
Checks needed: qc-cli tier 1 (the three script tests, prettier); workflow runtime only verifiable post-push (CREL-B-18)
Risk: normal
Verification: format pass · build/type-check n/a · unit tests pass (36 script cases) · docs n/a (docs/deployments/ci-cd.md row 155 still says "Resolve deploy target"; left for the REL docs task) · module docs n/a
Proposed commit: |
  ci(root): scale pipeline depth per branch and stop pushing images

  develop runs checks, staging adds build, main builds and guards an
  image without pushing it. The branch table moves to pipeline-target.sh.
Deletions needing approval: none
Fix log:

## REL-2 Release on a repo tag
Status: ready-for-checks
What was built: `release-apps.sh` (tag/version and main-ancestor guards, previous v* tag, release set by app version, stale-version warning); `pipeline-target.sh` tag row (production, push, deploy_ref main); `ci.yml` tag trigger, affected vs release step, `tag` passed to `_publish.yml`; `_publish.yml` version-only tags, existing-tag revision check, version label, `branch` input removed.
Changed files:
- .github/scripts/release-apps.sh - new
- .github/scripts/release-apps.test.sh - new, 8 cases
- .github/scripts/pipeline-target.sh, pipeline-target.test.sh - tag row + 2 cases
- .github/workflows/ci.yml - tag trigger, release step, tag input, branch removed
- .github/workflows/_publish.yml - tag only, revision guard, version label, deploy commit message
- docs/deployments/ci-cd.md - tag line and flow header (full rewrite left to REL docs task)
Behaviour to verify:
- release-apps.test.sh, pipeline-target.test.sh, affected.test.sh pass; `grep -n 'inputs.branch' .github/workflows` empty; prettier check
- tag run: only version-bumped apps publish; re-run of same commit skips tagging; different revision with same tag fails
Security-relevant: the only path pushing to GHCR and writing the deploy repo with DEPLOYMENT_REPO_TOKEN; tag and main-ancestor guards in release-apps.sh; overwrite guard in Tag job; token handling unchanged. Tag run on tier 3 not verifiable before push.
Checks needed: qc-cli tier 1 (three script tests, prettier); security-qc static review of ci.yml/_publish.yml/release-apps.sh
Risk: high (publishes images and writes to the deploy repo with a token)
Verification: format pass · build/type-check n/a · unit tests pass (script cases 33) · docs docs/deployments/ci-cd.md · module docs n/a
Proposed commit: |
  ci(root): release on a repo tag with app-version image tags

  A v<x.y.z> tag releases the apps whose version changed, pushes
  <app>:<version> images and bumps the deploy repo main.
Deletions needing approval: none
Fix log:
- round 1: REL-2#3 -> release-apps.sh requires HEAD_SHA == MAIN_REF tip (fails closed on a missing ref); tests for non-tip ancestor, missing ref; ci-cd.md and header updated
- round 1: REL-2#2 -> x.y.z check on root and released app versions; test added
- round 1: REL-2#1 -> Tag job fails on any inspect error except not found / manifest unknown

## REL-3 The release-tag skill and scripts/release.sh
Status: ready-for-checks
What was built: `scripts/release.sh` with `changes` (JSON via affected.sh from the previous v* tag; commits per app incl. shared packages), `bump` (perl in-place edit of the "version" line only; refusals), `tag` (main = origin/main, clean, CHANGELOG heading, release-apps.sh; annotated repo and bumped-app tags; never pushes); `release-tag` skill with the two-sitting flow.
Changed files:
- scripts/release.sh - new
- scripts/release.test.sh - new, 25 cases (temp repo with bare origin, stub turbo)
- .claude/skills/release-tag/SKILL.md - new
Behaviour to verify:
- `bash scripts/release.test.sh` and `bash .github/scripts/release-apps.test.sh` pass
- `release.sh changes` on this repo prints JSON with empty previous_tag (no v* tag yet)
- `release.sh tag` refuses off main, on a dirty tree, without a CHANGELOG heading, when the tag exists
Security-relevant: none (local only; no push, no .env read; perl edit takes the version from validated x.y.z arithmetic)
Checks needed: qc-cli tier 1 (the two script tests)
Risk: normal
Verification: format n/a (prettier has no .sh parser; SKILL.md formatted) · build/type-check n/a · unit tests pass (25 + 12) · docs n/a (REL-4) · module docs pass
Proposed commit: |
  ci(root): add release-tag skill and release script for local tagging

  scripts/release.sh lists changes since the previous v* tag, bumps the
  root and app versions and creates the repo and app tags on main without
  pushing. The release-tag skill drives it in two sittings.
Deletions needing approval: none
Fix log:

## REL-4 Docs, patch notes and change log for the tag-driven release
Status: ready-for-checks
What was built: ci-cd.md (depth table, tag-only images, tag guards, `production` rule for `v*`, tag ruleset 5b, staging Environment unused, first-run proof rewritten), release.md (normal release via `release-tag` two sittings, rollback pins `<app version>`), devops-runbook Q-OPS5 answer, three 0.0.2 patch notes, CHANGELOG `## Unreleased` DevOps item.
Changed files:
- docs/deployments/ci-cd.md - sections 1-5, 7, 8
- docs/deployments/release.md - sections 1 (registry row), 3, 5
- docs/deployments/devops-runbook.md - Q-OPS5 line
- docs/apps/{cms-api,cms-admin,web}/patch-<app>-0.0.2.md - new
- CHANGELOG.md - new `## Unreleased` section
Behaviour to verify:
- docs match pipeline-target.sh, release-apps.sh and ADR 0016 (depth table, guards, tag format)
Security-relevant: none (docs only; documents the `v*` tag ruleset and production deployment rule)
Checks needed: none (docs only)
Risk: normal
Verification: format pass · build/type-check n/a · unit tests n/a · docs listed above · module docs pass
Proposed commit: |
  docs(root): document the tag-driven release and add 0.0.2 patch notes

  ci-cd.md and release.md follow ADR 0016: depth per event, app-version
  image tags, tag guards, tag ruleset. One 0.0.2 deploy repo patch per
  app and a CHANGELOG Unreleased item.
Deletions needing approval: none
Fix log:
