# Board - ci
Source: `tasks/todo.md` · Phases: `tasks/plan.md` "CI from the earlier deployment config (CI-old)" · Base: 9db3759
Feature checks: qc n/a · security n/a (one phase)
Decisions: -
Open risks: -

## Phase CI: CI from the earlier deployment config
Base: 9db3759 · Phase checks: qc pass · security pass · Checkpoint CI-A: passed 2026-11-04 (CCI-1..4, SCI-1..3, tier 1; user approved)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| CI-old-1, CI-old-4, CI-old-2 | CI follows the earlier deployment config (checkpoint CI-A) | core-builder | done, checks pending | see `tasks/done.md` |

## Phase REL: Tag-driven release (ADR 0016)
Base: 0cc74bd6 · Phase checks: qc pending · security pending · Checkpoint: pending (REL-A: REL-1, REL-2 · REL-B: REL-3, REL-4)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| REL-1 | Job depth per branch (pipeline-target.sh) | core-builder | done (qc pending at REL-A) | ab378b1f |
| REL-2 | Release on a repo tag (release-apps.sh, image tags, prod bump); security gate | core-builder | done (security pass; qc pending at REL-A) | 368b13b5 |
| REL-3 | release-tag skill + scripts/release.sh (after FLOW.md SPEC job) | core-builder | done (qc pending at REL-B) | cd210bee |
| REL-4 | docs (ci-cd.md, release.md), 0.0.2 patch notes, CHANGELOG item | core-builder | done (qc pending at REL-B) | 97536430 |

Build order: CHECKLIST Phase REL, REL-1, REL-2, FLOW.md SPEC job, REL-3, REL-4. CI-old checkpoint CI-A is still pending above.

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- CI-old tasks (before the migration): see `tasks/done.md`.

## Notes
