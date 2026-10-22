# Current Unit: D2 step B (ui-builder)
## D2-B base-config for cms-admin, web, form-commons
Status: ready-for-checks (pnpm lint blocked until the .oxlintrc.json files are deleted, approval needed)
What was built: each project's eslint.config.mjs now spreads baseEslint (shared TS rules) and keeps React hooks, Next (web) and browser globals local. New oxlint.config.ts per project extends baseOxlint and keeps react, jsx-a11y, vitest plugins, browser env, react-in-jsx-scope off. @eslint/js and typescript-eslint dropped from the three package.json (now via base-config). READMEs lint rows updated.
Changed files:
- apps/{cms-admin,web}/eslint.config.mjs, packages/form-commons/eslint.config.mjs - use @abyss/base-config/eslint
- apps/{cms-admin,web}/oxlint.config.ts, packages/form-commons/oxlint.config.ts - new, extend base oxlint
- apps/{cms-admin,web}/package.json, packages/form-commons/package.json - removed @eslint/js, typescript-eslint
- pnpm-lock.yaml - importers updated
- apps/{cms-admin,web}/README.md, packages/form-commons/README.md - lint row
Behaviour to verify:
- After the deletions below: `pnpm lint` in the three projects passes (oxlint refuses to run while both .oxlintrc.json and oxlint.config.ts exist). ESLint alone passes now; oxlint passes with `-c oxlint.config.ts`.
Security-relevant: none
Checks needed: none (tooling only, no runtime effect)
Risk: normal
Verification: format pass · build/type-check pass (typecheck) · unit tests pass (cms-admin 289, web 99, form-commons 89) · docs READMEs
Proposed commit: |
  chore(apps/cms-admin,apps/web,packages/form-commons): use base-config eslint and oxlint

  Each project spreads the shared ESLint base and extends the shared
  Oxlint base, keeping React, Next and Vitest rules local. Drop the
  direct @eslint/js and typescript-eslint dependencies.

  Affected:
  - apps/cms-admin
  - apps/web
  - packages/form-commons
Deletions needing approval: apps/cms-admin/.oxlintrc.json, apps/web/.oxlintrc.json, packages/form-commons/.oxlintrc.json (replaced by oxlint.config.ts; eslint.config.mjs files were edited in place, not deleted)
Fix log:
