---
name: test-tiers
description: How much runtime testing a unit or checklist needs - tier 0 unit tests of one small checkpoint's changes, tier 1 unit + integration, tier 2 e2e against the apps in dev mode, tier 3 the full production-like stack - when each tier runs, who starts which stack, the checklist format, and the agent-local env file `.localEnv.agent`. Project-agnostic; the commands come from `.claude/state/project.md`. Preloaded by the manager, planner, builders, qc and security-qc.
---

# Test Tiers

The full stack is slow to build and start. Use the lowest tier that can show the change.

## The tiers

| Tier | What runs | Enough for |
|---|---|---|
| **0** | Only the unit tests covering the files one small checkpoint's tasks changed (`unit test` narrowed to those packages and test files). No integration tests, no stack | A small checkpoint, nothing else |
| **1** | The `unit test` and `integration test` commands. No stack | A behavior-preserving change (refactor, move, internal logic) with no change to a user flow, page or API response |
| **2** | e2e single specs against the apps in dev mode (`dev stack`: backing services from ready images, no image build). For UI, qc also walks the changed screens with Chrome DevTools MCP | A changed user flow, page, endpoint or API response |
| **3** | The `full stack` (built images, proxy, production build and settings) and the full e2e suite | What dev mode cannot show (below); every phase checkpoint and feature checklist |

Tiers 2 and 3 start from a green tier 1.

**Tier 3 is required when the diff touches:** container, image, compose, infrastructure or proxy files; the env schema, config loading or a new startup config key; CORS, cookies and their flags, security headers, CSP, redirects; sessions or auth shared across apps or origins; deploy, migration or init entry points; production-only behavior; anything under `Tier 3 also when` in `project.md`.

## When each tier runs

| Check | Tiers |
|---|---|
| Small checkpoint (any but the last checkpoint of a phase with several) | 0 only |
| Phase checkpoint (the last or only checkpoint of a phase) | 1 → 2 → 3 |
| Feature checklist | 1 → 2 → 3 |
| One unit (builder's checks, per-unit security-qc review) | the lowest that can show it, 1 to 3 |

Checklist rows run grouped by tier: every row of a tier in **one** run of that tier (one stack start), qc first, then security-qc on the same stack. A tier with no rows is skipped. A failed row does not stop higher tiers; its fix is re-checked in a later run of its own tier.

## Who does what

- **Builder:** writes the unit's tier and reason in `Checks needed` (`worker-flow`).
- **qc:** starts and stops the stack for its checklist runs. It may add a higher-tier row when the diff touches a tier 3 area; it never lowers a row's tier.
- **security-qc:** never starts or stops a stack. Tier 0/1: static review. Tier 2: authz, object access, input validation and error bodies on the dev stack. Tier 3: headers, CSP, cookies, CORS, redirects, proxy routing, production-only behavior. A tier 3 item checked while only a lower tier runs is reported `not verified dynamically (needs tier 3)`, never passed.
- **Manager:** runs checklists tier by tier, has qc keep the stack up when security-qc has rows at that tier, stops it after both, and starts the stack for a per-unit security-qc review or a `needs tier 3` recheck.

## Checklists

One format for the planner's table under each checkpoint in the phases file, the merged copy `<F>/checklists/<checkpoint>.md`, and the feature's `<F>/CHECKLIST.md` (`<F>` = `.claude/state/features/<feature>/`, the `in-progress` row of `.claude/state/features.md`).

```markdown
# Checklist - <checkpoint | feature>
Base: <hash> · Updated: <YYYY-MM-DD> after <CHECKLIST | CHECK tier=<n> | RECHECK tier=<n>>

| ID | Description | Input | Expected output | Checker | Method | Source | Status | Note |
|---|---|---|---|---|---|---|---|---|
| CLG-1 | Init container uses DB keys only | LG-db-1 | `docker compose ... config cms-api-init` lists only `NODE_ENV`, `DB_*` | qc | T3 cli | planner | pass | - |
```

- `Checker`: `qc`, `security-qc`, or `both` only when the row needs both. `Method`: `T<0-3> <cli | browser | static>`, the lowest tier that can show the row. `Source`: `planner`, `qc` or `security-qc`. `Status`: `todo`, `pass`, `failed`, `blocked`. `Note`: one short line (evidence, finding id, or the missing value).
- **Small checkpoint:** only `T0` rows, from the planner and qc. **Phase checkpoint:** its own rows plus the phase's small-checkpoint rows (as `T1`, reset to `todo`); always the full e2e suite at tier 3 (qc) and the phase diff review (security-qc). **Feature:** the phase checklists merged (repeats removed, all reset to `todo`), run again in full; with one phase, a copy of its phase checklist.
- Order: planner writes → qc copies, merges, adds its rows → security-qc adds its rows (not for small checkpoints) → tier runs.
- Each checker writes `Status` and `Note` of its own rows only (both parts of a `both` row; it passes only when both do). No row is ever deleted; one that no longer applies keeps a `Note` saying why and still needs `pass`.
- Done = every row `pass`.

## Missing commands

From `project.md` `Commands:`. When one is missing:
- No `integration test`: tier 1 is the unit tests.
- No `dev stack`: tier 2 runs on the `full stack`; say so in the report. If this keeps happening, the manager suggests a dev-stack task.
- No `full stack`: tier 3 runs the local production build if `project.md` has a command for it; otherwise `blocked`.
- No e2e runner: tiers 2 and 3 are manual or CLI checks; the report says so.

## Env files and `.localEnv.agent`

No agent reads or writes `.env*` files (except `.env.example`). Local dev values go in `.localEnv.agent` at the repo root:
- dev-only throwaway values (generated secrets, local URLs, test keys); real secrets and production values come from the user;
- before creating it: `git check-ignore -q .localEnv.agent` succeeds and any `.dockerignore` (or image build ignore file) lists it; otherwise a builder adds the ignore lines and records it, qc and security-qc report `blocked`;
- never `git add` it, copy it into an image, or print its values;
- key names only go in the matching `.env.example`;
- builders and qc create, read and edit it, and add missing dev-only values there without asking the user; security-qc only reads it and reports a finding if it is tracked or holds a value that looks real.
