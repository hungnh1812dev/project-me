# Database: PostgreSQL, roles, TLS

How cms-api's database runs and is set up (D19, ADR 0012). Workloads: [kubernetes.md](kubernetes.md); Secrets: [secrets.md](secrets.md); dumps and restore: [backups.md](backups.md).

Status: the roles script and the TLS keys are built and tested on throwaway containers (`scripts/db/database-roles.sql`, the smoke stack). Nothing here has run against the production database from this repo; steps DB-3 to DB-7 below are that proof (LG-0 item 6, LG-db-7).

## 1. Facts to rely on

- **PostgreSQL 17** everywhere: production, tests, smoke, dev and the backup image. Use `psql` 17 and `pg_dump` 17 or newer: an older `pg_dump` refuses to dump a newer server.
- **One database holds everything:** the Prisma-managed `public` tables and the content engine's `content` schema. A dump of those two schemas covers the whole app ([backups.md](backups.md)).
- **A session-mode connection.** cms-api, Prisma migrate and the content runner rely on prepared statements, session state and advisory locks. Connect directly or through a pooler in session mode; never through a transaction-mode pooler.
- **TLS `verify-full`** whenever the database is reached over a network you do not control: the server enforces TLS, and cms-api checks the server certificate against its CA (section 4).
- **The login name is what the server expects.** Some managed services add a suffix to the role name for logins through their pooler. That full string goes into `DB_USERNAME`; inside the database, in the roles script variables and in `current_user`, the role is the plain name.
- **An HTTP data API is closed.** If the database service offers one, turn it off: with it on, its public key could read and write the app tables directly, past every cms-api rule and every masking rule. The roles script revokes its roles (`data_api_roles`, section 3).

## 2. Where it runs

| Option                      | Use                    | Notes                                                                                                                                                                                                                                                                                              |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed PostgreSQL service  | production             | reached over TLS (`DB_SSL_MODE=verify-full`, ConfigMap `database-ca`). The most privileged role the service gives may not be a superuser: it is then the migration role, and the roles script runs in its managed-service mode.                                                                    |
| Self-managed in the cluster | documented alternative | `postgres:17-alpine` as a single-replica StatefulSet with a PVC and the Secret `postgres-superuser` (no app pod mounts it). A node-local storage class is enough on one node, but then the off-site dump is the only copy that survives losing the disk. `DB_SSL_MODE=disable` inside the cluster. |

If the service has no automatic backups, the nightly dump is the only copy that survives the service ([backups.md](backups.md)).

## 3. Roles

Three login roles, so that a compromised API process cannot change the schema:

| Role (default name)                                          | Used by                                                        | Rights                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abyss_migrator` (managed service: the service's admin role) | init container `migrate`, the roles script, a disaster restore | owns the database objects; runs the DDL of the migrations                                                                                                                                                                                                                                                                                                              |
| `abyss_api`                                                  | main container `cms-api` and the CLIs run in it                | `SELECT, INSERT, UPDATE, DELETE` on the tables and `USAGE, SELECT` on the sequences of `public` and `content`, `USAGE` on both schemas; no `CREATE`, so no DDL. `SELECT` only on `_prisma_migrations`, `content._migrations` and `content._content_types` (the runtime reads masking flags from `_content_types`; a runtime that could write them could unmask fields) |
| `abyss_backup`                                               | the backup CronJob                                             | read only: `pg_read_all_data` (self-managed), or explicit `SELECT` on every table and sequence of `public` and `content` (managed service)                                                                                                                                                                                                                             |

`scripts/db/database-roles.sql` is the only place that creates roles and grants. It holds no password, is idempotent, and ends with a self-check that raises an error (no values printed) when a rule above is broken. Its header lists the variables and the hosting modes. In the managed-service mode it never changes the database owner and never revokes anything from `PUBLIC`, because the service's own components use the same database.

A login role needs a password and no expired `VALID UNTIL`. If a role suddenly cannot connect, check `rolvaliduntil` and `rolcanlogin` in `pg_roles` first.

## 4. TLS from cms-api

Two keys in `cms-api-config`, read by both cms-api containers. Neither is a secret.

| Key                     | Value in production             | Meaning                                                                                                                                                            |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_SSL_MODE`           | `verify-full`                   | `disable` is the default and only for local stacks or a database inside the cluster. `require` encrypts without checking the server and is not used in production. |
| `DB_SSL_ROOT_CERT_PATH` | `/etc/abyss/database-ca/ca.crt` | absolute path of the mounted CA (PEM), required with `verify-full`; a missing, unreadable or non-PEM file stops the process at boot, naming this key               |

- The CA goes into the ConfigMap `database-ca` ([configmaps.md](configmaps.md) section 3), mounted read-only in the init container, the main container and the backup job.
- `DB_HOST` must be the host exactly as in the server certificate; an IP address or an alias that the certificate does not list fails `verify-full`.
- `prisma migrate deploy` gets the same settings from the same two keys (`apps/cms-api/README.md`, "Database TLS"). The backup job uses the libpq names: `PGSSLMODE=verify-full`, `PGSSLROOTCERT=/etc/abyss/database-ca/ca.crt`.

## 5. Set up the roles, once per database (DB-1 to DB-8)

Run DB-2, DB-3, DB-4 and DB-6 from a workstation with `psql` 17 (and the CA file for a managed service), never from an app pod. `<conn>` is a connection string with the migration role, for example `host=<db-host> port=5432 dbname=<db> user=<migrator login> sslmode=verify-full sslrootcert=<path to ca.crt>`. For a self-managed database, run the commands inside the Postgres pod as the superuser (`kubectl -n <ns> exec -i postgres-0 -- psql -U <superuser> -d <db> ...`).

| Step | What                                                                                                                                                                                                                                                                                                                                                                           | Status                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| DB-1 | Server settings (managed service): the HTTP data API off, TLS enforced on incoming connections, the CA certificate downloaded (it goes into `database-ca`), network access limited to the cluster's egress address if the plan allows it. Enforce TLS only once an image with the TLS keys is deployed and `DB_SSL_MODE=verify-full` is set, or the app cannot connect.        | owner                                       |
| DB-2 | `psql "<conn>" -c 'select version()'` prints one line `PostgreSQL 17...`. With `verify-full` this proves the CA and that the host matches the certificate. The same command with `sslmode=disable` must be refused (TLS is enforced).                                                                                                                                          | **not run**; this step is its own proof     |
| DB-3 | Roles script, first run: `psql "<conn>" -v ON_ERROR_STOP=1 -v hosting=<mode> -v migrator_role=<migration role> -v api_role=abyss_api -v backup_role=abyss_backup [-v data_api_roles=<the data API's roles>] -f scripts/db/database-roles.sql`. `<mode>` is `self_managed` or the managed-service mode named in the script header. Plain role names only, never a login suffix. | script **ready**; **not run** on production |
| DB-4 | Passwords at a psql prompt, never in a file or the shell history (`openssl rand -base64 32` each): `\password abyss_backup`, `\password abyss_api` when it has none yet, and on a self-managed database also `\password abyss_migrator`.                                                                                                                                       | after DB-3                                  |
| DB-5 | Write `cms-api-secrets` (API role), `cms-api-migrate-db` (migration role) and `postgres-backup` (backup role) ([secrets.md](secrets.md)), apply them and roll out cms-api. The init container migrates as the migration role.                                                                                                                                                  | **deploy repo**, **not run**                |
| DB-6 | Run DB-3 again. It must end without error: the migrations have now created the meta tables, so the script restricts them and the self-check proves it. A missed second run shows here.                                                                                                                                                                                         | after DB-5; **not run**                     |
| DB-7 | `curl -fsS https://<domain>/api/v1/health/ready` returns `{"status":"ok"}`; no "database role can change the schema" warning in `kubectl -n <ns> logs deploy/cms-api -c cms-api` (section 7); if the service has a data API, a request with its public key lists no app table.                                                                                                 | **not run** (LG-db-7)                       |
| DB-8 | Rotation: [secrets.md](secrets.md) section 7.                                                                                                                                                                                                                                                                                                                                  | runbook                                     |

## 6. Database credential modes for cms-api

Pick one per environment and record the choice under LG-0 item 6.

| Mode                                               | When               | init `migrate` `envFrom`                                      | main `cms-api` `envFrom`            | `cms-api-secrets.DB_USERNAME` |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------- | ----------------------------------- | ----------------------------- |
| **A: shared account** (ADR 0012 §8, accepted risk) | until DB-3 has run | `cms-api-config`, `cms-api-secrets`                           | `cms-api-config`, `cms-api-secrets` | the migration role's login    |
| **B: split roles** (target, D19)                   | after DB-3 to DB-6 | `cms-api-config`, `cms-api-migrate-db` (no `cms-api-secrets`) | `cms-api-config`, `cms-api-secrets` | the API role's login          |

Both modes mount `database-ca` when TLS is on. In mode A the boot warning of section 7 shows on every start; that is expected. Mode A needs the owner's written acceptance (LG-0 item 6).

## 7. Boot warning for a role that can run DDL

With `NODE_ENV=production`, cms-api checks its own database role once at boot and logs one warning when the role is a superuser, has `CREATE` on the database, has `CREATE` on `public` or `content`, or owns objects in them. The warning starts with "The database role can change the schema", names only the problems, never a value, and never blocks the start.

- Expected in mode A.
- Not expected as `abyss_api`: the roles script has not run, or a grant was added by hand. Run DB-3 and read the self-check.
- "Could not check whether the database role can change the schema" means the check query failed (for example the database was unreachable at boot); read the log lines around it.

## 8. Limits and accepted risks

- **Connection budget (not run).** One cms-api pod opens up to three `pg` pools (Prisma adapter plus two content pools, `pg` default `max` 10 each), and a rollout runs two pods at once. Compare the total with the pooler's pool size before launch. Pool sizes have no env key today; a cap would be a new task.
- **An idle database may pause** on some plans (accepted for launch, Q-DB6). While it is paused, `/health/ready` fails and the site shows errors: resume it in the service's dashboard, then `kubectl -n <ns> rollout restart deploy/cms-api` if readiness does not recover by itself.
- **A plan size limit.** The backup job warns at `BACKUP_MAX_DATABASE_BYTES`; set it to about 80 percent of the plan's limit ([backups.md](backups.md)).
- **The init container holds the migration password.** It lives only in `cms-api-migrate-db`, which only the init container mounts (ADR 0012 §9.2).
- **Managed-service mode leaves `PUBLIC` rights.** `TEMPORARY` on the database stays with `PUBLIC`, so `abyss_api` can create session-local temporary tables; `CONNECT` stays with `PUBLIC`. If the self-check finds `CREATE` on schema `public` for the API role through `PUBLIC`, it fails and you report it; the script does not revoke it silently.
- **The smoke stack proves no managed-service grant.** DB-3, DB-6 and DB-7 on the real database are that proof.
