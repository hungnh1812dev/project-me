# Backups: rules

Part of the [project spec](../../../SPEC.md). Flow `backups`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Both routes are owner only as a hard rule (`requireOwnerActor`) that no role grant can open; `no-store`; throttled per actor, links also per IP (D20).
2. A link needs the current password plus a code of the active 2FA method; 2FA off → refused (D20).
3. cms-api holds only its own read-only R2 token (list and get); `BACKUP_STORAGE_*` all set or none (none = feature off) (D20).
4. Write `auth.reauth_failed` on failure and `backup.download_link_created` for each link (D20, D15).

## Must never

1. Log or audit the presigned URL (D20).
2. Dump on demand or stream dump bytes through cms-api, or give cms-api a backup database credential (D20).

## Global decisions this flow follows

D8, D15, D19.

## Decisions owned by this flow

**D20 Backup download (added 2026-10-27, user request; ADR 0013, tasks BK-\*; user answers Q-BK1 to Q-BK7 on 2026-10-27).** Dumps never sit on the VPS or in Supabase.

- Nightly job (deploy repo; documented in `docs/deployment/k3s-traefik.md` §7): streams `pg_dump -Fc` as `abyss_backup`, encrypts with `age` (Q-BK6: only the public recipient on the VPS; the owner keeps the private key offline in two copies), uploads to a Cloudflare R2 bucket (Q-BK5) under `daily/` and `monthly/`. Retention by bucket lifecycle rules (14 days daily, 92 days monthly). Size check before the dump and after the upload; over the limit → keep the dump and fail loudly.
- Two separate keys (Q-BK2): the job's write-only key cannot delete; cms-api holds only its own read-only R2 token, list and get (`BACKUP_STORAGE_*`, all set or none; none = feature off), and no backup database credential. cms-api never dumps on demand or streams the bytes itself.
- `GET /backups` lists dumps; `POST /backups/download-links` returns a presigned GET URL valid 60 s on the R2 S3 API host (R2 presigned URLs fail on a custom domain). Both owner only as a hard rule (`requireOwnerActor`) no role grant can open; `no-store`; throttled per actor (links also per IP). A link needs the current password plus a code of the active 2FA method (`ReauthenticationService`, identity); 2FA off → refused. Failures write `auth.reauth_failed`; each link writes `backup.download_link_created`. The URL is never logged or audited. The admin page warns when no daily dump is newer than 26 hours.
