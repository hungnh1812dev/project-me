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
| **3** | The `full stack` (built images, proxy, production build and settings) with its stack checks, and the e2e specs of the run: the test scope at a phase checkpoint, the full suite only in the feature's final run | What dev mode cannot show (below); every phase checkpoint (scoped run) and the feature's final run |

Tiers 2 and 3 start from a green tier 1.

**Tier 3 is required when the diff touches:** container, image, compose, infrastructure or proxy files; the env schema, config loading or a new startup config key; CORS, cookies and their flags, security headers, CSP, redirects; sessions or auth shared across apps or origins; deploy, migration or init entry points; production-only behavior; anything under `Tier 3 also when` in `project.md`.

## When each tier runs

| Check | Tiers |
|---|---|
| Phase checkpoint (one per phase, at its end) | the tiers its rows hold, lowest first; tier 3 is a scoped run |
| Feature checklist | the tiers its rows hold, lowest first; then the final run, once, after every other row is `pass` |
| One unit (builder's checks, per-unit security-qc review) | the lowest that can show it, 1 to 3 |

Checklist rows run grouped by tier, never row by row or checkpoint by checkpoint: each row runs only at the tier in its `Method`. Take the tiers present in the checklist (all its rows, whatever checkpoint they came from), lowest first; run every tier 1 row in **one** tier 1 run, then every tier 2 row in one tier 2 run, then every tier 3 row in one tier 3 run (one stack start each), qc first, then security-qc on the same stack. A tier no row holds is not run (rows only at T1 and T2 → tier 1 then tier 2, no tier 3). A failed row does not stop higher tiers; its fix is re-checked in a later run of its own tier (tier 3: "Tier 3 re-test rounds" below).

## Scoped runs and the final run

The full suite runs once per feature (ADR 0022).

- **Test scope:** the e2e specs the feature's diff (`<feature base>..HEAD`) can affect. qc works it out at each scoped run:
  1. changed modules: each changed file's module, from the module index in `project.md`;
  2. affected modules: the modules that import a changed module (the graph's `affected`), packages included;
  3. flows: every flow the module index names for a changed or affected module; a module with no flow adds the flows of its affected modules (all flows of an app: every spec of that app);
  4. specs: those that cover the flows or modules, plus every changed spec and every spec that imports a changed shared e2e file;
  5. a tier 3 area in the diff ("Tier 3 is required when", `Tier 3 also when`) adds every spec of the apps it serves (an app's image: that app; compose, proxy, stack scripts: every app).
  qc writes it under the checklist header (`checklist-runs`). No runtime file in the diff: the scope is empty and the scoped row passes with `Note` `scope empty: <reason>`.
- **Scoped run:** the tier 3 run of a phase checkpoint: a fresh `full stack` in kept mode with its stack checks but without the e2e suite, then the test scope with the `e2e single spec` command, then every other tier 3 row and the browser rows on that same kept stack.
- **Final run:** the one full suite run of a feature: a fresh `full stack` with its stack checks and the full e2e suite, run as the last check of the feature checklist, after every other row is `pass`, in the feature's last session. It never takes the result of a checkpoint run.

## Tier 3 re-test rounds

- **Gate run:** the first tier 3 run of a checklist: the scoped run of a phase checkpoint, the first tier 3 run of the feature checklist's other rows, or the final run.
- **Re-test round:** each later tier 3 run of the same checklist after a fix (`RECHECK tier=3`). The gate run's stack stays up between rounds; a stack that died is started fresh. qc takes the **fix kind** of the fix commits since the last green round, the first that fits:

| Fix kind | The fix commits change | Re-test round |
|---|---|---|
| `stack` | anything in "Tier 3 is required when" above or `Tier 3 also when` in `project.md` | a fresh run, as the gate run |
| `app` | product code of one or more apps or packages, nothing of `stack` | a fresh run; once `project.md` has an `in-place rebuild` command: rebuild and recreate only the changed apps on the kept stack, then the run's suite on it with the `e2e single spec` command |
| `test-only` | only the e2e test package | the **retry set** on the kept stack with the `e2e single spec` command: the failed specs plus every spec that imports a changed shared e2e file (outside the spec files); no rebuild, no restart |

- **The run's suite** of a re-test round, for a scoped run and the final run alike: the failed specs plus the test scope of the fix commits (rules above, on `<last green run>..HEAD`). The gate run's scope and the full suite are never run a second time.
- qc writes the fix kind and what it ran in the row `Note`: `retry set: <specs>`, `in-place: <apps>, <suite>` or `fresh, <suite>`.
- **Flaky failure:** a spec failure that does not come back in 2 unchanged reruns of that spec on the same stack. qc records it as a flaky finding (qc owns the spec); the scoped or final row passes with `Note` `flaky: <spec>, finding <id>`. Every flaky finding is fixed, and its spec green on a fresh run, before the feature close.
- **Shared with the feature checklist:** when the feature checklist starts on the same commit as the last phase checkpoint's green scoped run (no commit between), its other tier 3 rows may run on that kept stack (`Note` `same HEAD <hash> as checkpoint <id>`). The final run is always fresh.
- Coverage: each checkpoint shows its scope green in its gate run and each fix's scope green on the images of that fix; the feature shows every spec and every stack check green on a fresh stack in its final run; fixes after the final run are re-checked on their own scope. A regression outside a checkpoint's scope is found at the final run.

## One stack per tier 3 run

The stack build takes minutes; the e2e run takes most of a tier 3 run. Start the full stack once per tier 3 run and reuse it for everything on the same commit.
- **Start:** kept mode without the e2e suite (`project.md`); the full suite only in the final run.
- **Reuse:** before a start, check that the stack runs (`project.md` running check). Reuse it when the `Stack:` line of `handoff.md` (or the `Notes` of the job) names the current `HEAD` and no runtime file changed since (`git status`, `git diff --name-only <its HEAD>..HEAD`); otherwise stop it and start fresh (a re-test round: its fix kind).
- **Record:** who starts, reuses or stops it reports `stack: up <url> HEAD <hash>` or `stack: down`; the manager keeps it as `Stack: up, HEAD <hash>` / `Stack: down` in `handoff.md` `## In progress / next`.
- **Session break:** the stack stays up; the next session reuses it by its `Stack:` line.

## Who does what

- **Builder:** writes the unit's tier and reason in `Checks needed` (`worker-flow`). Never starts the full stack: tier 1 and the dev stack only; a fix only tier 3 shows is proven by qc's re-test round.
- **qc:** the only one that starts the full stack for a checklist run; stops it when its run and security-qc's are done, keeps it up between tier 3 re-test rounds, works out the test scope of each scoped run and picks each round's fix kind. It may add a higher-tier row when the diff touches a tier 3 area; it never lowers a row's tier.
- **security-qc:** never starts or stops a stack. Tier 1: static review. Tier 2: authz, object access, input validation and error bodies on the dev stack. Tier 3: headers, CSP, cookies, CORS, redirects, proxy routing, production-only behavior. A tier 3 item checked while only a lower tier runs is reported `not verified dynamically (needs tier 3)`, never passed.
- **Manager:** runs checklists tier by tier, has qc keep the stack up when security-qc has rows at that tier, stops it after both (a tier 3 stack stays up while a failed row waits for its re-test round). Never starts the full stack for a checklist run; starts it (kept mode without e2e, or reuses a running one) only for a per-unit security-qc review or a `needs tier 3` recheck.

## Missing commands

From `project.md` `Commands:`. When one is missing:
- No `integration test`: tier 1 is the unit tests.
- No `dev stack`: tier 2 runs on the `full stack`; say so in the report. If this keeps happening, the manager suggests a dev-stack task.
- No `full stack`: tier 3 runs the local production build if `project.md` has a command for it; otherwise `blocked`.
- No e2e runner: tiers 2 and 3 are manual or CLI checks; the report says so.
- No module index or no code graph: the test scope is every spec of each app the diff touches; the report says so.
