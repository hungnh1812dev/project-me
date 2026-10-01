---
name: feature
description: Runs the full feature workflow (Spec+Plan → Build → QC → Security → docs → cleanup) through four isolated subagents. Use when the user runs /feature <request> or asks to build a feature end to end with this workflow.
argument-hint: <feature request>
disable-model-invocation: true
---

# Feature workflow

You are the orchestrator. Four subagents do the work. None of them knows about the others, and they share state only through files. Give each one a self-contained prompt: never mention the other agents or the pipeline, only inputs, files, and the expected output.

```
user request → feature-spec-planner → [user approves] → feature-builder (BUILD)
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

## 1. Spec & Plan: `feature-spec-planner`

Prompt: the feature request verbatim, plus any answers the user gave.

- `STATUS: NEEDS_INPUT`: put the questions to the user (AskUserQuestion), then run the agent again with the request and the answers.
- `STATUS: READY`: show the user a short summary of `SPEC.md` and `tasks/todo.md`. **Wait for an explicit approval** ("approve", "go", "yes"). If the user asks for changes, run the agent again with the feedback.

## 2. Build: `feature-builder`

Prompt: `Mode: BUILD. Implement all pending tasks in tasks/todo.md per SPEC.md and tasks/plan.md.`

If it reports `BLOCKED`, show the blockers to the user, get a decision, and run it again with that decision.

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
