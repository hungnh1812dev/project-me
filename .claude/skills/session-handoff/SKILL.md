---
name: session-handoff
description: How the single worker's context is cleaned without losing progress - the 150k-token threshold, the handoff file format, and the reset sequence between manager and worker. Use when a worker finishes a task, when the manager checks worker token usage, or when a fresh worker resumes.
---

# Session Handoff

Goal: one worker for the whole project, kept cheap. Reuse it across tasks. Reset its context only when it is over **150k tokens**, and only **between** tasks.

## Two files

- `.claude/state/handoff.md`: **current state only**, read in full by a fresh worker at start. Hard cap: about 40 lines / 3 KB.
- `.claude/state/conventions.md`: stable project knowledge (stack facts, file layout, user decisions by area, gotchas). A fresh worker does **not** read it at start. It greps or reads only the section for the area its task touches, when it needs it.

### handoff.md format

```markdown
# Worker Handoff
Updated: <YYYY-MM-DD> after <task ID>

## Done
- <ID> <title> - <commit hash>   (one line each, no detail)

## In progress / next
- <ID> <state, exact next step>
- open questions still provisional (one line each)

## Follow-ups
- <item> -> <task that owns it>
```

### conventions.md

Grouped by area (tooling, cms-api config, content engine, Prisma/identity, frontends, Docker/smoke, user decisions, gotchas). Add new stable facts to the right section after each task; remove anything no longer true.

Rules for both: no code or diffs, point to file paths. If a fact will matter only for one area, it goes in conventions.md, not handoff.md.

## Reset sequence

| Step | Who | Action |
|---|---|---|
| 1 | worker | Finishes the current task, updates handoff, reports `session_tokens` |
| 2 | manager | Takes the higher of the reported usage and the worker's estimate. If ≤ 150k, sends the next task to the same worker. Stop here. |
| 3 | manager | If > 150k, sends `CLEAN: write handoff and stop` |
| 4 | worker | Makes sure handoff is complete, replies `HANDOFF WRITTEN`, stops |
| 5 | manager | Stops the old instance, then starts one fresh `worker` with the same name: `Resume from .claude/state/handoff.md, then do:` + next task brief. The brief quotes the SPEC excerpts the task needs (or names exact § numbers), so the worker doesn't read the whole SPEC. |
| 6 | manager | Notes the reset on the board |

Never reset in the middle of a task. Never run two workers at once.
