# DevOps patch: cms-api, repo version 0.2.0

What the deploy repo must change for cms-api, compared with the 0.1.0 setup. The nightly backup job now runs the cms-api image, which carries `pg_dump`, `psql`, `age`, `rclone` and the script ([ADR 0025](../../adr/0025-backup-job-image.md), [backups flow](../../flows/backups/SPEC.md) BK-6). No image is built in the deploy repo.

| Item                 | Deploy repo object                          | Change                                                                                                                                                                                                                                      | Target state                                               |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Backup CronJob    | `postgres-backup` CronJob                   | `image` to `ghcr.io/hungnh1812dev/project-me/cms-api:<cms-api version>`; `command` to `['sh', '/app/backup/nightly-backup.sh']`, replacing the inline `sh -c` script (and its `$$` escapes). Schedule, security context and resources stay. | [backups.md](../../deployments/backups.md) section 3       |
| 2. Same tag          | CronJob and `cms-api-sync-overlay.yaml`     | the CronJob's image tag is the `APP_IMAGE_TAG` of `cms-api-sync-overlay.yaml` (the cms-api Deployment's tag), so one bump moves both.                                                                                                       | [ci-cd.md](../../deployments/ci-cd.md) section 4           |
| 3. ConfigMap, Secret | `postgres-backup-config`, `postgres-backup` | no change: same keys.                                                                                                                                                                                                                       | [configmaps.md](../../deployments/configmaps.md) section 6 |

## Order

1. Release cms-api 0.2.0 and let the deploy repo bump `APP_IMAGE_TAG`.
2. Change the CronJob (items 1 and 2) to that tag.
3. Run the job once by hand and check the new object ([backups.md](../../deployments/backups.md) section 6).

## Rollback

Put the previous CronJob manifest back (the earlier image and inline script). A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
