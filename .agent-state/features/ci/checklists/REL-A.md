# Checklist - REL-A
Base: 0cc74bd6 · Updated: 2026-11-04 after CHECK tier=0

| ID | Description | Input | Expected output | Checker | Method | Source | Status | Note |
|---|---|---|---|---|---|---|---|---|
| CREL-A-1 | `pipeline-target.sh` gives the branch and tag table | REL-1, REL-2 | `bash .github/scripts/pipeline-target.test.sh` exits 0: develop `should_build=false`; staging `should_build=true`, `should_build_image=false`; main `should_build_image=true`, `should_push_image=false`, `environment=production`; tag `v1.2.3` all `true`, `deploy_ref=main`; unknown branch fails; app without a new image gets an empty matrix | qc | T0 cli | planner | pass | 11 passed |
| CREL-A-2 | `release-apps.sh` picks the release set | REL-2 | `bash .github/scripts/release-apps.test.sh` exits 0: first release, one app bumped, no app bumped, tag/version mismatch fails, tag off main fails, stale-version warning | qc | T0 cli | planner | pass | 12 passed |
| CREL-A-3 | Existing helper scripts still pass | REL-1 | `bash .github/scripts/affected.test.sh` and `bash .github/scripts/build-args.test.sh` exit 0 | qc | T0 cli | planner | pass | affected 14, build-args 13 passed |
