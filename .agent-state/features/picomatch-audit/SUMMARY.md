# picomatch-audit
Done: 2026-11-18 · Commits: 65cb8978..fb2daa4a · Apps / packages: root (workspace)

## Overview
The CI dependency audit fails on GHSA-fc5q-39xc-vjpf in picomatch 4.0.7, which has no fixed release. The audit now ignores only that advisory, with a check-later warning in the workspace config. The advisory is reached only through lint tooling, and no dependency or runtime code changed.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Audit ignore for GHSA-fc5q-39xc-vjpf | Keeps the audit green while no fixed picomatch exists; re-check via `npm view picomatch dist-tags` | PMA-1 (b9c5b351) |

## Structure
- `CHANGELOG.md` (root, Unreleased)
- `pnpm-workspace.yaml` (root, `auditConfig.ignoreGhsas`)

## Major issues
None

## Notes
- Commit fb2daa4a holds 2 CHANGELOG lines that were swept into PMA-1 and were moved out by a history rewrite (user approved). Not part of this feature's own changes.
