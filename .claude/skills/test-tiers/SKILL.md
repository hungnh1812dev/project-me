---
name: test-tiers
description: How much runtime testing a unit or checklist needs - tier 0 unit tests of one small checkpoint's changes, tier 1 unit + integration, tier 2 e2e against the apps in dev mode, tier 3 the full production-like stack - who picks the tier, who starts which stack, and the agent-local env file `.localEnv.agent`. Project-agnostic; the commands come from `.claude/state/project.md`. Preloaded by the builders, qc, security-qc and the manager.
---

# Test Tiers

A full production-like stack (images, containers, proxy) is slow to build and start. Most units do not need it. Pick the lowest tier that can show the change working.

## The tiers

| Tier | What runs | Enough for |
|---|---|---|
| **0** | Only the unit tests that cover the files changed by one small checkpoint's tasks (the `unit test` command from `project.md`, narrowed to those packages and test files). No integration tests, no stack | A small checkpoint inside a phase, and nothing else (see "When each tier runs") |
| **1** | The unit and integration test commands from `project.md` | Every unit runs it. Enough alone for a behavior-preserving change (refactor, file moves, internal logic) with no change to a user flow, page or API response |
| **2** | e2e against the apps in dev mode, with only the backing services they need (database, mail sink) from ready images, no image build. Single specs, not the whole suite. When there is UI to check, qc also walks the changed screens with Chrome DevTools MCP | A changed user flow, page, endpoint or API response |
| **3** | The full production-like stack from `project.md` (built images, proxy, production build and settings), plus the full e2e suite | Only what dev mode cannot show (list below), and every phase checkpoint and feature check |

Each tier includes the ones below it: tier 2 and 3 start from a green tier 1.

## When each tier runs

| Check | Tiers |
|---|---|
| Small checkpoint: any checkpoint of a phase except its last, in a phase with more than one checkpoint | tier 0 only |
| Phase checkpoint: the last (or only) checkpoint of a phase | tier 1 → 2 → 3 |
| Feature checklist | tier 1 → 2 → 3 |
| A single unit (builder's own checks, per-unit security-qc review) | the lowest tier that can show it, 1 to 3 |

A phase with only one checkpoint has no tier 0 run.

**Checklist runs.** Each checklist row names its tier (`Method`, `session-handoff` "Checklists"). The rows run grouped by tier, in order 1 → 2 → 3 (tier 0 alone at a small checkpoint): every row of a tier is checked in **one** run of that tier (one stack start), qc first, then security-qc on the same stack. A tier with no rows is skipped. A failed row does not stop the higher tiers; its fix is re-checked in a later run of its own tier.

**Tier 3 is required when the diff touches any of:**
- container or image files, orchestration or compose files, infrastructure or proxy config;
- the env schema, config loading, or a new config key read at startup;
- CORS, cookies and their flags, security headers, CSP, redirects;
- sessions or auth shared across apps or origins;
- deploy, migration or init entry points;
- behavior that exists only in a production build or production mode;
- anything listed under `Tier 3 also when` in `project.md`.

## Who does what

- **Builder** writes the tier and its reason in `Checks needed` (`worker-flow`), e.g. `qc-cli tier 1 (behavior-preserving move; integration suite)`. Lowest tier the rules allow.
- **qc** runs that tier. It may raise the tier when the diff touches a tier 3 area the builder did not count, saying why; it never lowers it. qc starts and stops the stack for its tier.
- **security-qc** never starts or stops a stack. Tier 1: static review. Tier 2: dynamic checks of authz, object access, input validation and error bodies on the dev stack. Tier 3: headers, CSP, cookies, CORS, redirects, proxy routing and production-only behavior on the full stack. If the diff touches a tier 3 area and only a lower tier is running, it reviews those items statically and reports them as `not verified dynamically (needs tier 3)`, never as passed.
- **Manager** runs checklists tier by tier (above), asks qc to keep its stack running when security-qc has rows at that tier, stops it after both, and starts the stack for a per-unit security-qc review or a recheck that reported `needs tier 3`. The phase checkpoint and the feature checklist always hold the full e2e suite at tier 3.

## Commands and fallbacks

The commands live in `project.md` (`Commands:`): `unit test`, `integration test`, `dev stack`, `full stack`, `e2e single spec`, and the optional `Tier 3 also when` list. When one is missing:

- No `integration test`: tier 1 is the unit tests.
- No `dev stack`: tier 2 runs on the `full stack`; say so in the report. A manager seeing this repeatedly suggests a dev-stack task to the user.
- No `full stack`: tier 3 runs the production build locally if `project.md` has a command for it; otherwise report `blocked` (the user decides).
- No e2e runner at all: tier 2 and 3 are the manual or CLI checks of the flows, and the report says no e2e exists.

## Agent-local env: `.localEnv.agent`

Agents never read or write `.env*` files (except `.env.example`). When a dev server or script needs local values, they go in `.localEnv.agent` at the repo root.

- Dev-only throwaway values (generated secrets, local URLs, test keys). Real secrets and production values always come from the user.
- Before creating it, check that it is ignored: `git check-ignore -q .localEnv.agent` succeeds, and, if the repo has a `.dockerignore` (or any image build context ignore file), it lists `.localEnv.agent`. If not, a builder adds the missing ignore lines and records it in the unit record; qc and security-qc report `blocked` instead.
- Never `git add` it, never copy it into an image, never print its values in reports or logs.
- Key names it needs are documented, names only, in the matching `.env.example`.
- Builders and qc may create, read and edit it; a missing dev-only value is added there, never asked of the user; security-qc may read it, and reports a finding if it is tracked by git or holds a value that looks like a real secret.
