---
flow: backups
replaces: D20
summary: Owner-only list of nightly database dumps and 60-second download links after re-authentication
---

# Backups: spec

Part of the [project spec](../../../SPEC.md). Flow `backups`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

A nightly job dumps the database, encrypts it and, in production only, uploads it to a Cloudflare R2 bucket (BK-6). In cms-admin the owner lists the dumps and, after entering the password and a 2FA code, gets a download link valid 60 s. The page warns when no daily dump is newer than 26 hours. The full decision is D20 in Decisions below.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) row "Backups (D20)". Stack: [stack-and-commands.md](../../global/reference/stack-and-commands.md) row "Backups".

## Requirements

D20 (Decisions below) and D19 (`abyss_backup` role). New requirements of this flow go here with ids `BK-<n>`.

- **BK-6 Backup job image (2026-11-16, user request; ADR 0025; answers Q-OPS8; numbered after the built tasks BK-1..BK-5 so no id means two things; upload in production only: user request 2026-11-16 "only run rclone on production, everywhere else only the dump, checked on the key NODE_ENV", ADR 0025 point 7; a Secret without `NODE_ENV`: user decision 2026-11-16 after checkpoint BPO-A showed the image default).** The nightly job runs the cms-api release image, with the cms-api tag: the image holds `pg_dump`, `pg_restore` and `psql` of the PostgreSQL major the database runs (17), `age`, `rclone`, and the job script, which is the one writer of the object keys cms-api lists. The job's credentials (backup role, bucket write token, age recipient) stay only in the job's Secret; the cms-api pod never receives them, and the cms-api process never runs the tools (D20). The image runs as the numeric non-root user of cms-api. The job uploads only in production: the `NODE_ENV` the job runs with decides, and only the exact value `production` (the test cms-api uses) makes a production run; any other value, empty included, is a dump-only run. The job's Secret `postgres-backup` sets `NODE_ENV` on every cluster, `production` in production and the cluster's own value elsewhere: a Secret without the key leaves the cms-api image's default `production`, so the run is a production run. Only the production cluster holds the bucket keys and the remote, so a cluster that is not production and lacks the key fails with the missing-key exit and never writes to the bucket. A production run streams the dump to the bucket, measures the stored object and makes the day-01 monthly copy. A dump-only run streams the same encrypted dump to nowhere, counting its bytes (`wc -c`), and never runs `rclone`, so it needs no bucket keys (`BACKUP_BUCKET`, `BACKUP_PREFIX`, the remote) and writes nothing outside the pod. Both runs check every key they read first, keep the database size check before the dump and the dump size check after it with the same limits, warning and exit codes, and log which run they are; a dump-only run is not a failure. CI refuses a cms-api image whose client major differs from the pinned database major or that lacks one of the tools.
- **BK-7 Backup time set by a Secret (2026-11-16, user request: "the backup time can be adjusted through a secret"; ADR 0025 point 6).** The time of the nightly job is a deploy value, not part of the image or of this repo's code: the CronJob's `schedule` and `timeZone` come from the keys `BACKUP_SCHEDULE` (a 5-field cron expression that fires once a day; `15 2 * * *` when unset) and `BACKUP_TIME_ZONE` (an IANA zone name; `Etc/UTC` when unset) of the Secret `postgres-backup-schedule`, which holds only these two keys, so no credential ever becomes a manifest variable. The deploy repo's GitOps tool fills them into the CronJob when it renders it; changing the time is one Secret edit, applied at the next sync, with no release. The job fires once a day at most, because the 26-hour warning, the 14-day retention and the monthly copy of D20 count one dump per day. The object stamp and the day-01 monthly check stay in UTC whatever the zone.

## Acceptance

No global success criterion is owned by this flow; its acceptance lives in tasks BK-* (ADR 0013).

## Decisions

**D20 Backup download (added 2026-10-27, user request; ADR 0013, tasks BK-*; user answers Q-BK1 to Q-BK7 on 2026-10-27).** Dumps never sit on the cluster's disks or in the database service.

- Nightly job (its script and tools ship in the cms-api image, BK-6; the CronJob manifest lives in the deploy repo; documented in `docs/deployments/backups.md`): streams `pg_dump -Fc` as `abyss_backup`, encrypts with `age` (Q-BK6: only the public recipient on the VPS; the owner keeps the private key offline in two copies), in production only (BK-6) uploads to a Cloudflare R2 bucket (Q-BK5) under `daily/` and `monthly/`. Retention by bucket lifecycle rules (14 days daily, 92 days monthly). Size check before the dump and after the upload; over the limit → keep the dump and fail loudly.
- Two separate keys (Q-BK2): the job's write-only key cannot delete; cms-api holds only its own read-only R2 token, list and get (`BACKUP_STORAGE_*`, all set or none; none = feature off), and no backup database credential. cms-api never dumps on demand or streams the bytes itself.
- `GET /backups` lists dumps; `POST /backups/download-links` returns a presigned GET URL valid 60 s on the R2 S3 API host (R2 presigned URLs fail on a custom domain). Both owner only as a hard rule (`requireOwnerActor`) no role grant can open; `no-store`; throttled per actor (links also per IP). A link needs the current password plus a code of the active 2FA method (`ReauthenticationService`, identity); 2FA off → refused. Failures write `auth.reauth_failed`; each link writes `backup.download_link_created`. The URL is never logged or audited. The admin page warns when no daily dump is newer than 26 hours.

Q-BK1..Q-BK7 were answered by the user on 2026-10-27 and are recorded in D20 and ADR 0013.

## Out of scope

On-demand dumps and streaming dump bytes through cms-api (D20).

## Open questions

None.
