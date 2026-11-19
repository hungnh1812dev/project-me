# Board - shared-human-check
Source: tasks/todo.md "Feature shared-human-check" (HC-1..HC-12) · Phases: tasks/plan.md "## Feature shared-human-check" · Base: 1883764ab9d63f6531660bd834601407283d38e0
Size: large
Breaks: after HC-4, after HC-8
Feature checks: qc pending · security pending · Checklist: CHECKLIST.md
Decisions: D25 and ADR 0027 approved; Q-HC1 hook returns the token, with TurnstileSlot and resetTurnstile; Q-HC2 TURNSTILE_EXPECTED_HOSTNAME is a comma-separated list; Q-HC3 drop module-auth.openCms with a destructive migration (user yes); Q-HC4 one site key and one secret for both hosts; Q-HC5 forgotten password protects both steps (user yes); Q-HC6 tests split by phase (user yes); deletions as listed in the plan (builder asks before each).
Open risks: reviewer-console (on hold) needs a REPLAN against this feature before it is built; draft `design-single-type-reopen` also edits tasks/plan.md and tasks/todo.md (rebase before its apply).

## Phase 1: Turnstile kit in form-commons
Base: - (set when its first task starts) · Phase checks: qc pending · security pending · Checkpoint: pending
Checkpoints: HC-A pending (checklists/HC-A.md)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| HC-1 | Turnstile kit `@abyss/form-commons/human-check` | ui-builder | todo | - |

## Phase 2: cms-api verifies the human check
Base: - (set when its first task starts) · Phase checks: qc pending · security pending · Checkpoint: pending
Checkpoints: HC-B pending (checklists/HC-B.md)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| HC-2 | cms-api module `human-check`: verifier, guard, config; reviewer uses it | core-builder | todo | - |
| HC-3 | The six public auth routes require the human check | core-builder | todo | - |
| HC-4 | Stacks, seeds and deploy docs send and configure the human check | core-builder | todo | - |

## Phase 3: cms-admin and web on the shared kit
Base: - (set when its first task starts) · Phase checks: qc pending · security pending · Checkpoint: pending
Checkpoints: HC-C pending (checklists/HC-C.md)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| HC-5 | Web sign-in on the kit; the BFF forwards the token | ui-builder | todo | - |
| HC-6 | Web drops every reference to cms-admin | ui-builder | todo | - |
| HC-7 | cms-admin Turnstile setup: site key, kit wiring, CSP | ui-builder | todo | - |
| HC-8 | cms-admin login and 2FA step send the token | ui-builder | todo | - |
| HC-9 | cms-admin owner setup and forgotten password send the token | ui-builder | todo | - |
| HC-10 | cms-api drops `module-auth.openCms` | core-builder | todo | - |
| HC-11 | Builds, CI and stacks: admin site key in, web secret keys and admin URL out | core-builder | todo | - |
| HC-12 | Deploy docs, patch notes and change log | core-builder | todo | - |

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- (none yet)

## Notes
- Builds run one at a time (one unit in the working tree). The user's "apply and test together" applies to the Phase 3 test block only: checks run once at HC-C.
