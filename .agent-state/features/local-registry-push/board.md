# Board - local-registry-push
Source: tasks/todo.md "Feature local-registry-push" · Phases: tasks/plan.md "Feature local-registry-push" · Base: f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb
Size: small · Breaks: none
Feature checks: qc n/a · security n/a (one phase) · Checklist: CHECKLIST.md
Decisions: user 2026-11-09: approve plan; build now while reviewer-console waits; tag = short hash (+ -dirty), LOCAL_IMAGE_TAG overrides; local hosts: localhost; no root package.json change (isolation, user 2026-11-09)
Open risks: none

## Phase 1: Build and push to the local k3d registry
Base: f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb · Phase checks: qc pending · security pending · Checkpoint: pending
Checkpoints: LRP-A pending (checklists/LRP-A.md)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LRP-1 | Script that builds the app images and pushes them to the local k3d registry | core-builder | done | c4fbb494 |
| LRP-2 | Document the local registry push and record it in the change log | core-builder | done | 00e55a5d |


## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- LRP-1: `scripts/local-registry-push.sh` builds and pushes the cms-api, cms-admin and web images to the local registry, after preflight checks; `scripts/local-registry-push.test.sh` stub-tests it (29 checks).
- LRP-2: `docs/deployments/local-registry.md` documents the local registry push; linked from `kubernetes.md`; CHANGELOG Unreleased entry.

## Notes
- Root package.json alias dropped (user 2026-11-09: keep isolated); usage is `bash scripts/local-registry-push.sh`.
