# Board - launch-gate
Source: `tasks/todo.md` · Phases: `tasks/plan.md` "Phase LG: launch gate" · Base: 9d6a334
Feature checks: qc n/a · security n/a (one phase; LG-1 and LG-3 are its whole-project checks)
Decisions: -
Open risks: -

## Phase LG: launch gate (ADR 0011 addendum; no public DNS, ingress or announced URL until LG passes and the user approves in writing)
Base: 9d6a334 · Phase checks: qc pending · security pending · Checkpoint: pending (LG-A: CLG-1..7, tier 3; LG-B: CLG-8..9, tier 3; LG-C..LG-E not run)
Done: LG-dep, LG-db-1..6, LG-pg17 (see done.md) · Checkpoints LG-A..LG-E in `tasks/plan.md`, none run yet; LG-E is the phase exit

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LG-0 | Launch blockers decided with the user (nine items, see handoff.md) | manager + user | todo (can start) | - |
| LG-db-7 | Owner runs S3-S7 on the real Supabase project | user | todo (user) | - |
| LG-2 | `scripts/launch-check.sh` read-only live check + "Before going public" in docs/deployment/k3s-traefik.md | core-builder | todo | - |
| LG-1 | Whole-project security review (D1-D20 verdict table, tier 3 dynamic run) | security-qc (opus) | todo (after LG-2) | - |
| LG-fix-* | Fix tasks from the LG-1 and LG-3 findings | per finding | placeholder | - |
| LG-3 | Live check of the deployed production config (throwaway 2FA admin; write probes before public; ZAP passive scan, ask user again right before) | qc, security-qc | todo (after LG-1, LG-fix-*) | - |

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- LG-dep, LG-db-1..6, LG-pg17 (before the migration): see `tasks/done.md`.

## Notes
