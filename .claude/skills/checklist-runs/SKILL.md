---
name: checklist-runs
description: The checklist format (phase checkpoints and the feature checklist), the access preflight qc and security-qc run before a tier 2 or 3 run, and the progress file they keep while a run goes on. Project-agnostic; tiers are in `test-tiers`. Preloaded by the planner, qc and security-qc.
---

# Checklist Runs

## Checklists

One format for the planner's table under each checkpoint in the phases file, the merged copy `<F>/checklists/<checkpoint>.md`, and the feature's `<F>/CHECKLIST.md` (`<F>` = `.agent-state/features/<feature>/`, the `in-progress` row of `.agent-state/features.md`).

```markdown
# Checklist - <checkpoint | feature>
Base: <hash> · Updated: <YYYY-MM-DD> after <CHECKLIST | CHECK tier=<n> | RECHECK tier=<n>>

| ID | Description | Input | Expected output | Checker | Method | Source | Status | Note |
|---|---|---|---|---|---|---|---|---|
| CLG-1 | Init container uses DB keys only | LG-db-1 | `docker compose ... config api-init` lists only `NODE_ENV`, `DB_*` | qc | T3 cli | planner | pass | - |
```

- `Checker`: `qc`, `security-qc`, or `both` only when the row needs both. `Method`: `T<1-3> <cli | browser | static>`, the lowest tier that can show the row. `Source`: `planner`, `qc` or `security-qc`. `Status`: `todo`, `pass`, `failed`, `blocked`. `Note`: one short line (evidence, finding id, or the missing value).
- **Phase checkpoint:** its own rows plus the rows of the phase's older checkpoints in an old plan (as `T1`, reset to `todo`); always the full e2e suite at tier 3 (qc) and the phase diff review (security-qc). **Feature:** the phase checklists merged (repeats removed); passed rows stay `pass` unless a later phase changed what they check (then `todo`); plus the cross-phase rows, the full e2e suite at tier 3 and the feature diff review; with one phase, a copy of its phase checklist.
- Order: planner writes → qc copies, merges, adds its rows → security-qc adds its rows → tier runs.
- Each checker writes `Status` and `Note` of its own rows only (both parts of a `both` row; it passes only when both do). No row is ever deleted; one that no longer applies keeps a `Note` saying why and still needs `pass`.
- Done = every row `pass`.

## Access preflight

A background checker cannot answer a permission prompt: a call outside the allowlist is denied and the round is lost. So before any tier 2 or 3 run (`CHECK`, `RECHECK`, a per-unit review, `AUDIT`), qc and security-qc work out what the run needs before the first row. Tier 1 runs skip it.

1. **List the needs** from the rows of the tier (on `RECHECK` also the findings and `Fix log`):
   - commands as permission patterns (`Bash(E2E_STACK=dev pnpm e2e:spec *)`, `Bash(curl -s http://localhost:8080/*)`) and MCP tools (`mcp__chrome-devtools__*`);
   - paths read or written outside your edit list;
   - `.localEnv.agent` keys by name (never values); real or external values only the user has;
   - the stack and URLs; any action that writes data on the stack (create, edit or delete content, sign-in attempts) or leaves localhost.
2. **Probe**, read-only, seconds only: the stack answers at its URL; each key exists in `.localEnv.agent` (`grep -c '^<KEY>='`); for browser rows `list_pages` answers.
3. **Decide.** Every pattern is in `permissions.allow` of `.claude/settings.json` or `.claude/settings.local.json`, no value is missing and every probe is green → run, no stop. Otherwise stop before the first row and report `status: preflight` with one `access:` line per need: `<pattern | key | probe> · <row IDs> · <allowed | needed | missing value | probe failed: <what>>`.
4. **Manager** asks the user (`manager.md` "Access preflight"), then `SendMessage`s the same checker: `GO` plus the refused lines; their rows go `blocked`, `Note` `access refused: <pattern>`.
5. **Missed need mid-run:** never retry a denied call. That row `blocked`, `Note` `access: <pattern>`; finish the other rows; list it under `access:`. The manager asks, then sends `RECHECK` for those rows only.

Name needs as command patterns, not one line per call: a short list the user can judge in one look.

## Progress file

During any run (checklist, recheck, audit, per-unit review), qc and security-qc keep one line each in `<F>/qc-progress.md` (header `# QC progress`):

`<agent name> | <command> <target> tier=<n> | <date +%H:%M> | rows <done>/<total> | <current step, a few words>`

- Write it at start, then at least every 25 minutes; each update must differ from the previous one (rows done or step). Remove your line when you return your report.
- The manager watches this file while a checker runs (`manager.md` "Progress file").
