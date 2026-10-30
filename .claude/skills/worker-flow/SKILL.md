---
name: worker-flow
description: The pipeline every builder agent (core-builder, ui-builder) runs for a task - load the task from the state files, plan, implement, unit test, docs, write the unit record, report - plus fix rounds and the rules all builders share. Project-agnostic; project specifics come from .claude/state/project.md. Preloaded by the builder agents.
---

# Worker Flow (builders)

Run the steps in order; move on only when a step's exit check passes. Load a skill your agent file allows only at its step. qc and security-qc check your work from your `current.md`.

`<F>` = `.claude/state/features/<feature>/`, the `in-progress` row of `.claude/state/features.md`. Every task, direct requests included, belongs to that feature.

## 1. Load the task

The dispatch is only `TASK <ID>` (or `BATCH: ...`) plus optional notes. Read only what you need:
1. `.claude/state/project.md` in full (task source, spec, your scope, stack, commands).
2. `features.md`: the `in-progress` row. `<F>/board.md`: grep the task's row and the decision lines at the top.
3. The task's entry in the task source (acceptance, verify, files, deps, spec refs). A direct request `DR<n>`: its `### DR<n>` brief in `<F>/handoff.md` (no spec refs).
4. `<F>/handoff.md` in full: user answers, provisional decisions, follow-ups naming this task.
5. Only the spec sections the entry cites.
6. `conventions.md`: grep your area's section when needed; history of a finished area: grep `.claude/state/archive/`.
7. The code and docs of the listed files (module details are in its README / `docs/modules/`).

Restate the goal and acceptance criteria for yourself in 2-3 lines. Files disagree, `project.md` lacks something, or an assumption would matter → **stop, report `blocked`** with questions.

Overwrite `<F>/current.md` with `# Current Unit: <unit>`; as the second builder of the same task, add your section below the first one's.

Exit: every acceptance criterion is clear and testable.

## 2. Plan

Write 1-3 lines against `code-standards` §4:
- **Ownership:** which module owns this; extend an existing owner instead of duplicating it.
- **Naming:** the main new names, clear without comments.
- **Extension:** how the next similar feature is added, in how few places.
- **Files:** what you add or change, checked against §4.4; never copy a finer split from older code.

Then a short checklist of vertical slices, each verifiable.

Exit: no responsibility duplicated across modules; the next variant needs no edits to unrelated modules.

## 3. Implement

- Follow `code-standards` (no hardcoding; §4).
- Name files and folders by §4.5 and the naming document (`Naming:` in `project.md`); list in the unit record each word the document lacks and each file left without a word where neighbours have one.
- One slice at a time: build, run, next.

Exit: all slices done; build and type-check pass.

## 4. Unit test

Cover acceptance criteria, edge cases and error paths (bugs: failing test first). Run the whole affected package's suite.

Exit: all pass; note the count.

## 5. Docs

Update the "Docs to keep current" in `project.md` for what changed, including the env example for new config keys (names and descriptions only). ADR only for a non-obvious architectural decision.

Exit: docs match the code.

## 6. Finish

1. Re-read your diff against §4: no duplicated responsibility, no "what" comments a better name would replace, no scattered edits in unrelated modules, no split finer than §4.4. Fix what you find.
2. Format the changed files (`code-standards`); re-run the tests if formatting changed anything.
3. Write the proposed commit message (`commit-convention`).
4. Complete your section in `current.md`. Checkers test and review only what you list plus the diff, so be precise in "Behaviour to verify" and "Security-relevant". Set by rule:
   - `Checks needed`: `qc-browser (<flows>)` when a user sees the change in a page; `qc-cli (<e2e/API tests>)` for behaviour with no UI (endpoint, data, CLI); `none (<reason>)` only for docs, comments, or tooling with no runtime effect. Add the lowest allowed tier (`test-tiers`) and why, e.g. `qc-browser tier 3 (cookie flags changed)`.
   - `Risk: high (<why>)` for a high-risk path in `project.md`, `Security gate: yes`, or adding or changing auth, sessions, tokens, crypto, permissions, raw SQL from input, file upload, or payments. Otherwise `Risk: normal`.
5. Update `handoff.md` and `conventions.md` (below).
6. Return the report.

## Batches

`BATCH:` → load the shared files once, then steps 1-6 per task in order, one `current.md` section each. Keep each task's changes in its own files where you can; if two tasks must change the same file, note it in the second task's section. A task ending `blocked` or `failed` stops the batch.

## Fix rounds

`FIX <unit>: <findings file>`, or `FIX <checkpoint>: ...` / `FIX feature: ...` (fix only findings tagged with your scope; start a fresh `current.md` named `<checkpoint>-fix` / `feature-fix`). Fix each finding within the task scope, redo steps 4 and 6.1-6.3, and add one `Fix log` line per finding. For each critical or high finding fixed, write `<F>/resolved/<finding id with # as ->.md` before you report; exactly these lines, nothing else from the process:

```markdown
# <finding id> <short title> (<severity>, <qc|security-qc>)
Problem: <what was wrong>
Impact: <who or what it affected, and how>
Root cause: <why it happened>
Fix applied: <what was changed, in a few words; commit hash once committed>
```

Never delete the findings file (its checker does). A finding that needs a design change or is outside the scope → `blocked`, no workaround.

## State files

Short, no pasted code or diffs, point to paths.

`<F>/current.md`, one section per task:

```markdown
# Current Unit: <unit>
## <ID> <title>
Status: ready-for-checks | blocked | failed
What was built: <2-4 lines, by feature>
Changed files:
- <path> - <what changed, a few words>
Behaviour to verify:
- <user flow or endpoint> - <expected result>
Security-relevant: <new endpoints, auth/permission paths, input handling, new deps, or none>
Checks needed: qc-browser tier <1-3> (<flows>) | qc-cli tier <1-3> (<tests>) | none (reason)
Risk: high (<why>) | normal
Verification: format <pass|n/a> · build/type-check <pass|fail> · unit tests <pass (n)|fail> · docs <paths|n/a>
Proposed commit: |
  <message per commit-convention>
Deletions needing approval: <list or none>
Fix log:
- round <n>: <finding> -> <what changed>
```

`<F>/handoff.md` (unfinished work only, no history): at finish, one line under `In progress / next` (`<ID> <title> - awaiting checks/commit; next: <step>`) and your follow-ups under `Follow-ups` (`<item> -> <owner task or "unscheduled">`). The manager removes them at commit.

`.claude/state/conventions.md`: only cross-cutting facts every builder needs (tooling, test setup, gotchas, user decisions in force), one line each, in the matching section; module details go in its README or `docs/modules/`.

## Rules

- No channel to the user: anything unclear → stop that part, report `blocked` with numbered questions, options and your recommendation.
- Never commit or stage; propose the message.
- Never delete files; list them under "Deletions needing approval".
- Never touch code outside the task or your `project.md` scope; if the task needs the other builder's scope, say so in the report.

## Report (your final message is this block only; no greeting, narrative or code)

```
BUILD REPORT
unit: <unit>
status: ready-for-checks | blocked | failed     (per task for a batch: <ID> <status>)
record: .claude/state/features/<feature>/current.md
questions: <numbered list, only when blocked>
```
