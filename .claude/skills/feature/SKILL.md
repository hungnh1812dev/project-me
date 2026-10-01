---
name: feature
description: Runs the full feature workflow (Spec+Plan → Build → QC → Security → docs → cleanup) through four isolated subagents. Use when the user runs /feature <request> or asks to build a feature end to end with this workflow.
argument-hint: <feature request>
disable-model-invocation: true
---

# Feature workflow

You are the orchestrator. Four subagents do the work. None of them knows about the others, and they share state only through files. Give each one a self-contained prompt: never mention the other agents or the pipeline, only inputs, files, and the expected output.

```
user request → feature-spec-planner: SPEC draft → [user approves] → write
                                  → PLAN draft → [user approves] → write
  → for each small phase: NEW feature-builder (BUILD <phase>) → [commit approval]
  → feature-qc ──FAIL──→ feature-builder (FIX tasks/qc-report.md) → feature-qc …
  → feature-security ──FAIL──→ feature-builder (FIX tasks/security-report.md) → feature-qc → feature-security …
  → docs (you) → cleanup (you, after the user confirms)
```

Handoff files: `SPEC.md`, `tasks/plan.md`, `tasks/todo.md`, `tasks/qc-report.md`, `tasks/security-report.md`, `tasks/security-audit/`.

## 0. Preflight

- Request: `$ARGUMENTS`. If it's empty, ask the user for the feature request.
- Run `git status --porcelain`. If there are uncommitted changes outside `SPEC.md` and `tasks/`, ask the user whether to commit, stash, or continue. The builder commits per task and must not pick up unrelated work.
- If `SPEC.md` or `tasks/plan.md` already exists, ask whether to resume from it or start fresh.
- Record `BASE=$(git rev-parse HEAD)`.

## 1. Spec & Plan: `feature-spec-planner`, with draft → review → approve → write

Nothing is written to `SPEC.md`, `tasks/plan.md` or `tasks/todo.md` before the user approves it. There are two separate gates: **spec first, then plan.**

Use **one** spec-planner session for the whole of step 1. Start it with an `Agent` call, then continue it with `SendMessage`, so it still holds the exact draft the user approved when it writes. (The fresh-session rule in step 2 applies only to the builder.)

**Gate A: spec**

1. Spawn it with `Mode: SPEC_DRAFT.` plus the feature request verbatim.
2. `NEEDS_INPUT`: ask the user the questions (AskUserQuestion). Send the answers back with `Mode: REVISE`.
3. `DRAFT_READY`: show the user the agent's SUMMARY and the **full** `SPEC.md` draft, exactly as returned. Then ask: approve, or request changes?
   - Changes: send `Mode: REVISE` with the user's feedback verbatim, and repeat step 3.
   - Approval: the reply must be unambiguous ("approve", "yes", "go"). Treat hedged replies as not approved. Then send `Mode: WRITE. APPROVED: SPEC`.

**Gate B: plan** (only after `SPEC.md` is written)

4. Send `Mode: PLAN_DRAFT.`
5. Show the full `tasks/plan.md` and `tasks/todo.md` drafts and ask for approval. Run the REVISE loop the same way. On a clear approval, send `Mode: WRITE. APPROVED: PLAN`.

Never write these files yourself, and never send `WRITE` without the user's explicit approval of that exact draft.

## 2. Build: `feature-builder`, one fresh session per small phase

**Never resume a builder session.** Don't use SendMessage to continue a builder, and don't reuse its agent id. Every builder run (each small phase, each fix round, each retry after a blocker) is a **new** `Agent` call with `subagent_type: feature-builder`. Its context starts empty, so it doesn't drag along earlier phases' tokens. State carries over only through the repo, `tasks/todo.md` (ticks and the `## Handoff` note), and git history.

Read the small-phase ids from `tasks/todo.md` and loop over them in order:

1. Spawn a new builder with: `Mode: BUILD <phase>. Implement only small phase <phase> in tasks/todo.md per SPEC.md and tasks/plan.md, then stop.` Add the user's decision when re-running after a blocker. Don't paste earlier builder output into the prompt.
2. Handle its status:
   - `DONE`: go to the next phase.
   - `NEEDS_COMMIT_APPROVAL`: show the user the proposed message and file list, and ask. On approval, commit it yourself: `git add <exact files>`, then `git commit` with that message (no AI attribution). If the user asks for changes, spawn a new builder with that feedback.
   - `BLOCKED`: show the blockers, get a decision, and spawn a **new** builder for the same phase with that decision.
3. Keep only the builder's short status block in your own context. Don't re-read the files it changed.

When no phase has unchecked tasks left, go to QC.

FIX rounds in steps 3 and 4 follow the same rule: a new builder per round, with the `Mode: FIX <report>` prompt, and the same commit-approval handling.

## 3. QC: `feature-qc`

Prompt: `Verify the working tree against SPEC.md. Affected apps: <apps>.`

- `FAIL`: run `feature-builder` with `Mode: FIX tasks/qc-report.md`, then run QC again.
- **Maximum 3 QC rounds.** After that, stop and show the user `tasks/qc-report.md`.

## 4. Security: `feature-security`

Prompt: `Audit the changes for SPEC.md. Base commit: <BASE>.`

- `FAIL` (any CRITICAL or HIGH finding): run `feature-builder` with `Mode: FIX tasks/security-report.md`, then **run step 3 (QC) again** so the fix hasn't broken anything, then run security again.
- **Maximum 3 security rounds.** After that, stop and escalate to the user.
- Show any MEDIUM or LOW findings that remain to the user in the final summary.

## 5. Docs (you)

Follow the `agent-skills:documentation-and-adrs` skill. For each affected app, create or update `apps/<app>/docs/`:

- One page per feature or area (`<feature-slug>.md`): what it does, how to use it, its API or contract, config and env vars (names only), how to test it, and any decision records worth keeping.
- Link the page from `apps/<app>/docs/README.md` (create that file if missing).
- Update root `docs/architecture.md` only if the cross-app architecture changed.
- Commit as `docs(<app>): ...`. No AI attribution trailer.

## 6. Cleanup (you)

List exactly what will be removed: `SPEC.md`, `tasks/plan.md`, `tasks/todo.md`, `tasks/qc-report.md`, `tasks/security-report.md`, and `tasks/security-audit/`. **Ask the user to confirm before deleting anything.** Then delete only those paths.

## 7. Final summary

Report the commits (`git log --oneline <BASE>..HEAD`), the QC verdict, the security verdict with any remaining findings, the docs pages you touched, and anything you skipped or escalated.
