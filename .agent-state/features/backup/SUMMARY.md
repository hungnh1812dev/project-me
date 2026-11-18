# Backup
Done: 2026-11-10 · Commits: f4c4690..050e3b50 · Apps / packages: cms-api, cms-admin, e2e, docs

## Overview
The owner can list the nightly database dumps in cms-admin, see a warning when no daily dump is newer than 26 hours, and download a dump through a 60-second link after re-entering the password and a 2FA code. The feature is off unless the storage keys are set, and startup refuses a partial set without printing any secret.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Backup list and download link | Owner-only `GET /backups` and `POST /backups/download-links`, no-store, throttled; audit rows without the URL | BK-1, BK-2 |
| Storage config | All-or-none `BACKUP_STORAGE_*` keys; feature off when unset | BK-3 |
| Backups screen | `/backups` list, stale warning, download dialog; first-state hint and button in one card | BK-4, BK-5 |
| Operations doc | Nightly job, keys, retention, size check and restore in `docs/deployments/backups.md` | BK-doc |
| Tests | cms-api unit and integration, cms-admin unit, e2e backups spec | BK-e2e |

## Structure
- `apps/cms-api`: backup catalog, service, controller, S3 read-only adapter, config (about 498 changed paths in the range, shared with other features)
- `apps/cms-admin`: `features/backups/`, `configs/locales/en/Backups.ts`, backups page and dialog tests (about 305 paths in the range)
- `apps/e2e`: `tests/Backups.e2e.spec.ts` and the card and production-page specs (about 81 paths)
- `docs/deployments/backups.md`, `docs/flows/backups/`, `docs/modules/` backup module docs
- `docs/adr/0013-backup-download.md` (ignored by git, kept local)

## Major issues
None

## Notes
Real-bucket download from R2 is not checked by this feature; it is tracked at launch gate LG-3 (Q-BK-R1).
