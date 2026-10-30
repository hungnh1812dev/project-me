---
name: session-handoff
description: The shared state files that carry knowledge between per-task agents - project profile, feature map, and each feature's folder (board, handoff, current unit record, findings, resolved issues, summary) plus conventions and archive - with their formats, size limits, and who writes, reads, clears and deletes each one. Use when the manager sets up a project, opens or closes a feature, dispatches, closes a task or a phase, or when the user answers a question.
---

# Session Handoff

Every unit (task or batch) gets fresh agents, and the manager's message is only the task ID. Agents learn what to do from the files below. Nothing else carries over, so anything an agent needs must be written down here. All files live in `.claude/state/`. Rules for all: short, no pasted code or diffs, point to file paths.

**One feature at a time.** A feature is one concrete function of the product (login, signup, ...), holding one or more phases of tasks. Only one feature is `in-progress`; its working files live in `features/<feature>/`. Every agent finds that folder from the `in-progress` row of `features.md`. Below, `<F>` means that folder.

**Live files hold only what is still open.** Finished work leaves them: git holds the code history, module READMEs and `docs/` hold the module details, a closed feature keeps only its `SUMMARY.md`, and `archive/` holds stale conventions. No agent reads `archive/` or another feature's `SUMMARY.md` at start; grep them only when needed.

## Layout

```
.claude/state/
  project.md
  features.md
  conventions.md
  archive/conventions-archive.md
  features/<feature>/
    board.md  handoff.md  current.md  qc-issues-handoff.md
    findings/           open findings only
    resolved/           one record per fixed critical/high finding
    SUMMARY.md          written at close; after the user approves, the only file left
```

Spec, task files, phases file, design docs, ADRs and e2e tests live where `project.md` says, outside `.claude/state/`. They are never part of a feature folder and are never deleted at close.

## Files

| File | Written by | Read by | Limit | Cleared / deleted |
|---|---|---|---|---|
| `project.md` | manager, with the user | every agent, in full, at start | one line per item | never |
| `features.md` | manager | every agent (the `in-progress` row); manager in full | one row per feature | never; a closed feature's row stays as `done` |
| `conventions.md` | builders | grep the needed section only | ~10 KB | stale or module-only facts move to `archive/conventions-archive.md` |
| `<F>/board.md` | manager | builders (grep the task's row); manager | the feature only | deleted at feature close |
| `<F>/handoff.md` | builders; manager adds user answers | builders and planner, in full, at start | ~3 KB | a task's lines are removed when it is committed with all checks passed; the file is deleted at feature close |
| `<F>/current.md` | builder of the unit (format in `worker-flow`) | checkers, manager | one unit | manager resets after the unit's last commit; deleted at feature close |
| `<F>/qc-issues-handoff.md` | qc, security-qc (own section) | manager, checkers | - | deleted at feature close (no `open` entry may be left) |
| `<F>/findings/<unit, phase or feature>-<qc or security>.md` | the checker that failed | builder in a fix round | - | **that checker deletes it when its re-check passes** |
| `<F>/resolved/<finding id>.md` | builder fixing a critical/high finding | manager at close | ~6 lines | deleted at feature close, after `SUMMARY.md` takes its row |
| `<F>/SUMMARY.md` | manager at close | anyone, on demand | as short as possible | never |
| `archive/*.md` | manager | nobody at start; grep on demand | - | never |

## project.md (project profile)

Created once per project by the manager, with the user. Every value comes from the user or the repo; never guess. One line per item.

```markdown
# Project Profile
Tasks: <file holding each task's acceptance/verify/files, and how to find one by ID>
Phases: <file holding the feature list and build order, and each phase's goal/inputs/outputs/exit criteria>
Spec: <path, or none>
Scopes:
- core-builder: <paths>
- ui-builder: <paths>
- qc: <e2e test dir>
High-risk paths: <paths where any change gets a security review before commit>
Stack: <one line per scope>
Commands:
- install / build / type-check / unit test / integration test / format / dependency audit / run app: <command each, or n/a>
- dev stack (tier 2, `test-tiers`): <start / stop command and the URLs it serves, or n/a>
- full stack (tier 3): <start, kept-mode start, stop command and URLs, or n/a>
- e2e single spec: <command against a running stack, or n/a>
Tier 3 also when: <project paths or areas that need the full stack beyond the defaults in `test-tiers`, or none>
E2E tests: <dir and runner, or none>
Docs to keep current: <READMEs, API docs, ADR dir, env example file>
Security rules: <docs with this project's authz / audit / data rules, or none>
```

## features.md (feature map)

```markdown
# Features
Order: <phases file § where the planner wrote the build order>
Decisions: <project-wide user decisions, one line>
Open risks: <project-wide, one line>

| # | Feature | Status | Folder | Apps / packages | Base | Summary |
|---|---|---|---|---|---|---|
| 1 | signup | done | features/signup/ | apps/cms-api, apps/web | <hash> | features/signup/SUMMARY.md |
| 2 | login | in-progress | features/login/ | apps/cms-api, apps/web | <hash> | - |
| 3 | profile | todo | - | apps/web | - | - |

## Follow-ups
- <new work left over from a closed feature, one line> -> <feature it belongs to, or unscheduled>
```

`#` is the planner's root-to-leaf order. Status: `todo` → `in-progress` → `done`. At most one row is `in-progress`.

## board.md (per feature)

```markdown
# Board - <feature>
Source: <task file> · Phases: <phases file §> · Base: <hash>
Feature checks: qc <pending|pass|n/a> · security <pending|pass|n/a>
Decisions: <open or feature-wide decisions, one line>
Open risks: <one line>

## Phase <n>: <name>
Base: <hash> · Phase checks: qc <pending|pass> · security <pending|pass> · Checkpoint: <pending|passed date>

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- <ID>: <what was built, one line>

## Notes
- <only items still open; at most ~10 lines>
```

No log. Events worth keeping go into a commit message, `handoff.md` (while open), `resolved/` (critical/high findings), or `conventions.md` (if lasting).

## handoff.md (per feature)

```markdown
# Handoff - <feature>
Updated: <YYYY-MM-DD> after <task ID>

## In progress / next
- <ID> <title> - <state, exact next step>
- <ID> user answers: <one line each>

## Direct requests
### DR<n> <title>
<the request-validator's brief, verbatim: goal, acceptance, verify, files>

## Follow-ups
- <item> -> <owner task, or unscheduled>
```

`Direct requests` holds the task entries for requests the request-validator routed straight to a builder (no planner task file). They join the in-progress feature. The manager writes each brief before dispatch and removes it when the task is committed, like the task's other lines.

Only unfinished work: tasks not yet committed or with checks pending, user answers for those tasks, and open follow-ups. No `Done` list (the board and git have it).

## conventions.md

Cross-cutting knowledge every builder may need, one line per fact, grouped under: Tooling, Testing & smoke, Frontend, Backend, User decisions in force, Gotchas. Module structure and API details belong in the module's README / `docs/modules/`, not here.

## Findings files

`<F>/findings/<unit>-qc.md` or `<unit>-security.md` for a unit; `<phase>-qc.md` or `<phase>-security.md` for the end-of-phase checks; `feature-qc.md` or `feature-security.md` for the end-of-feature checks; `audit-<YYYY-MM-DD>-qc.md` for an audit. Written only when a check fails, overwritten on each failed re-check. Each finding: id (`<file stem>#<n>`), severity, scope that owns the fix (`core-builder` / `ui-builder`), what is wrong, where (`file:line`), repro or evidence, suggested fix. When the re-check passes, the checker that wrote it deletes it, so later agents never read resolved issues.

A finding is fixed only when the checker that raised it re-checks and no longer reports it. Nobody waives a finding.

## resolved/ (per feature)

One file per fixed `critical` or `high` finding, written by the builder in the fix round, before the re-check. Name: the finding id with `#` replaced by `-`. Exactly these lines, one each; nothing else from the process:

```markdown
# <finding id> <short title> (<severity>, <qc|security-qc>)
Problem: <what was wrong>
Impact: <who or what it affected, and how>
Root cause: <why it happened>
Fix applied: <what was changed, in a few words; commit hash once committed>
```

## SUMMARY.md (per feature, written at close)

As short as possible without dropping a main point.

```markdown
# <Feature>
Done: <YYYY-MM-DD> · Commits: <base>..<head> · Apps / packages: <list>

## Overview
<2-4 lines: what the feature does for the user>

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|

## Structure
<tree of added and changed paths from `git diff --name-only <base>..HEAD`, grouped by app/package; a folder whose files are all new is shown once>

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
<one row per resolved/ record, or "None">
```

## Who does what

| When | Who | Action |
|---|---|---|
| New project | manager | Creates `project.md` with the user, plus an empty `features.md` |
| Plan done | manager | Adds the planner's features to `features.md` (in its order, `todo`) |
| Feature opens | manager | Creates `<F>/` with empty board, handoff, `current.md`; sets the row `in-progress`; writes `Base: <HEAD hash>` in the row and the board |
| Phase starts | manager | Writes `Base: <HEAD hash>` under the phase heading on the board |
| Before dispatch | manager | Sets the board row to `in-progress`; makes sure every decision the task needs is in handoff.md or conventions.md |
| Unit finished | builder | Completes `current.md`; adds its line and follow-ups to handoff.md; adds cross-cutting facts to conventions.md |
| Critical/high finding fixed | builder | Writes its `resolved/` record before reporting `ready-for-checks` |
| User answers a question | manager | Writes the answers under `In progress / next` before resuming the agent |
| Check passes | checker | Deletes its own findings file for the unit, if one exists |
| Commit made | manager | Records the hash on the board; adds the task's `## Built` line; moves lasting user answers to conventions.md "User decisions in force" (one line each); **removes the task's lines from handoff.md**; after the unit's last commit, resets `current.md` |
| Phase ends | manager | Runs qc `REGRESSION` then security-qc `PHASE`; writes the results under the phase heading; on checkpoint pass writes `Checkpoint: passed <date>` |
| Feature ends | manager | Runs qc then security-qc `FEATURE` (when it has more than one phase); checks the definition of done; writes `SUMMARY.md`; asks the user once, then deletes every other file in `<F>/`; sets the row `done` |
| handoff.md over ~3 KB or conventions.md over ~10 KB | manager | Trims: closed items out of handoff; module-only or stale facts from conventions into the archive |
