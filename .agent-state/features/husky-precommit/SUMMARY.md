# Summary: husky-precommit

## Overview
Every `git commit` now formats its staged files with the repo's Prettier setup and re-stages them (husky + lint-staged, ADR 0018). Commit: c2e60ab.

## Tasks
- HK-1: pre-commit hook formats the staged files (core-builder, commit c2e60ab). Checked in checkpoint HK-A (CHECKLIST.md, rows CHK-1 to CHK-9: hook install, staged-file formatting, partial staging, ignored files, syntax-error abort, fresh-worktree commit, repo checks, dependency risk, e2e smoke).

## Structure
- `package.json`: husky and lint-staged devDependencies, `prepare`, `format:staged`, `lint-staged` key
- `.husky/pre-commit`: runs `pnpm format:staged`
- `pnpm-lock.yaml`: lockfile update
- `README.md`: Git hooks note

## Major issues
None.
