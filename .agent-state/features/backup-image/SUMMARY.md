# Summary - backup-image

## Overview
The nightly Postgres backup job runs from the cms-api image, so it shares the image's tags and release guards. The backup time is set from the Secret `postgres-backup-schedule` through the GitOps tool. Design: ADR 0025 (git-ignored, local), option B.

## Built
- BIM-1: nightly backup script (POSIX sh, pg_dump through age to rclone, size checks, day-01 monthly copy) with a stubbed test run in CI.
- BIM-2: cms-api image carries the pg client, age and rclone and a root-owned read-only backup script; release guard backup-tools.sh and postgres major agreement in pins-check.
- BIM-3: deploy docs, the 0.2.0 patch note and the change log describe the backup job running the cms-api image.
- BIM-4: backup time set from the Secret `postgres-backup-schedule` (defaults 02:15 Etc/UTC) in the deploy docs.

## Structure
- `apps/cms-api/`: `Dockerfile`, `README.md`, `backup/` (nightly-backup.sh and its test).
- `.github/`: `scripts/backup-tools.sh`, `scripts/pins-check.sh`, `scripts/pins-check.test.sh`, `workflows/_publish.yml`, `workflows/cms-api.yml`.
- `docs/`: `apps/cms-api/patch-cms-api-0.2.0.md`, `deployments/backups.md`, `deployments/ci-cd.md`, `deployments/devops-runbook.md`, `deployments/secrets.md`, `flows/backups/FLOW.md`, `flows/backups/SPEC.md`.
- Root: `CHANGELOG.md`.

## Commits
Base 7fcb6d0, head 135380fd: f54f3970, 119e6036, e9ee850a, 1ae558f3, db714e92 (checkpoint fix), 135380fd (docs commit).

## Issues
None (major issues).
