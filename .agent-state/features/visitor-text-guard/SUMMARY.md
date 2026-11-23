# visitor-text-guard
Done: 2026-11-23 · Commits: d5435d40..a08ac46a · Apps / packages: web

## Overview
Guard tests that fail if any web refusal message or built-in visitor text names the BFF. No visitor-facing text changed; the internal `BFF_*` error codes and names stay as they are.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| No "BFF" in visitor text | Tests walk every refusal message and built-in text and fail on `bff` in any case | VTG-1 |

## Structure
apps/web/src/
- apis/server/bff/Bff.errors.test.ts (changed: guard case)
- configs/LastResort.constants.test.ts (new: guard for built-in texts)
docs/modules/web/apis-server.md (changed: names the guard)

## Major issues
None
