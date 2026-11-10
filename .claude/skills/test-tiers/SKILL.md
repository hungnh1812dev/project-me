---
name: test-tiers
description: How much runtime testing a unit or checklist needs - tier 1 unit + integration, tier 2 e2e against the apps in dev mode, tier 3 the full production-like stack - when each tier runs and who starts which stack. Project-agnostic; the commands come from `.agent-state/project.md`. Preloaded by the manager, planner, builders, qc and security-qc. Checklist format, access preflight and progress file - `checklist-runs`; `.localEnv.agent` and git in scratch copies - `local-env`.
---

# Test Tiers

The full stack is slow to build and start. Use the lowest tier that can show the change.

## The tiers

| Tier | What runs | Enough for |
|---|---|---|
| **1** | The `unit test` and `integration test` commands. No stack | A behavior-preserving change (refactor, move, internal logic) with no change to a user flow, page or API response |
| **2** | e2e single specs against the apps in dev mode (`dev stack`: backing services from ready images, no image build). For UI, qc also walks the changed screens with Chrome DevTools MCP | A changed user flow, page, endpoint or API response |
| **3** | The `full stack` (built images, proxy, production build and settings) and the full e2e suite | What dev mode cannot show (below); every phase checkpoint and feature checklist |

Tiers 2 and 3 start from a green tier 1.

**Tier 3 is required when the diff touches:** container, image, compose, infrastructure or proxy files; the env schema, config loading or a new startup config key; CORS, cookies and their flags, security headers, CSP, redirects; sessions or auth shared across apps or origins; deploy, migration or init entry points; production-only behavior; anything under `Tier 3 also when` in `project.md`.

## When each tier runs

| Check | Tiers |
|---|---|
| Phase checkpoint (one per phase, at its end) | the tiers its rows hold, lowest first |
| Feature checklist | the tiers its rows hold, lowest first |
| One unit (builder's checks, per-unit security-qc review) | the lowest that can show it, 1 to 3 |

Checklist rows run grouped by tier, never row by row or checkpoint by checkpoint: each row runs only at the tier in its `Method`. Take the tiers present in the checklist (all its rows, whatever checkpoint they came from), lowest first; run every tier 1 row in **one** tier 1 run, then every tier 2 row in one tier 2 run, then every tier 3 row in one tier 3 run (one stack start each), qc first, then security-qc on the same stack. A tier no row holds is not run (rows only at T1 and T2 → tier 1 then tier 2, no tier 3). A failed row does not stop higher tiers; its fix is re-checked in a later run of its own tier.

## Who does what

- **Builder:** writes the unit's tier and reason in `Checks needed` (`worker-flow`).
- **qc:** starts and stops the stack for its checklist runs. It may add a higher-tier row when the diff touches a tier 3 area; it never lowers a row's tier.
- **security-qc:** never starts or stops a stack. Tier 1: static review. Tier 2: authz, object access, input validation and error bodies on the dev stack. Tier 3: headers, CSP, cookies, CORS, redirects, proxy routing, production-only behavior. A tier 3 item checked while only a lower tier runs is reported `not verified dynamically (needs tier 3)`, never passed.
- **Manager:** runs checklists tier by tier, has qc keep the stack up when security-qc has rows at that tier, stops it after both, and starts the stack for a per-unit security-qc review or a `needs tier 3` recheck.

## Missing commands

From `project.md` `Commands:`. When one is missing:
- No `integration test`: tier 1 is the unit tests.
- No `dev stack`: tier 2 runs on the `full stack`; say so in the report. If this keeps happening, the manager suggests a dev-stack task.
- No `full stack`: tier 3 runs the local production build if `project.md` has a command for it; otherwise `blocked`.
- No e2e runner: tiers 2 and 3 are manual or CLI checks; the report says so.
