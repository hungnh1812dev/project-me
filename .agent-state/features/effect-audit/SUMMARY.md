# effect-audit
Done: 2026-11-20 · Commits: 86ba76ba..a930c34f · Apps / packages: root (pnpm workspace), apps/e2e

## Overview
Pins the transitive `effect` package to 3.22.4 through a pnpm override, so the audit for GHSA-7589-6fvf-x4pw passes. Versions below 3.22.1 are no longer installed.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Vulnerable effect override | Overrides `effect` below 3.22.1 to 3.22.4; refreshes the lockfile; CHANGELOG entry | EFA-1 |
| E2E test fixes | Stale callback type and related e2e spec corrections made during the checkpoint run | none (qc fixes) |

## Structure
```
CHANGELOG.md
pnpm-workspace.yaml
pnpm-lock.yaml
apps/e2e/tests/
  ContentConflict.e2e.spec.ts
  EdgeRouting.e2e.spec.ts
```

## Major issues
None
