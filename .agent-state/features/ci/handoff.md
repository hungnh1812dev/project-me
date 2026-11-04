# Handoff - ci
Updated: 2026-10-30 after migration to feature folders

## In progress / next
- Next: run checkpoint CI-A (tier 1); tasks committed. First real CI run is still unverified (user set up GitHub Environments, branch rules and secrets).
- 2026-11-04 user approved ADR 0016 (Phase REL, tasks/todo.md REL-1..REL-4): no changesets; `release-tag` skill + scripts/release.sh; staging builds only; bare-version image tags; main image job keeps env production; repo version 0.0.2; release commit in two sittings (develop, then tag on main); first tag v0.0.2, no v0.0.1. Build order: CHECKLIST Phase REL, REL-1, REL-2 (security gate), FLOW.md SPEC job, REL-3, REL-4.
- Open: CI-INT-1 waits for Q-CI1..Q-CI4 (user).
- 2026-11-04 user: run CI-A (CI-old checkpoint, CCI-1..3, tier 1) before REL-1. CREL-B-18 stays; the user records the post-push GitHub run results on the board/handoff.
- REL checklist written in tasks/plan.md (REL-A: CREL-A-1..3; REL-B: CREL-B-1..18).
- REL-1 committed ab378b1f (qc-cli tier 1 pending at checkpoint REL-A). Next: REL-2 (security gate).
- REL-2 368b13b5 · FLOW.md 50eb34f7 · REL-3 cd210bee · REL-4 97536430. Checkpoint REL-A passed (qc tier 0).
- Checkpoint REL-B tier 1: qc blocked only on CREL-B-18 (user pushes manually, then records the GitHub run results here: develop Build skipped, staging no publish, main image green with no new GHCR tag, first v-tag run pushes the image and bumps the deploy repo). Open: qc-REL-B-1 (fix in progress), CREL-B-13/14 and the security part of CREL-B-7/12 (security-qc), CREL-B-19 (tier 3 full e2e).
- 2026-11-04 user dropped feature deploy-docs (its folder kept, empty); ci is now in-progress.

- REL-2 Release on a repo tag - awaiting checks/commit; next: security gate review, then FLOW.md SPEC job, REL-3.
- REL-3 release-tag skill + release.sh - awaiting checks/commit; next: REL-4 docs and patch notes.
- REL-4 Docs, patch notes, change log - awaiting commit; next: checkpoint REL-B.

## Direct requests

## Follow-ups
