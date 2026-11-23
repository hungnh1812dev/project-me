# Checklist - VTG-A
Base: d5435d40 · Updated: 2026-11-23 after CHECK tier=3
Test scope: d5435d40..a08ac46a · flows: none · specs: none (tests and docs only)

| ID | Description | Input | Expected output | Checker | Method | Source | Status | Note |
|---|---|---|---|---|---|---|---|---|
| CVTG-1 | Refusal guard walks the exported list, matches messages only, any case | VTG-1 | `Bff.errors.test.ts` has one case over every entry of `BFF_ERROR_CODES`, tests each `message` with `/bff/i`, never the `BFF_*` keys; no copied list of texts | qc | T1 static | planner | pass | Walks Object.values(BFF_ERROR_CODES), tests message only with /bff/i |
| CVTG-2 | Built-in text guard covers both constants | VTG-1 | new `LastResort.constants.test.ts` walks every value of `LAST_RESORT_TEXT` and `MOBILE_NAV_TEXT` with `/bff/i`; no copied list | qc | T1 static | planner | pass | Walks both constants with /bff/i, no copied list |
| CVTG-3 | Both guards pass on today's texts | VTG-1 | `pnpm --filter @abyss/web test` passes, both cases green | qc | T1 cli | planner | pass | web suite 741 passed |
| CVTG-4 | Guards fail on a planted word | VTG-1 | qc plants `BFF`, `bff` and `Bff` once in one refusal message and once in one built-in text on a scratch copy: each guard fails; nothing committed | qc | T1 cli | planner | pass | BFF/bff/Bff planted in a message and a text, and in MOBILE_NAV_TEXT: each guard failed; clean copy green |
| CVTG-5 | No source change, no contract change | VTG-1 | `git diff --stat <base>..HEAD -- apps/web/src` lists only the two test files; `BFF_*` `errorCode` values, identifiers and env keys unchanged | qc | T1 cli | planner | pass | diff lists 2 test files + 1 doc line; no src change |
| CVTG-6 | Typecheck, lint and format pass | VTG-1 | `pnpm --filter @abyss/web typecheck` and `lint` pass; `pnpm exec prettier --check` on the changed files prints no file | qc | T1 cli | planner | pass | typecheck (APP_ENV from .localEnv.agent), lint, prettier clean |
| CVTG-7 | Module doc names the guard and index is clean | VTG-1 | `docs/modules/web/apis-server.md` has one line naming the guard; `.claude/bin/module-index --check` prints nothing | qc | T1 cli | planner | pass | doc line present; module-index --check empty |
| CVTG-8 | Scoped e2e suite green on the full stack | VTG-1 | No runtime file in the diff: passes with `Note` `scope empty: tests and docs only`; stack checks pass | qc | T3 cli | planner | pass | scope empty: tests and docs only (diff = 2 test files + 1 doc; no runtime file, no tier 3 area); stack not started, no stack checks needed |
| CVTG-9 | Phase diff review | VTG-1 | Diff `<base>..HEAD` holds only two test files and one doc line; no message text changed to make a test pass | security-qc | T1 static | planner | pass | diff = 2 test files + 1 doc line; no src, dep or message change; no secrets |
