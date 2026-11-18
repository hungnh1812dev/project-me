# backup-production-only
Done: 2026-11-17 · Commits: 23ccc14c..7a71fc7d · Apps / packages: apps/cms-api (backup script, deploy docs)

## Overview
The nightly cms-api backup uploads to the bucket only when `NODE_ENV` is exactly `production`. Any other value runs a dump-only job: encrypted dump, database and dump size checks, no `rclone` call, no bucket keys needed. The deploy contract sets `NODE_ENV` in the Secret `postgres-backup` on every cluster; a missing key takes the image default `production`.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Production-only upload | Script runs `rclone` (upload, object size, monthly copy) only in production | BPO-1 |
| Deploy contract | Docs say where `NODE_ENV` is set, what a run without it does, and that bucket keys and the remote exist on production only | BPO-2, BPO-3 |

## Structure
- `apps/cms-api/backup/` — `nightly-backup.sh`, `nightly-backup.test.sh` (changed)
- `apps/cms-api/README.md` (changed)
- `docs/deployments/` — `backups.md`, `secrets.md`, `configmaps.md` (changed)
- `docs/apps/cms-api/patch-cms-api-0.2.0.md` (changed)
- `docs/flows/backups/` — `FLOW.md`, `SPEC.md` (changed; BK-6)
- `CHANGELOG.md` (changed)
- ADR 0025 point 7 (local, gitignored; status updated)

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| None | | | | |
