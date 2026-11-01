---
name: session-handoff
description: The manager's reference for the shared state files - project profile, feature map, conventions, archive, and each feature's folder (board, handoff, current unit record, checklists, findings, resolved issues, summary) - with their formats, size limits, and who writes, reads, clears and deletes each one. Use when the manager sets up a project, opens or closes a feature, dispatches, closes a task or a phase, or when the user answers a question.
---

# Session Handoff

Each unit gets fresh agents and a dispatch of only its ID; agents learn everything else from these files, so whatever an agent needs must be written here. Everything is in `.claude/state/`: short, no pasted code or diffs, point to paths.

Live files hold only what is still open. Code history is in git, module details in READMEs and `docs/`, stale conventions in `archive/`; a closed feature keeps only `SUMMARY.md` and `CHECKLIST.md`. Nobody reads `archive/` or another feature's summary at start; grep them when needed.

## Layout

```
.claude/state/
  project.md  features.md  conventions.md  conventions-<area>.md  archive/conventions-archive.md
  features/<feature>/            = <F>, the folder of the in-progress row of features.md
    board.md  handoff.md  current.md  qc-issues-handoff.md  qc-progress.md
    checklists/<checkpoint>.md   findings/   resolved/
    CHECKLIST.md  SUMMARY.md     kept after close
```

Module docs (`docs/modules/`) and the generated root index `MODULES.md` are the long-term map of the code; builders keep them current in every task (`worker-flow`). Spec, task and phases files, design docs, ADRs and e2e tests live where `project.md` says; they are never in `<F>` and never deleted at close.

## Files

| File | Written by | Read by | Limit | Cleared / deleted |
|---|---|---|---|---|
| `project.md` | manager, with the user | all, in full, at start | one line per item | never |
| `features.md` | manager | all (the `in-progress` row); manager in full | one row per feature | never; closed rows stay `done` |
| `conventions.md`, `conventions-<area>.md` | builders | grep the needed section | ~10 KB each | stale or module-only facts → archive |
| `board.md` | manager | builders (task row), manager | - | at close |
| `handoff.md` | builders; manager adds user answers | builders, planner, in full | ~3 KB | a task's lines when it is committed; file at close |
| `current.md` | the unit's builder (format in `worker-flow`) | checkers, manager | one unit | manager resets after the unit's last commit; at close |
| `qc-issues-handoff.md` | qc, security-qc (own section) | manager, checkers | - | at close (no `open` entry left) |
| `qc-progress.md` | qc, security-qc (own line, format in `test-tiers`) | manager while a checker runs | one line per running checker | each checker removes its line at report; file at close |
| `checklists/<checkpoint>.md` | qc, security-qc (format in `test-tiers`) | manager (`Status`), checkers | - | at close |
| `CHECKLIST.md` | qc, security-qc; manager copies it for a one-phase feature | anyone | - | never |
| `findings/<unit, checkpoint, feature or audit>-<qc or security>.md` | the failing checker (format in its agent file) | builder in a fix round | - | by its checker when the re-check passes |
| `resolved/<finding id>.md` | builder fixing a critical/high finding (format in `worker-flow`) | manager at close | ~6 lines | at close, after `SUMMARY.md` takes its row |
| `SUMMARY.md` | manager at close | anyone | as short as possible | never |
| `archive/*.md` | manager | grep on demand | - | never |

Trim when over the limit: closed items out of `handoff.md`; module-only or stale facts from the conventions files into the archive.

## project.md (project profile)

Created once by the manager with the user, together with an empty `features.md`. Every value comes from the user or the repo; never guess.

```markdown
# Project Profile
Tasks: <file holding each task's acceptance/verify/files, and how to find one by ID>
Phases: <file holding the feature list and build order, and each phase's goal/inputs/outputs, checkpoints and checklists>
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

## features.md

```markdown
# Features
Order: <phases file § where the planner wrote the build order>
Decisions: <project-wide user decisions, one line>
Open risks: <project-wide, one line>

| # | Feature | Status | Folder | Apps / packages | Base | Summary |
|---|---|---|---|---|---|---|
| 1 | signup | done | features/signup/ | apps/api, apps/web | <hash> | features/signup/SUMMARY.md |
| 2 | login | in-progress | features/login/ | apps/api, apps/web | <hash> | - |
| 3 | profile | todo | - | apps/web | - | - |

## Follow-ups
- <new work left over from a closed feature, one line> -> <feature it belongs to, or unscheduled>
```

`#` is the planner's root-to-leaf order. Status `todo` → `in-progress` → `done`; at most one `in-progress`.

## board.md

```markdown
# Board - <feature>
Source: <task file> · Phases: <phases file §> · Base: <hash>
Feature checks: qc <pending|pass|n/a> · security <pending|pass|n/a> · Checklist: CHECKLIST.md
Decisions: <open or feature-wide decisions, one line>
Open risks: <one line>

## Phase <n>: <name>
Base: <hash> · Phase checks: qc <pending|pass> · security <pending|pass> · Checkpoint: <pending|passed date>
Checkpoints: <name> <pending|passed date> (checklists/<name>.md), ...

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

No log: lasting events go into commit messages, `handoff.md` (while open), `resolved/`, or `conventions.md`.

## handoff.md

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

Only unfinished work: uncommitted tasks or tasks with checks pending, their user answers (under `In progress / next`), direct-request briefs (written before dispatch, removed with the task's lines at commit), open follow-ups. No `Done` list.

## conventions.md

Facts every builder may need, one line each. `conventions.md`: cross-cutting (Tooling, Testing & smoke, User decisions in force, Gotchas), and its header names each `conventions-<area>.md` and the apps it covers. `conventions-<area>.md`: facts for one area, named by layer (`backend`, `frontend`, `mobile`, `infra`, ...), never by an app or package name (Testing, the area's rules, its user decisions). Module structure and API details go in the module's README or `docs/modules/`.

## resolved/

One file per fixed critical/high finding: `Problem`, `Impact`, `Root cause`, `Fix applied` (format in `worker-flow`). It feeds the summary's major-issues table.

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
