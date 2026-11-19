# DevOps runbook

The entry point for deploying Abyss: who owns what, what still blocks the first production deploy, the order of the first install, the routine procedures, and what is not proven yet. Each step links to the topic page that holds the details; this page does not repeat them.

| Topic                                           | Page                           |
| ----------------------------------------------- | ------------------------------ |
| CI workflows, images, the deploy repo contract  | [ci-cd.md](ci-cd.md)           |
| Workloads, probes, init container, replicas     | [kubernetes.md](kubernetes.md) |
| Hosts, routes, upload timeouts, client IP, CORS | [traefik.md](traefik.md)       |
| ConfigMaps, env contract, build args            | [configmaps.md](configmaps.md) |
| Secrets, encryption, rotation                   | [secrets.md](secrets.md)       |
| PostgreSQL, roles, TLS                          | [database.md](database.md)     |
| Off-site bucket, nightly job, restore drill     | [backups.md](backups.md)       |
| Versions, deploy order, checks, rollback        | [release.md](release.md)       |
| Web service (FE): build, env, routing, checks   | [web.md](web.md)               |

Decisions behind them: D7, D14, D17 ([global decisions](../global/DECISIONS.md)), D19 ([cms-api](../apps/cms-api/SPEC.md)), D20 ([backups flow](../flows/backups/SPEC.md)), ADR 0012, 0013, 0014; the launch gate: [global flows](../global/FLOW.md) "Launch gate".

Status marks:

| Mark                 | Meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **ready**            | exists in this repo and has been checked (tests, smoke stack or CI scripts)                   |
| **not run**          | written from docs or design and never run; the step named after it is what proves it          |
| **deploy repo**      | owned by the deploy repo; this repo only states what it must provide; not verified here       |
| **verified earlier** | verified by the owner on an earlier deployment with the same contract; not run from this repo |

> **Never public before the launch gate.** No public DNS record, public ingress or announced URL until phase LG has passed and the owner has approved the launch in writing. The first production deploy makes the site public (Q-OPS4), so it waits for checkpoint LG-E (the live check on a local k3s cluster with the production config, reachable only from the test machine) and the written approval.

## 1. Who owns what

| Concern                                                                  | Owner                       | Where                                                               |
| ------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------- |
| Source code, Dockerfiles, tests                                          | this repo                   | `apps/*`                                                            |
| CI: checks, image build, push to GHCR, image tag bump in the deploy repo | this repo                   | `.github/workflows/`, `.github/scripts/` ([ci-cd.md](ci-cd.md))     |
| Database roles script                                                    | this repo                   | `scripts/db/database-roles.sql` (**ready**)                         |
| GitOps objects, Kubernetes manifests, encrypted Secrets, Traefik config  | deploy repo `<deploy-repo>` | its own layout (**deploy repo**)                                    |
| Nightly backup job image and script                                      | this repo                   | the cms-api image, `apps/cms-api/backup/` (ADR 0025)                |
| Nightly backup CronJob manifest                                          | deploy repo                 | contract in [backups.md](backups.md)                                |
| Database service, backup bucket, DNS and Turnstile, Cloudinary, SMTP     | the owner (dashboards)      | [database.md](database.md) DB-1, [backups.md](backups.md) section 2 |

`<deploy-repo>` is the same deploy repo as the owner's earlier deployment. It stays a placeholder until its `owner/name` is written down (Q-OPS1); the same value goes into the GitHub variable `DEPLOYMENT_REPO`.

## 2. Open blockers before the first production deploy

| #   | Blocker                                                                                                                                                  | Why it blocks                                                  | Resolved by                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B2  | The roles script has not run on the production database: `abyss_api` has no grants until DB-3 runs, and `abyss_backup` is created by DB-3.               | The API cannot run as `abyss_api`; the backup job has no role. | [database.md](database.md) DB-3 to DB-6 (LG-db-7), or mode A as an accepted risk (ADR 0012 §8, Q-OPS2). |
| B4  | This repo's CI publish path has not run against GitHub (LG-0 item 3). The contract is **verified earlier**.                                              | No image exists in GHCR yet; the bump has never pushed.        | [ci-cd.md](ci-cd.md) section 5, step 8.                                                                 |
| B7  | The rule "the job key can write but cannot delete" (ADR 0013) is not proven: the bucket's "Object Read & Write" token level most likely includes delete. | A stolen job key could wipe every dump.                        | The bucket lock rules and a failed delete attempt ([backups.md](backups.md) section 2, step 4; Q-OPS6). |

Solved, kept for reference: B1 (the DB TLS keys exist in the API, the init container and `prisma migrate deploy`, from commit b902be2), B3 (the init container needs only `DB_*` and `NODE_ENV`, from commit 5ca8999), B5 (PostgreSQL 17), B6 (the final backup job text). Deploy images built from those commits or later.

## 3. Owner checks before the first deploy

1. **Bucket lock (B7, Q-OPS6):** set the bucket lock rules, then prove that a delete attempt with the job key fails ([backups.md](backups.md) section 2). The owner reports it done (2026-11-13); B7 closes when the evidence is recorded under LG-0 item 10 (`tasks/todo.md`). The job token and the cms-api read-only key go into the production Secrets only, never the local cluster.
2. **Database TLS (DB-2):** `psql ... sslmode=verify-full sslrootcert=ca.crt ... -c 'select version()'` succeeds and shows PostgreSQL 17 ([database.md](database.md)).
3. **No private production deploy (Q-OPS4):** `<domain>` and `admin.<domain>` are public from the first production deploy; deploy production only after LG-E has passed and the owner has approved the launch in writing.

## 4. First install, in order

1. Blockers B2 and B4 solved, or B2 accepted as mode A in writing (section 2).
2. CI first run green on `staging` ([ci-cd.md](ci-cd.md) section 5, step 8).
3. Cluster: first the local k3s cluster for LG-3 (k3d and its registry, [local-registry.md](local-registry.md); ingress ports bound to `127.0.0.1` only, no tunnel; images, hostnames, database and secrets per Q-OPS10 and Q-OPS11), then production after the launch approval. Each: the namespace, `ghcr-pull` (production), Traefik ([kubernetes.md](kubernetes.md) section 1, [traefik.md](traefik.md)), the manifests of the deploy repo (production: the GitOps tool on `<deploy-repo>` branch `main`), and the decryption key ([secrets.md](secrets.md) section 3). **Deploy repo.**
4. Database: DB-1 and DB-2, then DB-3 and DB-4 for mode B ([database.md](database.md)).
5. Backup bucket, tokens and age key ([backups.md](backups.md) sections 1 and 2).
6. ConfigMaps and Secrets for the cluster, with the production key names on both ([configmaps.md](configmaps.md), [secrets.md](secrets.md)), with `OWNER_SETUP_TOKEN` (`openssl rand -base64 32`) for the first install.
7. The GitOps tool applies the manifests. Check that every sync is healthy, then `kubectl -n <ns> get pods`: the cms-api pod goes `Init:0/1`, then `Running`, and `kubectl -n <ns> logs <pod> -c migrate` lists the applied migrations.
8. DB-6, then DB-7.
9. First owner (section 5.1).
10. First backup proof ([backups.md](backups.md) section 6).
11. Checks after a release ([release.md](release.md) section 4). Before the hand-over, the local cluster has no cms-api route on `<domain>` and runs a web image built from a clean commit ([patch-web-0.2.0.md](../apps/web/patch-web-0.2.0.md) items 5 to 7). Hand the local cluster over to LG-3 (the live check with the production config; it has no backup job, Q-OPS6, so steps 5 and 10 are for production only). After LG-E has passed and the owner has approved the launch in writing: remove the hosts-file entries and the local CA trust that point the production hostnames at the local cluster (Q-OPS10), stop the local cluster, tag the approved commit ([release.md](release.md) section 3) and repeat steps 3 to 10 for production on `main`; the site is public from then on (Q-OPS4). Then hand over to LG-4.

## 5. Procedures

Releases and rollback: [release.md](release.md). Secret rotation: [secrets.md](secrets.md) section 7.

### 5.1 First owner

The owner is created once, through the admin setup page (primary) or the `owner:bootstrap` CLI (fallback); neither is part of the init container (D1, [owner-setup flow](../flows/owner-setup/FLOW.md)). The setup page is open only while `OWNER_SETUP_TOKEN` is set and no owner exists.

1. Generate a token (at least 32 bytes): `openssl rand -base64 32`.
2. Add it to `cms-api-secrets` as `OWNER_SETUP_TOKEN`, apply, and roll out cms-api.
3. Open `https://admin.<domain>/setup`, enter the token, the owner email, an optional display name and a password (12 characters or more). Sign in on the login page, then turn on two-factor in Security settings.
4. Remove `OWNER_SETUP_TOKEN` from the Secret, apply and restart. cms-api logs a warning at boot while the token is still set and an owner exists.

A wrong token answers 401 and is audited (`owner.setup_rejected`); the route is throttled to 5 submits per 15 minutes per client IP. The token goes only in the request body, never in a URL, and is never a build arg.

Fallback when the setup page is not usable (the password is typed at a hidden prompt; `--password-stdin` pipes it):

```sh
kubectl -n <ns> exec -it deploy/cms-api -c cms-api -- \
  env OWNER_EMAIL=owner@<domain> npm run owner:bootstrap
```

A second owner is refused either way. Break-glass for a lost second factor: `npm run owner:reset-2fa -- --email <email>`, the same way.

### 5.2 Reviewer switch off or on

Design: D2a, ADR 0014. The switch is the cms-api key `REVIEWER_FEATURE_ENABLED`, a runtime env: a config change plus a restart, never a new image. Web has no reviewer button and no `/status` page any more (ADR 0018); the owner manages reviewer access on the cms-admin Reviewer page. Production runs with `false`.

Off:

1. Owner, in cms-admin: Reviewer page, switch reviewer access off. This revokes live reviewer sessions and writes the audit row.
2. `cms-api-config`: `REVIEWER_FEATURE_ENABLED: "false"`. Restart cms-api.
3. Check: `GET https://admin.<domain>/api/v1/reviewer/status` answers `404` with `REVIEWER_FEATURE_OFF`; the cms-api start log shows the switch off and "Reviewer cleanup not started".

On:

1. Set `REVIEWER_FEATURE_ENABLED: "true"` and restart cms-api.
2. Owner, in cms-admin: switch reviewer access on (the toggle stayed off).
3. Check: `GET https://admin.<domain>/api/v1/reviewer/status` answers `200 { "enabled": true }`.

Reviewer access is open only when the switch is `true`, the owner toggle is on, and Turnstile plus `OTP_PEPPER` are configured.

## 6. Not proven yet

| Item                                                                                                                                                         | Proven by                                                             | Recorded under    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------- |
| CI publish and the deploy repo bump (contract verified earlier)                                                                                              | [ci-cd.md](ci-cd.md) section 5, step 8                                | LG-0 item 3       |
| The GitOps tool applies the bump; `$` substitution is safe for the job, and the rendered CronJob carries the schedule and zone of `postgres-backup-schedule` | the rendered manifests, then the first production rollout (section 4) | LG-0 item 4, LG-4 |
| GHCR pull from the cluster                                                                                                                                   | the pull test in [kubernetes.md](kubernetes.md) section 1             | LG-0 item 4       |
| DB TLS `verify-full` from cms-api                                                                                                                            | DB-2, then DB-7                                                       | LG-db-7           |
| Roles and grants on the production database                                                                                                                  | DB-3 and the DB-6 self-check                                          | LG-db-7           |
| The database's data API closed                                                                                                                               | DB-7                                                                  | LG-db-7           |
| Connection budget                                                                                                                                            | [database.md](database.md) section 8                                  | LG-0 item 4       |
| Real client IP through Cloudflare and Traefik                                                                                                                | [release.md](release.md) section 4, check 5; success criterion 8      | LG-0 item 4, LG-4 |
| Backup job, bucket tokens, lifecycle, lock                                                                                                                   | [backups.md](backups.md) section 6                                    | LG-0 item 4       |
| Restore drill                                                                                                                                                | [backups.md](backups.md) section 4                                    | LG-0 item 4       |
| Rollback by revert                                                                                                                                           | one revert in production after the second release                     | LG-0 item 4       |
| `readOnlyRootFilesystem` on cms-admin                                                                                                                        | [kubernetes.md](kubernetes.md) section 5                              | LG-0 item 4       |

## 7. Open owner decisions

Each question has a recommended answer. When the owner answers, the planner records it here and in the task files.

- **Q-OPS1** Answered in part: the same deploy repo as the earlier setup. Still open: its `owner/name`, for this page only, because CI reads it from `DEPLOYMENT_REPO`.
- **Q-OPS2** Database roles (B2). Recommended: launch in mode B. Trade-off: mode A skips DB-3 to DB-6 but keeps the shared migration account in the API (ADR 0012 §8) and needs the owner's written acceptance.
- **Q-OPS3** Answered: direct push, as built; no required reviewers on `production` in v1.
- **Q-OPS4** Answered (owner, 2026-11-13): public after deploy. The first production deploy is public, so it comes after LG-E and the written approval; the live check runs on a local k3s cluster with the production config (owner, 2026-11-13; section 4, step 11). The question was: how does the first production deploy stay private until the launch approval? Recommended then: Cloudflare Access on `<domain>` and `admin.<domain>`, allowing only the owner's and the testers' e-mails, removed at launch. Trade-off: the alternative (no DNS record, a hosts-file entry on the testers' machines) needs no setup, but TLS and the Cloudflare client-IP header are then not tested the way they will run in production.
- **Q-OPS5** A git tag or GitHub Release per production deploy? Decided in [ADR 0016](../adr/0016-tag-driven-release-ci.md): yes, a repo tag `v<x.y.z>` and one `<app>@<x.y.z>` per bumped app, made by the `release-tag` skill; the tag starts the release run.
- **Q-OPS6** Answered (owner, 2026-11-13): done; the backup secrets are applied in production only. The question was: delete protection for the backup job key (B7). Recommended then: the bucket lock rules on `postgres/daily/` (14 days) and `postgres/monthly/` (92 days), proven by a delete attempt with the job key. Without it, a stolen job key can wipe the backups.
- **Q-OPS7** Answered: GHCR packages private, with the `ghcr-pull` Secret; the old package of the earlier site is deleted only after the owner confirms.
- **Q-OPS8** Answered (2026-11-16, [ADR 0025](../adr/0025-backup-job-image.md)): the job runs the cms-api image, which carries the client tools and the script; no image is built in the deploy repo. The question was: where is the backup job image built? Recommended then: the deploy repo, as a small Alpine image with `postgresql17-client`, `age` and `rclone`, pinned by digest.
- **Q-OPS9** Which namespace? Recommended: `abyss` on every cluster.
- **Q-OPS10** Which images and hostnames does the local cluster run for LG-3? Recommended: images built by `local-registry-push.sh` from the commit to be released, with the production build args (`APP_ENV=production`, the production `VITE_API_BASE_URL` and the Turnstile site key of web and cms-admin), served under the production hostnames through hosts-file entries on the test machine and a local CA (mkcert) trusted there; the release is tagged from that commit only after the approval. Trade-off: the origins, cookies, CSP and the production Turnstile widgets then match production with no change, but the images are arm64 builds of the same commit, not the GHCR `linux/amd64` bytes (LG-4 checks those), and the hosts entries must be removed before the production deploy. Tagging first and pulling the GHCR images gives the same bytes, but the tag run bumps the deploy repo `main` (production goes public unless its sync is suspended) and needs amd64 emulation on an arm64 machine. Local names such as `abyss.localhost` need other build args, other CORS and cookie origins, and those names added to both Turnstile widgets until LG-E ends.
- **Q-OPS11** Which database and secrets does the local cluster use? Recommended: its own PostgreSQL 17 with TLS and the mode B roles, own values for every secret that guards data (database passwords, signing keys, `OTP_PEPPER`, `OWNER_SETUP_TOKEN`), the production Turnstile keys, and the real Cloudinary account with every test file deleted. Trade-off: the production database never holds the throwaway admin or write-probe data; DB-7 on it is shown only after the production deploy (LG-4).
- **Q-OPS12** What happens when the read-only check after the production deploy (LG-4) finds a critical or high gap on the public site? Recommended: the owner at once puts a Cloudflare Access rule (owner e-mail only) on the affected host, or both; the fix is built, re-checked on the local cluster, released, LG-4's rows run again, then the rule is removed. Trade-off: there is no earlier release to roll back to; removing the DNS records also works but locks the owner out of cms-admin too.
