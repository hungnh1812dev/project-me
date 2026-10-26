# Current Unit: FN1b-web
## FN1b-web web file-name guard
Status: ready-for-checks
What was built: `apps/web/src/FileNames.architecture.test.ts` per ADR 0008 "Guard", modelled on the cms-admin guard. Scans `src/` and `test/`; Next.js framework file names and route-segment folders (`[slug]`, `[...slug]`, `(group)`, `@slot`) are listed; no exception list. README line added.
Changed files:
- apps/web/src/FileNames.architecture.test.ts - new guard (4 tests)
- apps/web/README.md - one paragraph naming the guard
Behaviour to verify:
- `pnpm --filter @abyss/web test` passes (156) on the current tree.
- Scratch `src/bad-file.ts` and scratch `src/BadFolder/` each fail the guard (checked, scratch removed); scratch `src/app/[slug]/page.tsx` passes (checked, removed).
Security-relevant: none
Checks needed: qc-cli tier 1 (test-only guard; web unit suite)
Risk: normal
Verification: format pass · build/type-check pass (lint, typecheck) · unit tests pass (156) · docs apps/web/README.md
Proposed commit: |
  test(apps/web): add file-name guard for the naming rule

  Add FileNames.architecture.test.ts per ADR 0008: every file and folder
  under src/ and test/ must follow the rule, with Next.js framework files
  and route-segment folders listed and no exception list.

  Affected:
  - apps/web
Deletions needing approval: none
Fix log:
