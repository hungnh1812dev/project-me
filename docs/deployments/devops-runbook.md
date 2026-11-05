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

Decisions behind them: D7, D14, D17 ([global decisions](../global/DECISIONS.md)), D19 ([cms-api](../apps/cms-api/SPEC.md)), D20 ([backups flow](../flows/backups/SPEC.md)), ADR 0012, 0013, 0014; the launch gate: [global flows](../global/FLOW.md) "Launch gate".

Status marks:

| Mark                 | Meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **ready**            | exists in this repo and has been checked (tests, smoke stack or CI scripts)                   |
| **not run**          | written from docs or design and never run; the step named after it is what proves it          |
| **deploy repo**      | owned by the deploy repo; this repo only states what it must provide; not verified here       |
| **verified earlier** | verified by the owner on an earlier deployment with the same contract; not run from this repo |

> **Never public before the launch gate.** No public DNS record, public ingress or announced URL until phase LG has passed and the owner has approved the launch in writing. The first production deploy is a private one (Q-OPS4).

## 1. Who owns what

| Concern                                                                  | Owner                       | Where                                                               |
| ------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------- |
| Source code, Dockerfiles, tests                                          | this repo                   | `apps/*`                                                            |
| CI: checks, image build, push to GHCR, image tag bump in the deploy repo | this repo                   | `.github/workflows/`, `.github/scripts/` ([ci-cd.md](ci-cd.md))     |
| Database roles script                                                    | this repo                   | `scripts/db/database-roles.sql` (**ready**)                         |
| GitOps objects, Kubernetes manifests, encrypted Secrets, Traefik config  | deploy repo `<deploy-repo>` | its own layout (**deploy repo**)                                    |
| Nightly backup job and its image                                         | deploy repo                 | contract in [backups.md](backups.md)                                |
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

1. **Bucket lock (B7, Q-OPS6):** set the bucket lock rules, then prove that a delete attempt with the job key fails ([backups.md](backups.md) section 2).
2. **Database TLS (DB-2):** `psql ... sslmode=verify-full sslrootcert=ca.crt ... -c 'select version()'` succeeds and shows PostgreSQL 17 ([database.md](database.md)).
3. **Private until launch (Q-OPS4):** decide how `<domain>` and `admin.<domain>` stay private until the launch approval.

## 4. First install, in order

1. Blockers B2 and B4 solved, or B2 accepted as mode A in writing (section 2).
2. CI first run green on `staging` ([ci-cd.md](ci-cd.md) section 5, step 8).
3. Staging cluster: the namespace, `ghcr-pull`, Traefik ([kubernetes.md](kubernetes.md) section 1, [traefik.md](traefik.md)), the GitOps tool on `<deploy-repo>` branch `staging`, and the decryption key ([secrets.md](secrets.md) section 3). **Deploy repo.**
4. Database: DB-1 and DB-2, then DB-3 and DB-4 for mode B ([database.md](database.md)).
5. Backup bucket, tokens and age key ([backups.md](backups.md) sections 1 and 2).
6. ConfigMaps and Secrets for staging ([configmaps.md](configmaps.md), [secrets.md](secrets.md)), with `OWNER_SETUP_TOKEN` (`openssl rand -base64 32`) for the first install.
7. The GitOps tool applies the manifests. Check that every sync is healthy, then `kubectl -n <ns> get pods`: the cms-api pod goes `Init:0/1`, then `Running`, and `kubectl -n <ns> logs <pod> -c migrate` lists the applied migrations.
8. DB-6, then DB-7.
9. First owner (section 5.1).
10. First backup proof ([backups.md](backups.md) section 6).
11. Checks after a release ([release.md](release.md) section 4). Repeat steps 3 to 10 for production on `main`, still private (Q-OPS4). Then hand over to LG-3.

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

| Item                                                                   | Proven by                                                          | Recorded under    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| CI publish and the deploy repo bump (contract verified earlier)        | [ci-cd.md](ci-cd.md) section 5, step 8                             | LG-0 item 3       |
| The GitOps tool applies the bump; `$` substitution is safe for the job | the rendered manifests, then the first staging rollout (section 4) | LG-0 item 4       |
| GHCR pull from the cluster                                             | the pull test in [kubernetes.md](kubernetes.md) section 1          | LG-0 item 4       |
| DB TLS `verify-full` from cms-api                                      | DB-2, then DB-7                                                    | LG-db-7           |
| Roles and grants on the production database                            | DB-3 and the DB-6 self-check                                       | LG-db-7           |
| The database's data API closed                                         | DB-7                                                               | LG-db-7           |
| Connection budget                                                      | [database.md](database.md) section 8                               | LG-0 item 4       |
| Real client IP through Cloudflare and Traefik                          | [release.md](release.md) section 4, check 5; success criterion 8   | LG-0 item 4, LG-3 |
| Backup job, bucket tokens, lifecycle, lock                             | [backups.md](backups.md) section 6                                 | LG-0 item 4       |
| Restore drill                                                          | [backups.md](backups.md) section 4                                 | LG-0 item 4       |
| Rollback by revert                                                     | one revert on staging after the first release                      | LG-0 item 4       |
| `readOnlyRootFilesystem` on cms-admin                                  | [kubernetes.md](kubernetes.md) section 5                           | LG-0 item 4       |

## 7. Open owner decisions

Each question has a recommended answer. When the owner answers, the planner records it here and in the task files.

- **Q-OPS1** Answered in part: the same deploy repo as the earlier setup. Still open: its `owner/name`, for this page only, because CI reads it from `DEPLOYMENT_REPO`.
- **Q-OPS2** Database roles (B2). Recommended: launch in mode B. Trade-off: mode A skips DB-3 to DB-6 but keeps the shared migration account in the API (ADR 0012 §8) and needs the owner's written acceptance.
- **Q-OPS3** Answered: direct push, as built; no required reviewers on `production` in v1.
- **Q-OPS4** How does the first production deploy stay private until the launch approval? Recommended: Cloudflare Access on `<domain>` and `admin.<domain>`, allowing only the owner's and the testers' e-mails, removed at launch. Trade-off: the alternative (no DNS record, a hosts-file entry on the testers' machines) needs no setup, but TLS and the Cloudflare client-IP header are then not tested the way they will run in production.
- **Q-OPS5** A git tag or GitHub Release per production deploy? Decided in [ADR 0016](../adr/0016-tag-driven-release-ci.md): yes, a repo tag `v<x.y.z>` and one `<app>@<x.y.z>` per bumped app, made by the `release-tag` skill; the tag starts the release run.
- **Q-OPS6** Delete protection for the backup job key (B7). Recommended: the bucket lock rules on `postgres/daily/` (14 days) and `postgres/monthly/` (92 days), proven by a delete attempt with the job key. Without it, a stolen job key can wipe the backups.
- **Q-OPS7** Answered: GHCR packages private, with the `ghcr-pull` Secret; the old package of the earlier site is deleted only after the owner confirms.
- **Q-OPS8** Where is the backup job image built? Recommended: in the deploy repo, as a small Alpine image with `postgresql17-client`, `age` and `rclone`, pinned by digest. Trade-off: installing packages at job start needs no image, but it is slow, depends on the network at 02:15 and is not pinned.
- **Q-OPS9** Which namespace? Recommended: `abyss` on every cluster.
