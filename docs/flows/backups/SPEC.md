---
flow: backups
replaces: D20
summary: Owner-only list of nightly database dumps and 60-second download links after re-authentication
---

# Backups: spec

Part of the [project spec](../../../SPEC.md). Flow `backups`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

## Behaviour

The deploy repo's nightly job dumps the database, encrypts it and uploads it to a Cloudflare R2 bucket. In cms-admin the owner lists the dumps and, after entering the password and a 2FA code, gets a download link valid 60 s. The page warns when no daily dump is newer than 26 hours. The full decision is D20 in Decisions below.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) row "Backups (D20)". Stack: [stack-and-commands.md](../../global/reference/stack-and-commands.md) row "Backups".

## Requirements

D20 (Decisions below) and D19 (`abyss_backup` role). New requirements of this flow go here with ids `BK-<n>`.

## Acceptance

No global success criterion is owned by this flow; its acceptance lives in tasks BK-* (ADR 0013).

## Decisions

**D20 Backup download (added 2026-10-27, user request; ADR 0013, tasks BK-*; user answers Q-BK1 to Q-BK7 on 2026-10-27).** Dumps never sit on the VPS or in Supabase.

- Nightly job (deploy repo; documented in `docs/deployment/k3s-traefik.md` §7): streams `pg_dump -Fc` as `abyss_backup`, encrypts with `age` (Q-BK6: only the public recipient on the VPS; the owner keeps the private key offline in two copies), uploads to a Cloudflare R2 bucket (Q-BK5) under `daily/` and `monthly/`. Retention by bucket lifecycle rules (14 days daily, 92 days monthly). Size check before the dump and after the upload; over the limit → keep the dump and fail loudly.
- Two separate keys (Q-BK2): the job's write-only key cannot delete; cms-api holds only its own read-only R2 token, list and get (`BACKUP_STORAGE_*`, all set or none; none = feature off), and no backup database credential. cms-api never dumps on demand or streams the bytes itself.
- `GET /backups` lists dumps; `POST /backups/download-links` returns a presigned GET URL valid 60 s on the R2 S3 API host (R2 presigned URLs fail on a custom domain). Both owner only as a hard rule (`requireOwnerActor`) no role grant can open; `no-store`; throttled per actor (links also per IP). A link needs the current password plus a code of the active 2FA method (`ReauthenticationService`, identity); 2FA off → refused. Failures write `auth.reauth_failed`; each link writes `backup.download_link_created`. The URL is never logged or audited. The admin page warns when no daily dump is newer than 26 hours.

Q-BK1..Q-BK7 were answered by the user on 2026-10-27 and are recorded in D20 and ADR 0013.

## Out of scope

On-demand dumps and streaming dump bytes through cms-api (D20).

## Open questions

None.

## Change log

- 2026-10-27 Backup download (D20, ADR 0013, Q-BK1..Q-BK7).
- 2026-11-04 Flow folder created from the old SPEC.
