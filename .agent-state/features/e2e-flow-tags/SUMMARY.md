# Summary - e2e-flow-tags

## Overview
Every e2e spec now names the apps and flows it walks, as Playwright tags on its top-level `test.describe`. A tier 1 contract check fails on a spec with no app tag or a tag that names no `docs/apps` or `docs/flows` folder. Scoped runs can select a flow's or an app's specs with `--grep`. No product code, flow, env or schema change (ADR 0022 decision 3).

## Sub-features
- Fix e2e type check (EFT-0): type check passes again.
- Spec tags and contract check (EFT-1): app and flow tags on every spec; `SpecTags.contract.test.ts`.

## Structure
- `apps/e2e/tests/` — tags added to every `*.e2e.spec.ts` (63 specs).
- `apps/e2e/src/` — `SpecTags.contract.test.ts` (new); `tsconfig.json` (EFT-0).
- `docs/modules/e2e/src.md` — describes the check and how to tag a new spec.
- `CHANGELOG.md` — e2e item under `## Unreleased`.

## Commits
- bfc8a27d — EFT-0
- 5c5a0cdc — EFT-1
- be7d545e — EFT-A fix (missing tags on two specs)
- ADR 0022 status line: `docs/adr` is git-ignored; not committed.

## Known issues
None (no resolved records).
