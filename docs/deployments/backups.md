# Backups: off-site bucket, nightly job, restore drill

Design and decisions: D20 ([backups flow](../flows/backups/SPEC.md)) and ADR 0013 (nothing on the cluster's disks, encrypted, a bucket that holds at most about 20 objects). Everything here is **not run** (LG-0 item 4) until the first manual job run and the first restore drill (section 6).

What the backup covers: the whole database (accounts, audit logs, `file_library` rows, all content and its migration history). It does **not** contain the uploaded files: they live in Cloudinary (`MEDIA_PROVIDER=cloudinary`); back those up with Cloudinary's own tooling.

## 1. Setup order (owner, then deploy repo)

1. The bucket, its lifecycle rules, the two tokens and the bucket lock rules (section 2).
2. The age key pair on the owner's machine (section 2, step 5).
3. The deploy repo builds the job image (Q-OPS8) and adds the CronJob, the ConfigMap `postgres-backup-config` ([configmaps.md](configmaps.md) section 6) and the Secret `postgres-backup` ([secrets.md](secrets.md)).
4. cms-api gets the read-only token as `BACKUP_STORAGE_*` (section 5).
5. Alerts (deploy repo): the job failed, or no new `daily/` object in 26 hours. The cms-admin Backups page also shows a stale warning after 26 hours.
6. Run the job once by hand, then the restore drill (section 6). Those two runs are the proof.

## 2. Off-site bucket (Cloudflare R2, owner)

1. Create the bucket `<bucket>` with **no public access and no custom domain**. The endpoint is the S3 API host `https://<account-id>.r2.cloudflarestorage.com`, for rclone and for `BACKUP_STORAGE_ENDPOINT`. Presigned download URLs work only on that host, not on a custom domain.
2. Lifecycle rules, expiring objects by prefix: `postgres/daily/` after 14 days, `postgres/monthly/` after 92 days. R2 removes an expired object typically within 24 hours, so a day or two more than 14 daily objects may exist for a short while. If you change `BACKUP_PREFIX`, change the prefixes here.
3. Two API tokens, each limited to this bucket:
   - the **job token**: Object Read & Write. It puts and lists objects. R2 has no write level without delete, so this token can also delete until step 4 is in place.
   - the **cms-api token**: Object Read only (list and get), for `BACKUP_STORAGE_*`.
4. Bucket lock rules: `postgres/daily/` for 14 days and `postgres/monthly/` for 92 days. A lock blocks deleting or overwriting an object for its period, whoever asks, and takes precedence over the lifecycle rule, which then deletes the object when the period ends. This is what makes "the job key cannot delete" true. Prove it once: a `rclone deletefile` with the job key on a fresh object must fail (blocker B7, Q-OPS6).
5. Generate an age key pair on the owner's machine: `age-keygen -o abyss-backup.agekey`. Only the public key (`age1...`) goes to the job, as `BACKUP_AGE_RECIPIENT`. **The private key is kept offline in two copies and is never in the cluster.** Losing it makes every dump unreadable.

Object keys: `<prefix>daily/abyss-<YYYYMMDDTHHMMSSZ>.dump.age` and `<prefix>monthly/abyss-<YYYYMMDDTHHMMSSZ>.dump.age`, with `<prefix>` `postgres/` by default.

## 3. Nightly CronJob

One stream, no temporary file, no volume: `pg_dump -Fc | age | rclone rcat`. The job pod has no writable volume besides the read-only CA mount. The image (built in the deploy repo, Q-OPS8) needs `pg_dump` and `psql` 17, `age`, `rclone` and a shell with `pipefail` (check `sh -c 'set -o pipefail'`; Alpine's busybox `sh` supports it).

The job connects as the backup role, with the host, port and database of `cms-api-config` and, when TLS is on, `PGSSLMODE=verify-full` with the mounted CA ([database.md](database.md) section 4).

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: <ns>
spec:
  schedule: '15 2 * * *' # UTC
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      template:
        spec:
          restartPolicy: Never
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000 }
          containers:
            - name: dump
              image: <image with pg_dump 17, psql, age, rclone>
              command: ['sh', '-c']
              args:
                - |
                  set -eu -o pipefail
                  export PGPASSWORD="$$DB_PASSWORD"
                  conn="-h $$DB_HOST -p $$DB_PORT -U $$DB_USERNAME -d $$DB_NAME"
                  stamp="$$(date -u +%Y%m%dT%H%M%SZ)"
                  name="abyss-$${stamp}.dump.age"
                  daily="offsite:$${BACKUP_BUCKET}/$${BACKUP_PREFIX}daily/$${name}"
                  status=0

                  size="$$(psql $$conn -Atc 'select pg_database_size(current_database())')"
                  echo "database size: $${size} bytes"
                  if [ "$$size" -gt "$$BACKUP_MAX_DATABASE_BYTES" ]; then echo "WARN database over limit"; status=1; fi

                  pg_dump $$conn -Fc -n public -n content \
                    | age -r "$$BACKUP_AGE_RECIPIENT" \
                    | rclone rcat \
                        --header-upload "Content-Type: application/octet-stream" \
                        --header-upload "Content-Disposition: attachment; filename=\"$${name}\"" \
                        "$$daily"

                  dump="$$(rclone size --json "$$daily" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
                  echo "dump size: $${dump} bytes"
                  if [ "$$dump" -gt "$$BACKUP_MAX_DUMP_BYTES" ]; then echo "WARN dump over limit"; status=1; fi

                  if [ "$$(date -u +%d)" = 01 ]; then
                    rclone copyto "$$daily" "offsite:$${BACKUP_BUCKET}/$${BACKUP_PREFIX}monthly/$${name}"
                  fi
                  exit "$$status"
              envFrom:
                - configMapRef: { name: postgres-backup-config }
                - secretRef: { name: postgres-backup }
              volumeMounts: # only with TLS
                - { name: database-ca, mountPath: /etc/abyss/database-ca, readOnly: true }
              resources:
                requests: { cpu: 50m, memory: 128Mi }
                limits: { memory: 384Mi }
              securityContext:
                allowPrivilegeEscalation: false
                capabilities: { drop: [ALL] }
          volumes: # only with TLS
            - name: database-ca
              configMap: { name: database-ca }
```

- `$$` escapes `$` for a GitOps tool that substitutes `${...}` variables in manifests. Without such substitution, write plain `$`; or keep this manifest out of the substitution. Check the rendered manifest before the first apply.
- `-n public -n content`: the app's two schemas only; the backup role cannot read a managed service's own schemas, and the dump must not contain them.
- `set -o pipefail` makes a failed `pg_dump` fail the job. An S3 multipart upload becomes visible only when it completes, so a half-written dump is never listed.
- The size checks warn, keep the dump and exit 1 at the end, so the failure alert fires and a backup still exists: before the dump, the database size against `BACKUP_MAX_DATABASE_BYTES` (about 80 percent of a plan's size limit); after the upload, the object size against `BACKUP_MAX_DUMP_BYTES` (200000000).
- On the first day of each month (UTC) the job also copies that night's object to `monthly/` with a server-side copy; the bytes never pass through the cluster.
- Space bound: about 14 to 16 daily plus 3 to 4 monthly objects. At the 200 MB cap the bucket stays under 4 GB.
- If the pod is killed for memory, lower `RCLONE_S3_UPLOAD_CONCURRENCY` or `RCLONE_S3_CHUNK_SIZE` in `postgres-backup-config` before raising the limit.

## 4. Restore drill

A backup that was never restored is not a backup. Run this at setup and then every quarter, into a **scratch** database on a throwaway server of the same major version (a local `postgres:17` container works), never over production. The drill proves the dump.

```
# 0. decrypt the dump with the offline private key
age -d -i abyss-backup.agekey abyss-<stamp>.dump.age > abyss-<stamp>.dump
# 1. on the scratch server: run scripts/db/database-roles.sql (hosting=self_managed) once,
#    then, as the superuser, create the scratch database owned by the migrator
createdb -h <db-host> -U <superuser> -O abyss_migrator abyss_restore
# 2. restore as the migrator (stop at the first error); the dump's grants for abyss_api come with it
pg_restore -h <db-host> -U abyss_migrator -d abyss_restore --no-owner --exit-on-error abyss-<stamp>.dump
# 3. the schema is complete: the migration commands find nothing pending
#    (run the cms-api image with DB_NAME=abyss_restore and the migrator credentials)
npm run --silent deploy:migrate        # expect exit 0, "No pending ..." twice
# 4. spot-check data
psql -h <db-host> -U abyss_migrator -d abyss_restore -c 'select count(*) from accounts' \
     -c 'select count(*) from content._migrations'
# 5. drop it, and delete the decrypted dump
dropdb -h <db-host> -U <superuser> abyss_restore
rm abyss-<stamp>.dump
```

Record the date, the dump used and the time it took. The decrypted dump holds the whole database: delete it when the drill ends.

**Real disaster:** set up the roles on the target server first ([database.md](database.md) DB-1 to DB-4), restore into the new database (`pg_restore --no-owner -n public -n content` as the migration role), point `DB_HOST` and `DB_NAME` at it, roll out (the init container confirms the schema is current), then check `GET /api/v1/health/ready`.

## 5. Backup download (cms-admin)

The owner can list and download the encrypted dumps from the Backups page in cms-admin. cms-api never runs `pg_dump` and never proxies the bytes: it lists the bucket and hands out a presigned URL valid for 60 seconds.

- Keys: all six `BACKUP_STORAGE_*` keys or none. `BACKUP_STORAGE_ENDPOINT`, `BACKUP_STORAGE_REGION`, `BACKUP_STORAGE_BUCKET` and `BACKUP_STORAGE_PREFIX` go in `cms-api-config`; `BACKUP_STORAGE_ACCESS_KEY_ID` and `BACKUP_STORAGE_SECRET_ACCESS_KEY` go in `cms-api-secrets`. With none set the page is off and the endpoints answer `404 BACKUPS_NOT_CONFIGURED`.
- The key pair is the read-only bucket token (list and get, this bucket only), never the job's write token.
- Only the owner can use the page, and every link needs the owner's password plus a 2FA code; the owner must have 2FA on. Each link is audited (`backup.download_link_created`); the URL is never logged.
- The file is ciphertext: decrypt it locally with `age -d -i <key file>`. The bucket needs no CORS rule (the browser navigates to the URL).

## 6. First proof

1. Trigger the job by hand: `kubectl -n <ns> create job --from=cronjob/postgres-backup backup-manual-1`. The object appears in the bucket and on the admin Backups page.
2. A delete attempt with the job key fails (section 2, step 4).
3. Run the restore drill once (section 4).
