# Current Unit: T37g
## T37g Remove e2e from CI; publish gated on app checks only
Status: ready-for-checks
What was built: removed the e2e job and `e2e` output from ci.yml and affected.sh; `publish-<app>` now `needs: [changes, <app>]` and checks only the app result (not the repo job). Comments and docs say e2e is local only. The three files were deleted by the manager after user approval.
Changed files:
- .github/workflows/ci.yml - e2e job and output removed; publish needs/if no longer mention e2e; header comment
- .github/workflows/_publish.yml - header comment only
- .github/scripts/affected.sh - `e2e` output, E2E_PATHS and e2e_files logic removed
- .github/scripts/affected.test.sh - e2e expectations, e2e-path loop and e2e-only fixtures removed (13 cases remain)
- scripts/lib/stack-seed.sh, scripts/stack/cms-api.env, scripts/smoke.sh, docker-compose.smoke.yml - comments only
- docs/ci-cd.md - flow, jobs table, change detection, "e2e (local only)" section, Publish gate
- apps/e2e/README.md - one line: e2e runs locally only
Behaviour to verify:
- `bash .github/scripts/affected.test.sh` - 13 passed
- actionlint (docker) - clean on .github (run while e2e.yml still exists)
- publish-<app> `if` - still has always() + publish + <app>_image + <app> result == success; no e2e reference
- After deletions: `grep -rnE "e2e\.yml|e2e-stack|needs\.e2e|outputs\.e2e|E2E_PATHS" .github` and `grep -rn "e2e-stack\|e2e-in-ci\|web-build.env" scripts docs apps/e2e/README.md docker-compose.smoke.yml` find nothing (verified: nothing found)
Security-relevant: the condition that lets publish-<app> push images (packages: write) and bump the deploy repo is now: push to staging/main + <app>_image + <app> flow success (always() kept). Permissions, secrets, inputs unchanged. No longer gated on e2e (user decision) or on the repo job (user decision).
Checks needed: qc-cli (affected.test.sh, actionlint, greps above; smoke not needed: comment-only changes in scripts/compose)
Risk: high (Security gate: yes, changes the publish gating condition)
Verification: format pass (changed files; pnpm format:check only warns on gitignored apps/e2e report artifacts) · build/type-check n/a · unit tests pass (affected.test.sh 13) · docs docs/ci-cd.md, apps/e2e/README.md
Proposed commit: |
  ci(root): remove e2e from CI and gate publish on app checks only

  e2e no longer runs in GitHub CI (local only via pnpm smoke and
  pnpm e2e:spec). publish-<app> now waits only for the app flow.
  Drops the e2e job and output, the e2e routing in affected.sh and its
  tests, and updates docs and comments.

  Affected:
  - .github
  - scripts
  - docs
  - apps/e2e (README line)
Deletions needing approval: none (e2e.yml, e2e-stack.sh, web-build.env approved and deleted; greps return nothing, actionlint clean, affected.test.sh 13 passed)
Fix log:
