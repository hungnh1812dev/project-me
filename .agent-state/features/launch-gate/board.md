# Board - launch-gate
Source: `tasks/todo.md` · Phases: `tasks/plan.md` "Phase LG: launch gate" · Base: 9d6a334
Feature checks: qc n/a · security n/a (one phase; LG-1 and LG-3 are its whole-project checks)
Size: large - eight phases, 10 open tasks, security gates on every open task but LG-api-1 (read-only)
Breaks: after LG-pg17, after LG-api-1, after LG-env-1 (the user rebuilds and redeploys the images), after LG-2, after LG-1, after LG-3
Decisions: API-2 (docs/apps/cms-api/SPEC.md): cms-api accepts NODE_ENV development, test, staging, production; production-only guards stay on production (user 2026-11-14)
Open risks: -

## Phase LG: launch gate (ADR 0011 addendum; no public DNS, ingress or announced URL until LG passes and the user approves in writing)
Base: 9d6a334 · Phase checks: qc pending · security pending · Checkpoint: pending (LG-A: CLG-1..7, tier 3; LG-B: CLG-8..9, tier 3; LG-C..LG-E not run)
Done: LG-dep, LG-db-1..6, LG-pg17 (see done.md) · Checkpoints LG-A..LG-E in `tasks/plan.md`, none run yet; LG-E is the phase exit

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LG-0 | Launch blockers decided with the user (ten items, see handoff.md) | manager + user | in-progress | - |
| LG-db-7 | Owner runs S3-S7 on the real Supabase project | user | todo (user) | - |
| LG-2 | `scripts/launch-check.sh` read-only live check + "Before going public" in docs/deployment/k3s-traefik.md | core-builder | todo | - |
| LG-1 | Whole-project security review (D1-D20 verdict table, tier 3 dynamic run) | security-qc (opus) | todo (after LG-2) | - |
| LG-fix-* | Fix tasks from the LG-1 and LG-3 findings | per finding | placeholder | - |
| LG-3 | Live check on a local k3s cluster with the production config: two content stages (mock, then cms data), rebuild of web, cms-api, cms-admin as 0.0.1h (checkpoint LG-E) | qc, security-qc | in-progress (images 0.0.1h deployed by the user 2026-11-14) | - |
| LG-4 | Read-only check of the public production site, after the owner publishes content (checkpoint LG-F; ZAP passive scan, ask user again right before) | qc, security-qc | todo (after LG-3, LG-fix-*) | - |

## Phase 5a: Web BFF on the local k3s cluster (checkpoint LG-W)
Base: debe158c · Phase checks: qc pass · security pass · Checkpoint: passed 2026-11-14 (LG-W: CLG-49..54 pass; user confirmed)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LG-api-1 | Diagnose the web `/api/v1/*` routes on the local k3s cluster (read-only) | qc | done (read-only, no commit; re-check passed 2026-11-14) | - |
| LG-api-fix-* | Fixes for the LG-api-1 causes | devops (deploy repo, outside this repo) | n/a (user 2026-11-14: fixed outside the repo, DR1) | - |

## Phase 5b: NODE_ENV=staging for cms-api (checkpoint LG-N)
Base: 8f650a5d · Phase checks: pending · Checkpoint: pending (LG-N: checklists/LG-N.md synced 2026-11-15, CLG-64..73)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LG-env-1 | cms-api node envs become development, staging, production; tests run as development | core-builder | done (CLG-34 pass on 0.0.1l, finding closed) | cbb5e4de |

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| DR1 | DevOps update docs for LG-api-1 (ingress route and web image) | core-builder (docs) | done | cc82de24 |
| DR2 | Import path aliases in the web api v1 routes (14 files, recorded for the commit gate) | core-builder | done | 8f650a5d |
| DR3 | Local registry push default tag is a timestamp, not the commit hash | core-builder | done | 6d802b83 |
| DR4 | Support --no-cache in local-registry-push.sh | core-builder | done | aaa3ddca |

## Built
- LG-dep, LG-db-1..6, LG-pg17 (before the migration): see `tasks/done.md`.
- DR1: devops steps in patch-web-0.2.0 items 5-7 (remove the cms-api route on the web host, rebuild the web image clean), linked from traefik.md and the devops runbook.
- DR4: `--no-cache` in scripts/local-registry-push.sh, passed to every `docker build` of the run (aaa3ddca).

## Notes
- LG-api-1 (2026-11-14): read-only diagnosis of web /api/v1/* on the local cluster; causes fixed outside the repo (DR1); re-check passed. Replan `replan-LG-api-1` applied (CLG-50/51 rows, CLG-55 in LG-F).
