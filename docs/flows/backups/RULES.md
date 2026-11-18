# Backups: rules

Part of the [project spec](../../../SPEC.md). Flow `backups`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Both routes are owner only as a hard rule (`requireOwnerActor`) that no role grant can open; `no-store`; throttled per actor, links also per IP (D20).
2. A link needs the current password plus a code of the active 2FA method; 2FA off → refused (D20).
3. cms-api holds only its own read-only R2 token (list and get); `BACKUP_STORAGE_*` all set or none (none = feature off) (D20).
4. Write `auth.reauth_failed` on failure and `backup.download_link_created` for each link (D20, D15).

## Must never

1. Log or audit the presigned URL (D20).
2. Dump on demand or stream dump bytes through cms-api, or give cms-api a backup database credential (D20).

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): credentials (D8), database roles (D19).
