# Board — Abyss CMS v1

Source: `tasks/todo.md` (open tasks) · Checkpoints: `tasks/plan.md` · Finished tasks: `tasks/done.md` · Spec: `SPEC.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email · Q6 owner reviewer-session log reuses the audit log
UI decisions: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only)

## Phase LG: launch gate (ADR 0011 addendum; no public DNS, ingress or announced URL until LG passes and the user approves in writing)
Done: LG-dep, LG-db-1..6, LG-pg17 (see done.md) · Checkpoints LG-A..LG-E in `tasks/plan.md`, none run yet; LG-E is the phase exit

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| LG-0 | Launch blockers decided with the user (nine items, see handoff.md) | manager + user | todo (can start) | - |
| LG-db-7 | Owner runs S3-S7 on the real Supabase project | user | todo (user) | - |
| LG-2 | `scripts/launch-check.sh` read-only live check + "Before going public" in docs/deployment/k3s-traefik.md | core-builder | todo | - |
| LG-1 | Whole-project security review (D1-D20 verdict table, tier 3 dynamic run) | security-qc (opus) | todo (after LG-2) | - |
| LG-fix-* | Fix tasks from the LG-1 and LG-3 findings | per finding | placeholder | - |
| LG-3 | Live check of the deployed production config (throwaway 2FA admin; write probes before public; ZAP passive scan, ask user again right before) | qc, security-qc | todo (after LG-1, LG-fix-*) | - |

## Checkpoints still to run (tasks committed)
| Checkpoint | Covers | Rows | Tier |
|---|---|---|---|
| LG-A | LG-db-1, -2, -3, -5, -6 | CLG-1..7 | 3 |
| LG-B | LG-db-4, LG-pg17 | CLG-8..9 | 3 |
| BK-A | BK-1..4, BK-e2e | CBK-1..3 | 2 + 3 |
| BK-B | BK-doc | CBK-4..5 | 1 |
| CI-A | CI-old-1, -4, -2 | CCI-1..3 | 1 |
| RVOFF-B | RVOFF-doc (still todo) | CRVOFF-8 | 1 |

## Other open tasks
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| RVOFF-doc | Off/on steps in k3s-traefik.md, devops-runbook.md, local-run.md (deploy-config-update.md already lists the keys) | core-builder | todo | - |
| MF-plan | Write MF tasks for option A; set ADR 0007 to accepted | planner | todo | - |
