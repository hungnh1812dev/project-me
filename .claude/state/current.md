# Current Unit: ARCH-1
## ARCH-1 Move cms-api architecture guards to test/architecture; one SRC_ROOT
Status: ready-for-checks
What was built: 28 files `git mv`'d (staged, content unchanged in the index) from `src/architecture/` (26) plus the access and graphql module guards to `apps/cms-api/test/architecture/`. Working-tree edits (unstaged) on top: `../` imports gain `../../src/`, one `SRC_ROOT` in `SourcePaths.constants.ts`, exemptions removed, jest `unit` roots add `test/architecture`, docs and generator updated.
Commit split: commit 1 = the index as staged (28 renames only, `git commit` without `-a`); commit 2 = everything else listed below (`git add` the listed paths; the moved files' edits are the unstaged half of the `RM` entries).
Changed files:
- apps/cms-api/test/architecture/* (28, moved) - import prefixes, SRC_ROOT from SourcePaths.constants, unused `join` imports dropped
- apps/cms-api/test/architecture/SourcePaths.constants.ts - exports SRC_ROOT; four `architecture` entries leave NON_ROLE_LITERAL_FILES
- apps/cms-api/test/architecture/ModuleGraph.analyzer.ts - SRC_ROOT removed, nodeOfFile comment names the new owner
- apps/cms-api/test/architecture/LayerRules.constants.ts - LAYER_EXEMPT_ROOTS = ['contract']
- apps/cms-api/test/architecture/ImportGraph.analyzer.ts - missing-path message names test/architecture/SourcePaths.constants.ts
- apps/cms-api/jest.config.cjs - unit roots add test/architecture
- apps/cms-api/eslint.config.mjs - drops 'src/architecture/**' from deep-import-ban ignores
- apps/cms-api/README.md, docs/modules/access-control.md - paths
- scripts/docs/architecture/lib.py, build.py - read/describe test/architecture (platform group reads apps/cms-api/test)
- docs/architecture/{02,03,04,08,project-architecture}.html - regenerated (08-frontends.html also picked up its already-stale form-commons/web paths; that follow-up is thereby done)
Behaviour to verify:
- `pnpm --filter @abyss/cms-api test:unit` - 138 suites, 1532 tests, same as before (baseline recorded before commit 1: 138 / 1532)
- Guards run from test/architecture and scan the same src files; `dist/architecture` absent after build
Security-relevant: none at runtime; path-only move of RecordSerializer, PermissionMetadata, SessionOwnership, IdentityCli guards (same pinned paths, same SRC_ROOT target `src/`). Task has Security gate: yes (path-only review).
Checks needed: qc-cli tier 1 (behavior-preserving move; unit suite) + security-qc path-only review
Risk: normal
Verification: format pass (format:check green) · build/type-check pass (typecheck, lint, nest build) · unit tests pass (1532, 138 suites) · docs README, access-control.md, docs/architecture pages
Notes: scratch-import check ('../access/domain/PolicyEvaluator' from health) failed `Layers.architecture.spec.ts` (not Modules); scratch file removed. `git ls-files apps/cms-api/src | grep -c architecture` = 0; `git grep SRC_ROOT = apps/cms-api` = 1 line; `git grep src/architecture -- apps scripts docs/modules` = none. No new words. integration project not run (unchanged).
Proposed commit 1: |
  refactor(apps/cms-api): move architecture guards to test/architecture

  Moves only, no content change: the 26 files of src/architecture plus
  the access RecordSerializer and graphql guards.

  Affected:
  - apps/cms-api
Proposed commit 2: |
  refactor(apps/cms-api): point architecture guards at src and share SRC_ROOT

  Imports gain the ../../src prefix, SourcePaths.constants owns SRC_ROOT,
  the exemptions that existed because the guards lived in src go, jest
  unit roots add test/architecture, docs and the architecture page
  generator follow the new folder.

  Affected:
  - apps/cms-api
  - scripts/docs/architecture
  - docs/architecture
  - docs/modules
Deletions needing approval: none (src/architecture/ is empty and gone after the moves)
Fix log:
