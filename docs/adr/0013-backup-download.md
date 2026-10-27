# ADR 0013: Download database backups from the admin console

- Status: accepted (2026-10-27). The user answered Q-BK1 to Q-BK7 on 2026-10-27. Q-BK7 was first deferred and then answered the same day. Each answer matches the design below.
- Date: 2026-10-27
- Asked by: the user (2026-10-27, Vietnamese): "có UI download backup trên CMS-Admin, và đảm bảo backup không lấy quá nhiều dung lượng VPS hoặc supabase". In English: a backup download UI in cms-admin, and backups must not use much space on the VPS or on Supabase. The request validator routed it as `DESIGN backup-download`.
- Amends: SPEC §2 (out of scope note), §3 (stack row), §7 (new D20), §9 (new row "Backups"); `docs/deployment/k3s-traefik.md` §7, `docs/deployment/supabase-database.md` (backup part, written by LG-db-4), `docs/deployment/k3s-secrets-sops.md` §1, §2. Adds to LG-0 item (4): the off-site upload and the restore drill now include the steps in section 3.

## Context (checked on the repo, 2026-10-27)

- The production database is a Supabase free project. It has a 500 MB database limit and no automatic backups on the free plan (ADR 0012 §9). The VPS runs k3s with one node and `local-path` storage.
- SPEC §1 item 3: the separate deploy repo owns the backups. This repo documents what they must cover. `docs/deployment/k3s-traefik.md` §7 has a nightly `pg_dump -Fc` CronJob. It writes the dump to `/tmp` in the job pod and copies it off-site with `rclone copyto`. The guide also asks for "14 daily and a few monthly" dumps through a bucket lifecycle rule, encryption at rest, and an alert when the job fails or no new object appears in 26 hours.
- `abyss_backup` is the read-only database role for the dump. It has explicit `SELECT` on `public` and `content` (ADR 0012 §9.2, Q-DB7). cms-api runs as `abyss_api`.
- cms-api already has the pieces this design reuses:
  - owner checks through `isOwnerRole` (`access/domain/ActorContext.entity.ts`, not exported yet);
  - `requireAccountActor` (`access/domain/Rank.rules.ts`);
  - re-authentication with the current password plus a 2FA code, used for 2FA off (`identity/application/TwoFactorManagement.service.ts`, private methods);
  - `@Throttle` with the `actor` key source (`common/constants/Limits.constants.ts`);
  - `NO_STORE_HEADER`;
  - `SecurityAuditService` with `REAUTH_FAILURE_REASONS`.
- cms-admin has:
  - a feature registry (`features/Features.registry.ts`);
  - `useCallerAccess().isOwner` (access facade);
  - `ConfirmWithCodeForm` for password + code (security feature, not exported from its facade);
  - `useEmailCode` (auth facade).
- SPEC §2 "S3 adapter" in the v2 backlog means a media storage adapter. A client that reads backup objects is new scope added by this user request. SPEC §2 gets a note that says so.

## Decision

### 1. Where the bytes live

| Place                                                   | What it holds                 | Why                                                                                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                                                | the live database only        | A dump is never written to Supabase Storage or to a table. `pg_dump` only reads, as `abyss_backup` over the session pooler.                                                                          |
| VPS disk                                                | nothing                       | The job streams the dump into the bucket: `pg_dump -Fc \| age -r <recipient> \| rclone rcat`. There is no `/tmp` file, no PVC and no emptyDir that holds a dump. cms-api never proxies the download. |
| Off-site bucket (S3 API; Cloudflare R2, Q-BK5 answered) | every dump, encrypted (Q-BK6) | Retention is bounded by lifecycle rules (section 3).                                                                                                                                                 |

### 2. Bucket layout and object names

- Keys are `<prefix>daily/abyss-<YYYYMMDDTHHMMSSZ>.dump.age` and `<prefix>monthly/abyss-<YYYYMMDDTHHMMSSZ>.dump.age`. `<prefix>` defaults to `postgres/`. One prefix per environment when environments share a bucket.
- The job uploads each object with `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="abyss-<stamp>.dump.age"` (`rclone rcat --header-upload`). The download URL then needs no response override, which not every S3-compatible provider supports.
- R2 presigned URLs work only on the S3 API host (`https://<account-id>.r2.cloudflarestorage.com`), not on a custom domain. So `BACKUP_STORAGE_ENDPOINT` is that host, and the browser downloads from it. No custom domain or public bucket access is set up for backups.
- On the first day of each month (UTC) the job also copies that night's object to `monthly/` with a server-side copy (`rclone copyto remote:a remote:b`). The bytes never pass through the VPS.

### 3. The nightly job (documented here, built in the deploy repo)

1. Pre-dump size check:
   - `psql -Atc "select pg_database_size(current_database())"` as `abyss_backup`. The job prints the size.
   - When the size is above `BACKUP_MAX_DATABASE_BYTES` (job env; recommended 400 MB, 80% of the Supabase free limit), the job prints a warning, **still dumps**, and exits 1 at the end. The existing "job failed" alert fires and a backup still exists.
2. Dump and upload in one stream (section 1). `set -o pipefail`, so a failed `pg_dump` fails the job. `rclone rcat` writes to a temporary name and renames only on success, so a half-written dump is never listed.
3. Post-upload size check: `rclone size` on the new object. Above `BACKUP_MAX_DUMP_BYTES` (recommended 200 MB) → exit 1 after the upload, same reason as step 1.
4. Monthly copy (section 2).
5. The job credential can write and list but **cannot delete** (Q-BK2, Q-BK4). Retention comes only from bucket lifecycle rules:
   - `daily/` objects expire after 14 days;
   - `monthly/` objects expire after 92 days;
   - providers round to the next UTC midnight, so 14 to 15 daily objects and 3 monthly objects exist.
6. Space bound:
   - at most 15 + 3 = 18 objects;
   - with the 200 MB cap the bucket stays under 3.6 GB;
   - the Supabase free database cannot exceed 500 MB, so the bucket stays under 9 GB even uncapped;
   - both are inside the R2 free 10 GB.
7. Alerts:
   - the job failed (steps 1-3);
   - no new `daily/` object in 26 hours. The deploy repo monitors this, and the admin page shows it too (section 4).
8. Restore drill (k3s guide §7): fetch the dump, run `age -d -i <key file> abyss-<stamp>.dump.age > abyss-<stamp>.dump`, then run the drill steps as before. The private age key is never on the VPS. The owner keeps it offline.

Why lifecycle rules and not count-based pruning:

- A delete-capable job key on a compromised VPS could wipe every backup. With lifecycle rules the key cannot delete anything.
- Cost: when the job breaks, old daily dumps keep expiring. The 26-hour stale alert, the admin warning and the 92-day monthly copies cover that gap.

### 4. cms-api: module `backups` (read-only on the bucket)

Ownership:

- `modules/backups/` owns listing backup objects and issuing download links. It is the only cms-api module that talks to the backup bucket.
- Re-authentication belongs to `identity`, the owner rule to `access` and audit rows to `security-audit`. `backups` uses their public interfaces.
- cms-api holds **no database credential for backups**. It never runs `pg_dump`, so there is no on-demand dump (Q-BK3).

Config:

- Six optional keys, set all or none. When none is set, the feature is off.
  - `BACKUP_STORAGE_ENDPOINT`: https URL in production; http allowed outside production for the test stand-in.
  - `BACKUP_STORAGE_REGION`: default `auto`.
  - `BACKUP_STORAGE_BUCKET`.
  - `BACKUP_STORAGE_PREFIX`: default `postgres/`.
  - `BACKUP_STORAGE_ACCESS_KEY_ID` and `BACKUP_STORAGE_SECRET_ACCESS_KEY`: Secret.
- The key pair is a **read-only** token scoped to that bucket (list + get), separate from the job's write credential (Q-BK2).
- `loadAppConfig` exposes `backups: BackupStorageConfig | undefined`.

Endpoints (both owner only):

| Endpoint                              | Request                   | Response                                                                                                                                                                                                                                                                                                          | Errors                                                                                                                                                                  |
| ------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/backups`                 | none                      | `200 { data: [{ key, kind: 'daily' \| 'monthly', fileName, createdAt, sizeBytes }], meta: { count, totalBytes, latestAt, isStale } }`, newest first. `createdAt` is parsed from the file name (UTC). `isStale` = no `daily` object newer than 26 hours. Keys that do not match the section 2 pattern are skipped. | `404 BACKUPS_NOT_CONFIGURED` when the config is unset                                                                                                                   |
| `POST /api/v1/backups/download-links` | `{ key, password, code }` | `201 { url, fileName, expiresAt }`. The URL is a presigned GET valid for 60 s. The download itself may run longer: S3 checks the expiry only when the request starts.                                                                                                                                             | `400` (key not matching the pattern, checked before anything else), the re-auth errors below, `404 BACKUP_NOT_FOUND` (HEAD after re-auth), `404 BACKUPS_NOT_CONFIGURED` |

Rules on both endpoints:

- `JwtAuthGuard`, then `requireOwnerActor` (new in `access`, next to `requireAccountActor`). Every non-owner gets `403`: API tokens, reviewers, admins, and also roles that hold any grant. No permission subject exists for backups, so nothing in the role editor can grant it (Q-BK1).
- `Cache-Control: no-store`.
- Throttle per actor:
  - list: 30 per minute;
  - download links: 5 per 10 minutes per actor plus 10 per 10 minutes per IP.

Re-authentication:

- `ReauthenticationService.confirm(accountDocumentId, { password, code }, purpose, meta)` is a new public service in `identity`. The current password plus a code of the account's active 2FA method (TOTP, or an email code sent through the existing `POST /auth/2fa/email/send-code`), as for 2FA off (D8).
- 2FA off → `403 AUTH_2FA_NOT_ENABLED`. The owner must turn 2FA on first, and LG-0 item (7) already requires TOTP.
- Wrong password or code → the same 403 codes as 2FA off. Each failure writes `auth.reauth_failed { purpose, reason }` on its own row (standalone).
- `purpose` comes from a fixed set `REAUTH_PURPOSES = { BACKUP_DOWNLOAD: 'backup_download' }`.
- `TwoFactorManagement.service.ts` is not changed in this work. It may adopt the service later.

Audit:

- Each issued link writes `backup.download_link_created`. `targetId` = the file name, metadata `{ kind, sizeBytes }`.
- The URL and its signature are never logged or audited.

Storage port:

- `BackupStorage` in `application/Backups.port.ts` has three methods:
  - `list(prefix)` → `{ key, sizeBytes }[]`;
  - `find(key)` → `{ key, sizeBytes } | null`;
  - `createDownloadUrl(key, expiresInSeconds)` → `string`.
- One S3 adapter. Unit and HTTP integration specs use a fake.

### 5. cms-admin: feature `backups`

- Route `/backups` and a nav item under "System settings". The item is shown only when `useCallerAccess().isOwner` (`useNavItems`, because no permission subject exists).
- `BackupsPage`:
  - Summary line: count, total size, time of the latest backup.
  - Warning banner when `isStale`: no new backup for more than 26 hours.
  - Table, newest first: date (local, with UTC on hover), type (daily / monthly), size, Download button.
  - States: loading, empty ("No backups yet"), not configured (`BACKUPS_NOT_CONFIGURED`: "Backup storage is not set up on this server" plus the guide name), error with retry.
  - A note that files are encrypted and need the owner's age key (shown only while the file name ends in `.age`).
- `DownloadBackupDialog`:
  - Wraps `ConfirmWithCodeForm`, which the security facade exports additively.
  - Success → `window.location.assign(url)`. The browser downloads because of `Content-Disposition`. The bucket needs no CORS rule (a top-level navigation, no XHR), and the URL is kept in no state, store or log.
  - `AUTH_2FA_NOT_ENABLED` → a message with a link to `/settings/security`.
  - `429` → the existing rate-limited message.
- Copy in `config/copy/Backups.copy.ts`. Endpoints in `config/Api.endpoints.ts`. Route in `config/App.routes.ts`.

### 6. Why presigned URLs and not streaming through cms-api

Presigned URLs:

- keep the bytes off the VPS (bandwidth, memory, the 1-replica API);
- need no cms-api timeout tuning for a large file;
- work the same for any S3 provider.

Costs, and how they are handled:

- The browser sees the bucket host and a 60-second bearer URL. A 60-second TTL, owner-only issuance with re-auth, an audit row per link and encryption (Q-BK6) bound that risk.
- Streaming stays the fallback if the user rejects presigned URLs. It changes only `createDownloadUrl` into a stream method and the controller, not the UI flow.

## Module ownership, names, extension path

- One owner per responsibility:
  - `backups`: bucket listing and links;
  - `identity`: re-auth;
  - `access`: `requireOwnerActor`;
  - `security-audit`: the two new action names and `REAUTH_PURPOSES`;
  - `src/config/`: the six keys.
- Names chosen: module `backups`; `BackupStorage`, `BACKUP_STORAGE`, `S3BackupStorage`; `BackupsService.list` and `.createDownloadLink`; `ReauthenticationService.confirm`; `requireOwnerActor`; routes `/backups` and `/backups/download-links`; error codes `BACKUPS_NOT_CONFIGURED`, `BACKUP_NOT_FOUND`; audit actions `backup.download_link_created`, `auth.reauth_failed`; env keys `BACKUP_STORAGE_*`; cms-admin feature `backups`, `BackupsPage`, `DownloadBackupDialog`.
- Extension paths:
  - another storage provider (for example a local directory for a self-managed server) is one more adapter and one config switch, with no change to the service, controller or UI;
  - another kind of object (for example a weekly tier) is one more entry in `BACKUP_KINDS` and one lifecycle rule;
  - another sensitive action that needs re-auth is one more `REAUTH_PURPOSES` entry and a call to `ReauthenticationService.confirm`;
  - streaming instead of presigned is the section 6 change.
- No new file-name word: `module`, `controller`, `service`, `port`, `adapter`, `rules`, `constants`, `integration`, `feature`, `api`, `queries`, `context`, `copy` are all in SPEC §5.

## File map

| Task   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Count                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| BK-1   | `apps/cms-api/src/modules/identity/application/Reauthentication.service.ts` (new) + `.spec.ts` (new), `identity/Identity.module.ts`, `identity/index.ts`, `access/domain/Rank.rules.ts` + `Rank.rules.spec.ts`, `access/index.ts`, `security-audit/domain/SecurityAudit.constants.ts`                                                                                                                                                                                     | 2 new, 6 edits                                                       |
| BK-2   | `apps/cms-api/src/config/Env.schema.ts`, `Config.constants.ts`, `AppConfig.setup.ts`, `AppConfig.setup.spec.ts`, `apps/cms-api/.env.example`, `modules/backups/application/Backups.port.ts` (new), `modules/backups/adapters/S3BackupStorage.adapter.ts` (new), `test/integration/S3BackupStorage.integration.spec.ts` (new), `apps/cms-api/package.json`, `pnpm-lock.yaml`                                                                                               | 3 new, 7 edits (config and one adapter, no endpoint)                 |
| BK-3   | `modules/backups/domain/Backups.constants.ts` (new), `domain/BackupCatalog.rules.ts` + `.spec.ts` (new), `application/Backups.service.ts` + `.spec.ts` (new), `http/Backups.controller.ts` (new, request schema and throttle policies inside), `Backups.module.ts` (new), `index.ts` (new), `src/App.module.ts`, `src/contract/PublicConstants.contract.ts` (+ its generated file), `test/integration/Backups.integration.spec.ts` (new), `docs/modules/backups.md` (new) | one endpoint = controller, service, rules, port, adapter, module (6) |
| BK-4   | `apps/cms-admin/src/features/backups/` (`Backups.feature.ts`, `Backups.api.ts`, `BackupsApi.context.tsx`, `Backups.queries.ts`, `BackupsPage.tsx`, `DownloadBackupDialog.tsx`, `index.ts`, two tests), `features/Features.registry.ts`, `features/security/index.ts`, `FeatureTiers.architecture.test.ts`, `config/App.routes.ts`, `config/Api.endpoints.ts`, `config/copy/Backups.copy.ts` (new), `config/Copy.constants.ts`, `config/copy/copy.snapshot.json`           | one new feature                                                      |
| BK-doc | `docs/deployment/k3s-traefik.md` §7, `docs/deployment/supabase-database.md`, `docs/deployment/k3s-secrets-sops.md`, `apps/cms-api/README.md`                                                                                                                                                                                                                                                                                                                              | 4 edits                                                              |
| BK-e2e | `apps/e2e/tests/Backups.e2e.spec.ts` (new)                                                                                                                                                                                                                                                                                                                                                                                                                                | 1 new                                                                |

## Consequences

- No backup byte is stored on the VPS or in Supabase. The bucket size has a written upper bound (section 3 step 6).
- A stolen cms-api read key can list and read the encrypted dumps, but cannot change or delete them. A stolen job key cannot delete them.
- A stolen owner session alone cannot download anything: it also needs the password and a current 2FA code. Each link is audited.
- Restores gain one step (`age -d`). Losing the age private key makes every dump useless, so the owner keeps two offline copies (guide).
- cms-api gains the official S3 SDK, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, and the dev dependency `testcontainers` (Q-BK7). The feature is optional: without the six keys nothing changes.
- The page shows only what the bucket holds. Whether the nightly job runs is still the deploy repo's concern. The stale banner makes a broken job visible to the owner.

## Open questions (all answered by the user on 2026-10-27)

- **Q-BK1** Who may download? **Answer (user, 2026-10-27): the owner only, as a hard check that no role grant can open.** No `database_backups` permission subject exists.
- **Q-BK2** Credentials for the bucket? **Answer (user, 2026-10-27): two separate keys.** The job uploads with a write-only key that cannot delete. cms-api uses its own read-only R2 token (list and get) on the same bucket.
- **Q-BK3** Download existing nightly dumps or dump on demand? **Answer (user, 2026-10-27): list and download the existing dumps only. There is no "back up now" button.**
- **Q-BK4** Retention? **Answer (user, 2026-10-27): 14 daily + 3 monthly, enforced by bucket lifecycle rules (`daily/` 14 days, `monthly/` 92 days), with a job key that cannot delete.**
- **Q-BK5** Which bucket provider? **Answer (user, 2026-10-27): Cloudflare R2.** The user already uses Cloudflare for Turnstile and agrees to use R2 for this storage. R2 presigned URLs work only on the S3 API host, not on a custom domain (section 2).
- **Q-BK6** Encrypt the dumps before upload? **Answer (user, 2026-10-27): yes, with `age`.** Only the public recipient is on the VPS. The owner keeps the private key offline in two copies, and downloads are ciphertext that the owner decrypts locally.
- **Q-BK7** New dependencies (SPEC §13 "Ask first")? **Answer (user, 2026-10-27): the official S3 SDK in cms-api, `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, plus `testcontainers` as a dev dependency and an S3 stand-in container image for the adapter suite.** The builder picks a maintained image and records the image and its tag in the unit record. The user first deferred this question ("để sau hãy làm") and answered it later the same day.
