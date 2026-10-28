# Backups module (cms-api)

Owner-only list of the nightly database dumps and short download links (SPEC §7 D20, §9 "Backups"; [ADR 0013](../adr/0013-backup-download.md)). The module reads the backup bucket and never writes to it. It holds no database credential and never dumps or streams bytes. The nightly job lives in the deploy repo (`docs/deployment/k3s-traefik.md` §7).

## Switching it on

The feature is opt-in. It runs only when the `BACKUP_STORAGE_*` keys are set (all or none; see `apps/cms-api/.env.example`). With none set, both routes answer `404 BACKUPS_NOT_CONFIGURED` and the admin page shows a not-configured state after the owner presses "Check backups" (the menu item is always shown to the owner). There is no other enable flag.

## Endpoints

Both need a signed-in owner (`JwtAuthGuard`, then `requireOwnerActor`). Every other caller gets `403`, including admins, roles with every grant, API tokens and reviewers: no permission subject exists for backups. Both answer `Cache-Control: no-store`.

### `GET /api/v1/backups`

Throttle: 30 per minute per actor. Lists `<prefix>daily/` and `<prefix>monthly/` and skips keys that do not match `<prefix><kind>/abyss-<YYYYMMDDTHHMMSSZ>.dump.age`.

```json
{
  "data": [
    {
      "key": "postgres/daily/abyss-20261027T020000Z.dump.age",
      "kind": "daily",
      "fileName": "abyss-20261027T020000Z.dump.age",
      "createdAt": "2026-10-27T02:00:00.000Z",
      "sizeBytes": 2048
    }
  ],
  "meta": {
    "count": 1,
    "totalBytes": 2048,
    "latestAt": "2026-10-27T02:00:00.000Z",
    "isStale": false
  }
}
```

`createdAt` comes from the file name (UTC). Newest first. `isStale` is true when no `daily` dump is newer than 26 hours, or none exists.

### `POST /api/v1/backups/download-links`

Body `{ key, password, code }`. Throttle: 10 per 10 minutes per IP and 5 per 10 minutes per actor (counted for every request, valid or not). Order of checks:

1. Body shape and the key pattern under the configured prefix: `400`, before anything else.
2. Re-authentication (`ReauthenticationService`, identity): the current password and a code of the active 2FA method. `403 AUTH_2FA_NOT_ENABLED` when 2FA is off; `403` for a wrong password or code, each with one `auth.reauth_failed` row (`purpose: backup_download`).
3. `404 BACKUP_NOT_FOUND` when the object is missing.
4. A presigned GET URL valid for a fixed 60 s (`DOWNLOAD_LINK_TTL_SECONDS`; never a request value).
5. A standalone `backup.download_link_created` audit row (`targetId` = file name, metadata `{ kind, sizeBytes }`).

Response `201 { url, fileName, expiresAt }`. The URL is never logged, audited or kept on the server. The download itself may run longer than 60 s: the provider checks the expiry only when the request starts. A bucket failure is a bare `503`.

## Errors

`BACKUPS_NOT_CONFIGURED` and `BACKUP_NOT_FOUND` (both `404`) are in `content/public-constants.json` under `errorCodes.backups`.

## Layout

`domain/` (constants, `BackupCatalog.rules.ts`: key parsing and the stale rule), `application/` (`Backups.port.ts`, `Backups.service.ts`), `adapters/S3BackupStorage.adapter.ts`, `http/Backups.controller.ts`, `Backups.module.ts`. Another storage provider is one more adapter and a change in `createBackupStorage`.
