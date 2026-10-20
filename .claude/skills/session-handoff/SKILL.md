---
name: session-handoff
description: How the single worker's context is cleaned without losing progress - the 150k-token threshold, the handoff file format, and the reset sequence between manager and worker. Use when a worker finishes a task, when the manager checks worker token usage, or when a fresh worker resumes.
---

# Session Handoff

Goal: one worker for the whole project, kept cheap. Reuse it across tasks. Reset its context only when it is over **150k tokens**, and only **between** tasks.

## The handoff file: `.claude/state/handoff.md`

The worker keeps this current after every task. It must stay short (aim < 80 lines). It is a memory, not a log.

```markdown
# Worker Handoff
Updated: <YYYY-MM-DD> after <task ID>

## Project facts learned
- Stack, package manager, test / e2e / format commands that actually work
- Where config, tokens, routes, and the i18n module live

## Conventions confirmed by the user
- <decision> (task ID)

## Done
- <ID> <title> - <commit hash or "awaiting commit">

## In progress / next
- <ID> <state, exact next step>

## Gotchas
- <things that cost time and will again>
```

Remove anything that is no longer true. Don't paste code or diffs; point to file paths.

## Reset sequence

| Step | Who | Action |
|---|---|---|
| 1 | worker | Finishes the current task, updates handoff, reports `session_tokens` |
| 2 | manager | Takes the higher of the reported usage and the worker's estimate. If ≤ 150k, sends the next task to the same worker. Stop here. |
| 3 | manager | If > 150k, sends `CLEAN: write handoff and stop` |
| 4 | worker | Makes sure handoff is complete, replies `HANDOFF WRITTEN`, stops |
| 5 | manager | Stops the old instance, then starts one fresh `worker` with the same name: `Resume from .claude/state/handoff.md, then do:` + next task brief |
| 6 | manager | Notes the reset on the board |

Never reset in the middle of a task. Never run two workers at once.
