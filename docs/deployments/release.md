# Release: versions, order, checks, rollback

How a release reaches an environment and how to undo it. The public API prefix `/api/v1` and the application code are unchanged by anything here: it is deploy-side configuration and order of steps. Placeholders: `<domain>`, `<ns>`, `<APP_IMAGE_TAG>`, `<pod>`. Never write real hosts or secrets into this repo.

## 1. Required components and versions

Every version is a stable or LTS release. Never deploy beta, RC, nightly or `latest` tags.

| Component          | Version                                                                          | Source of the pin                                                     | Notes                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Node.js (runtime)  | 24.x LTS, image `node:24.18-alpine`                                              | `ARG NODE_IMAGE` in `apps/{cms-api,web,cms-admin}/Dockerfile`         | image tag pinned to minor; patch updates arrive with the tag bump                                       |
| Node.js (build)    | `>=24.0.0`                                                                       | root `package.json` `engines`                                         | resolves to 24 LTS in CI; keep CI on the 24 LTS line                                                    |
| pnpm               | 11.5.2                                                                           | root `package.json` `packageManager`                                  | build time only                                                                                         |
| Turbo              | 2.11.9                                                                           | `ARG TURBO_VERSION` in the Dockerfiles                                | build time only                                                                                         |
| PostgreSQL         | 17 (current minor of the 17 line)                                                | `postgres:17-alpine` in compose files; `pg_dump 17` in the backup job | [database.md](database.md)                                                                              |
| Traefik            | v3.6 (3.6.x) or a later v3                                                       | `traefik:v3.6` in `docker-compose.smoke.yml`                          | [traefik.md](traefik.md)                                                                                |
| Kubernetes         | a release of a stable channel                                                    | not pinned here (the deploy repo pins it)                             | never `latest` or `testing`                                                                             |
| nginx (cms-admin)  | `nginxinc/nginx-unprivileged:1.29-alpine`                                        | `ARG NGINX_IMAGE` in `apps/cms-admin/Dockerfile`                      | accepted exception (owner decision): 1.29 is on the nginx mainline branch, not the stable branch (1.28) |
| Container registry | GHCR, `ghcr.io/hungnh1812dev/project-me/{cms-api,web,cms-admin}:<APP_IMAGE_TAG>` | [ci-cd.md](ci-cd.md)                                                  | tag per release; production never uses `latest`                                                         |

Other tools the deploy repo needs, at stable releases chosen there: a GitOps tool that applies the deploy repo, SOPS or sealed-secrets ([secrets.md](secrets.md)), and `age` and `rclone` in the backup job image ([backups.md](backups.md)). Mailpit is a dev and smoke component only.

## 2. Deploy order

Recommended order of application (a deploy repo decision): config and Secrets, then cms-api, then web and cms-admin, so a new web never waits on an API that is still migrating.

1. **Images.** The publish job pushes the changed images and bumps `APP_IMAGE_TAG` in the deploy repo ([ci-cd.md](ci-cd.md), "Publish").
2. **Cluster and proxy config** (once, then on change): Traefik with `externalTrafficPolicy: Local`, `readTimeout: 5m` and the HTTPS redirect; the `api-inflight` and `upload-close` middlewares and the `api-upload` route next to `/api` ([traefik.md](traefik.md)).
3. **Config and Secrets:** `cms-api-config`, `database-ca`, `cms-api-secrets`, `cms-api-migrate-db`, `postgres-backup` ([configmaps.md](configmaps.md), [secrets.md](secrets.md)). Restart pods after any change.
4. **Database and roles**, first install only ([database.md](database.md) DB-1 to DB-6).
5. **Migrations:** the cms-api init container runs `npm run deploy:migrate`; it applies committed migrations only and is safe to re-run ([kubernetes.md](kubernetes.md) section 3).
6. **Rollout:** `RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0`, one replica per app.

When a manifest change and an image change need each other (for example a new port key and the image that reads it), they reach the environment branch in two commits (the manifest merge, then CI's tag bump), and the new pods fail until both are there. The old pods keep serving meanwhile. Merge the manifest change first, keep the branch's `APP_IMAGE_TAG` lines (CI owns them), then run the image build; never delete the old pods or ReplicaSet while a rollout waits.

## 3. A normal release

1. Merge into `staging` (or `main`). CI publishes the changed apps and pushes one bump commit per app into the deploy repo.
2. The GitOps tool applies the commit on its next interval (or reconcile it at once).
3. cms-api: the new pod's init container runs `deploy:migrate`. The old pod keeps serving (`maxUnavailable: 0`); the new main container starts only after the init container exits 0, and the old pod stops when the new one is ready.
4. web and cms-admin roll the same way, after cms-api is ready when the deploy repo applies the recommended order.
5. Run the checks of section 4.

Rules for every release:

- Migrations are forward only: Prisma `migrate deploy` and `content:migrate` have no down step. During a rollout the old pod runs against the new schema, so a destructive change (dropping or renaming a column, a table or a content type) needs two releases: expand first, contract later.
- A new content type takes effect only through a committed generated migration; CI fails a missing one.
- A change to a build-time value ([configmaps.md](configmaps.md) sections 4 and 5) needs a new image: push a commit, or re-run the publish.
- The three apps can sit on different tags; each is bumped only when its own image changed.

## 4. Checks after a release

1. The cms-api pod goes `Init:0/1`, then `Running`; `kubectl -n <ns> logs <pod> -c migrate` ends with "No pending ..." or the applied list. `kubectl -n <ns> get pods` shows every pod `Running`, `READY 1/1`, restarts not climbing.
2. `kubectl -n <ns> rollout status deploy/cms-api` (then `web`, `cms-admin`).
3. `curl -fsS https://<domain>/api/v1/health/ready` returns `{"status":"ok"}`, answered by cms-api.
4. `https://<domain>/` and `https://admin.<domain>/` load, and the browser console shows no CSP violations.
5. Sign in as the owner. The Traefik access log shows real client IPs, not node IPs ([traefik.md](traefik.md) section 3).
6. After an upload change: a media upload over a throttled link that takes more than 1 minute completes; `POST /api/v1/media` without a session returns 401 (not 502) with `Connection: close`, and a normal `GET /api/v1/...` answer carries no `Connection: close`.
7. The last nightly dump exists off-site, and the last restore drill is younger than three months ([backups.md](backups.md)).

## 5. Rollback and failure handling

| Situation                                                     | What to do                                                                                                                                                                                                                                                                                                                                                           | Status                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Bad app release, schema compatible                            | In the deploy repo, `git revert <bump commit>`, or set `APP_IMAGE_TAG` back to the previous `<branch>-<sha7>`, and push; the GitOps tool rolls back. Do not use `kubectl rollout undo`: the GitOps tool would put the new tag back.                                                                                                                                  | **not run**                        |
| A release needed a manifest change and an image change        | Revert both the tag commits and the manifest merge on the environment branch, then reconcile. Reverting only one leaves the broken mix of section 2.                                                                                                                                                                                                                 | **not run**                        |
| Stop the deploy repo from changing anything                   | Suspend the GitOps tool's sync of the app; resume it later. A CI bump waits in git meanwhile.                                                                                                                                                                                                                                                                        | **not run**                        |
| Init container fails (`Init:Error` / `Init:CrashLoopBackOff`) | The old pod keeps serving. Read the cause with `kubectl -n <ns> logs <pod> -c migrate`. A config error lists the key names. A wrong DB password: fix the Secret. A failed migration: fix forward with a new commit, or revert the bump.                                                                                                                              | ready (checked on the smoke stack) |
| A Prisma migration failed halfway                             | Prisma records it as failed and refuses every later `migrate deploy`. Repair the database by hand as the migrator, then run `npx prisma migrate resolve --rolled-back <migration>` (or `--applied`) with the migrator credentials in a one-off pod from the same image, then the next rollout. Take the command from the Prisma 7 docs at the time; never rehearsed. | **not run**                        |
| Release changed the schema and must be undone                 | There is no down migration. Fix forward, or restore the latest dump into a new database ([backups.md](backups.md) section 4), point `DB_NAME` / `DB_HOST` at it and roll out the old tag. Data written since the dump is lost.                                                                                                                                       | **not run**                        |
| Proxy config (timeouts, `api-upload`, middlewares)            | Revert the manifests in the deploy repo. Removing `api-upload` only returns uploads to the `/api` route; without `readTimeout: 5m` slow uploads are cut at the Traefik default.                                                                                                                                                                                      | **not run**                        |
| Database paused or unreachable                                | Resume it at the provider, then `kubectl -n <ns> rollout restart deploy/cms-api` if readiness does not recover by itself.                                                                                                                                                                                                                                            | **not run**                        |
| Secret leaked                                                 | Rotate per [secrets.md](secrets.md) section 7, then the age key if it was the cause.                                                                                                                                                                                                                                                                                 | runbook                            |
