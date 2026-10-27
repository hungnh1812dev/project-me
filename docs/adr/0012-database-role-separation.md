# ADR 0012: Separate database roles for migrations and the API runtime

- Status: accepted for planning (2026-10-27). The split is a user decision; Q-DB1 (no existing data, fresh install) and Q-DB2 (warn only; revised by the user on 2026-10-27 from "refuse") were answered by the user on 2026-10-27, see "Open questions".
- Date: 2026-10-27
- Asked by: the user (handoff "LG-0 answers", 2026-10-27, and the planner job `DESIGN DB role separation`): a migration role with DDL rights runs only in the init container (`deploy:migrate`, `content:migrate`); the API runtime role gets only SELECT, INSERT, UPDATE, DELETE on the app schemas and no DDL. Deploy target: self-managed k3s (`docs/deployment/`).
- Closes: LG-0 item (6) once tasks LG-db-1..LG-db-4 are committed. Amends: SPEC §7 (new D19), `docs/deployment/k3s-traefik.md` §3, §6, §7, `docs/deployment/k3s-secrets-sops.md` §1, §2, §6, §7.

## Context (checked on the repo, 2026-10-27)

### How the containers connect today

- One credential pair for everything. cms-api reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` (`src/config/Env.schema.ts`); the Prisma CLI reads the same keys in `prisma.config.ts`. `DB_USERNAME` sits in the ConfigMap `cms-api-config`, `DB_PASSWORD` in the SOPS-encrypted Secret `cms-api-secrets`.
- The k3s Deployment (`k3s-traefik.md` §3) gives the init container `migrate` (`npm run deploy:migrate`) and the main container `cms-api` the same `envFrom`: the ConfigMap and the whole Secret. The guide says the init container needs every app secret because `deploy:migrate` loads the full app config: `ContentMigrate.command.ts` and `Seed.command.ts` call `loadAppConfig(process.env)`, which validates all required keys (JWT, OTP, TOTP, Cloudinary, mail). Both commands then use only `config.database`.
- The nightly backup CronJob (`k3s-traefik.md` §7) also reads `cms-api-secrets` for `DB_PASSWORD`. The SOPS guide already says "better give the job its own Secret".
- `k3s-traefik.md` §6: "use a role that owns the application database; `db:migrate` and `content:migrate` run DDL with the same `DB_USERNAME` as the API (a separate migration role is an open follow-up)".
- The smoke stack (`docker-compose.smoke.yml`) runs `cms-api-init` and `cms-api` with the Postgres image superuser `abyss`. `scripts/smoke/owner-setup.sh` re-runs `db:migrate` inside the `cms-api` service. The e2e suite reads `POSTGRES_USER` (`E2E_DB_USER`) for its own DB fixtures.

### What each process does to the database

| Process                                                                     | DDL                                                                                                                     | DML                                       | Notes                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- |
| `prisma migrate deploy` (init)                                              | yes: tables, enum types, `CREATE EXTENSION citext`, the `roles_protect_system` trigger function, hand-written `UPDATE`s | writes `_prisma_migrations`               | Prisma migrate lock                             |
| `Seed.command.ts` (init, end of `db:migrate`)                               | no                                                                                                                      | inserts roles and permissions             |                                                 |
| `content:migrate` (init)                                                    | yes: `CREATE SCHEMA content`, `content._migrations`, `content._content_types`, generated tables, indexes                | writes both meta tables                   | `pg_advisory_xact_lock`                         |
| cms-api runtime                                                             | none found (grep of `src/` for raw SQL: only `SELECT pg_advisory_xact_lock`, `SELECT 1`, one `UPDATE`)                  | every app table in `public` and `content` | reads `content._content_types`, never writes it |
| `owner:bootstrap`, `owner:reset-2fa` (`kubectl exec` in the main container) | no                                                                                                                      | accounts, audit rows                      | advisory lock                                   |
| backup CronJob (`pg_dump`)                                                  | no                                                                                                                      | reads everything                          |                                                 |

### Checked on PostgreSQL 16 (`postgres:16-alpine`, throwaway container, 2026-10-27)

- A role without `CREATE` on the database and the schemas gets `permission denied` for `CREATE TABLE` in `public` and `content`, `CREATE SCHEMA`, `CREATE TEMP TABLE`, and `must be owner` for `ALTER TABLE` / `DROP TABLE`; `TRUNCATE` is refused without the TRUNCATE privilege.
- `INSERT` into a `GENERATED ... AS IDENTITY` column needs no sequence grant. A `serial` column does (`permission denied for sequence`); the repo has none today, but Prisma's `autoincrement()` generates `serial`.
- `ALTER DEFAULT PRIVILEGES FOR ROLE <migrator> GRANT ... ON TABLES` and `... GRANT USAGE ON SCHEMAS` (no `IN SCHEMA`) cover tables and schemas the migrator creates later, `content` included, before that schema exists.
- A non-superuser that owns the database can run `CREATE EXTENSION citext` (trusted extension) and create in `public` (PG 15+ `public` belongs to `pg_database_owner`).
- A trigger function runs for the inserting role without extra grants (EXECUTE is granted to PUBLIC by default).
- A `REVOKE INSERT, UPDATE, DELETE` on one table after the default grant wins for that table.
- `pg_dump -Fc` works as a role that only has `pg_read_all_data`; the dump carries the GRANTs and the default privileges.

## Decision

### 1. Roles and grants

Three login roles plus the existing superuser. Names are psql variables in the script (defaults below), so a second environment on the same server, or a test, can pick other names.

| Role (default name)                                     | Used by                                                                | Rights                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres superuser (`POSTGRES_USER` of the StatefulSet) | the operator only, inside the Postgres pod                             | creates the roles, runs the roles script; never in any app pod                                                                                                                                                                                                                                                                   |
| `abyss_migrator`                                        | the init container (`deploy:migrate`) and the restore drill            | `NOSUPERUSER NOCREATEDB NOCREATEROLE`; owns the database, so it can create schemas, tables, types, functions and the trusted extension; owns every object it creates                                                                                                                                                             |
| `abyss_api`                                             | the cms-api main container, and the CLIs run there with `kubectl exec` | `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; `CONNECT` on the database; `USAGE` on `public` and `content`; `SELECT, INSERT, UPDATE, DELETE` on every app table; `USAGE, SELECT` on sequences (only `nextval` for inserts, not DDL); only `SELECT` on `_prisma_migrations`, `content._migrations`, `content._content_types` |
| `abyss_backup`                                          | the backup CronJob                                                     | `CONNECT`; member of `pg_read_all_data`; nothing else                                                                                                                                                                                                                                                                            |

What the API role cannot do: create, alter, drop or truncate anything, create a schema or a temporary table, write the migration history or the content type definitions (the runtime reads masking flags such as `sensitive: true` from `_content_types`, so a runtime that could write them could unmask fields). `PUBLIC` loses `CONNECT` and `TEMPORARY` on the database and `CREATE` on `public`.

New objects get their grants automatically: the script sets default privileges for objects the migrator creates (tables: the four DML rights for `abyss_api`; sequences: `USAGE, SELECT`; schemas: `USAGE`). A new content type table or a new Prisma table needs no grant step.

### 2. The roles script (one owner, idempotent, self-checking)

`scripts/db/database-roles.sql` is the only place that creates roles and grants. psql runs it as the superuser, connected to the app database, with `-v ON_ERROR_STOP=1 -v migrator_role=... -v api_role=... -v backup_role=...`. It:

1. creates each role if missing (no password: a role without one cannot log in with scram until the operator sets it), and resets the role attributes above on every run;
2. makes the migrator the database owner; revokes `CONNECT`/`TEMPORARY` from `PUBLIC`; grants `CONNECT` to the API and backup roles; `pg_read_all_data` to the backup role;
3. sets the default privileges, and grants the same rights on objects that already exist (schemas `public` and `content` when present);
4. restricts the three meta tables to `SELECT` for the API role, for each one that exists;
5. ends with a self-check that raises an error (no values printed) when the API role is superuser, can create in the database or in either schema, owns any object, or has a write right on a meta table, or when the backup role has any write right.

Variables are passed into `DO` blocks through `set_config('abyss.<name>', :'<name>', false)` and `current_setting(...)`, because psql does not expand variables inside dollar-quoted bodies; identifiers are built with `format('%I', ...)`. The script contains no password and no database name (it uses `current_database()`).

Run order on a fresh install: once before the first rollout (roles, ownership, defaults), once after the first rollout has migrated (the meta tables now exist, so step 4 applies). Re-running it is always safe; the self-check makes a missed second run visible.

Passwords are set by the operator at a psql prompt (`\password abyss_api`), so they never land in a file or shell history, then go into the matching SOPS Secret.

### 3. Which secret goes to which pod

`DB_USERNAME` leaves the ConfigMap: each credential Secret holds its own `DB_USERNAME` and `DB_PASSWORD`, so a pod can only hold the pair it is given and Kubernetes `envFrom` never has two sources for one key.

| Secret (deploy repo, SOPS) | Keys                                                                                                                                                                                           | Mounted into                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `cms-api-secrets`          | `DB_USERNAME=abyss_api`, `DB_PASSWORD`, `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY`, `CLOUDINARY_API_SECRET`, `TURNSTILE_SECRET_KEY`, `SMTP_USER`, `SMTP_PASSWORD` (+ the optional ones) | main container `cms-api` only |
| `cms-api-migrate-db` (new) | `DB_USERNAME=abyss_migrator`, `DB_PASSWORD`                                                                                                                                                    | init container `migrate` only |
| `postgres-backup` (new)    | `DB_USERNAME=abyss_backup`, `DB_PASSWORD`, the rclone remote config                                                                                                                            | backup CronJob only           |
| `postgres-superuser`       | `POSTGRES_PASSWORD` (and `POSTGRES_USER`)                                                                                                                                                      | the Postgres StatefulSet only |

The init container keeps `envFrom: cms-api-config` (DB host, port, name, `NODE_ENV`; no secrets) plus `cms-api-migrate-db`, and no longer receives `cms-api-secrets`. That needs one code change: the migration commands load only the database part of the config (section 4). Containers in one pod do not share process environments, and the init container has exited before the main container starts, so the main container never sees the migrator password.

### 4. DB-only config loader (cms-api)

Owner: `src/config/` (it already owns env parsing and `ConfigValidationError`).

- `Env.schema.ts` defines the five `DB_*` keys once (`databaseEnvShape`), exports `databaseEnvSchema = z.object(databaseEnvShape)`, and `envSchema` spreads the same shape, so the DB keys and their rules cannot drift.
- `AppConfig.setup.ts` adds `loadDatabaseConfig(rawEnv): Readonly<DatabaseConfig>`: parses only `databaseEnvSchema`, throws the same `ConfigValidationError` (key names, never values); `loadAppConfig` builds `config.database` with the same mapping.
- `ContentMigrate.command.ts` and `Seed.command.ts` call `loadDatabaseConfig`. `openIdentityCli` takes `Pick<IAppConfig, 'database'>` (an additive widening: the other CLIs keep passing the full config).
- `prisma migrate deploy` already reads only the `DB_*` keys (`prisma.config.ts`). No new env key; `.env.example` keeps its keys and only gains a comment.

### 5. Verification

| Where                                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Tier                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `AppConfig.setup.spec.ts`                            | `loadDatabaseConfig` accepts an env with only the `DB_*` keys, rejects a missing one with the key name and without the value, and returns the same object as `loadAppConfig(...).database`                                                                                                                                                                                                                                                                                                                                                                                                                          | 1 (unit)                                 |
| `test/integration/DatabaseRoles.integration.spec.ts` | on the shared Testcontainers server, with random role names: run the roles script, migrate core and content as the migrator, run the script again (idempotent, self-check passes); as the API role: DML on a `public` and a `content` table works; `CREATE TABLE` in both schemas, `CREATE SCHEMA`, `ALTER TABLE`, `DROP TABLE`, `TRUNCATE`, `CREATE TEMP TABLE` and writes to the three meta tables fail with SQLSTATE `42501` (or `must be owner`); `SELECT` on `_content_types` works; the backup role can read every table and write none; the self-check fails when the API role is given `CREATE` on `public` | 1 (integration)                          |
| smoke stack                                          | `cms-api-init` runs with the migrator and only the `DB_*` keys plus `NODE_ENV` (no app secrets, proving section 4); `cms-api` runs as the API role; the full e2e suite passes on DML only; a new check section tries DDL as the API role and expects each to be refused; migrate re-runs move from the `cms-api` service to the init service                                                                                                                                                                                                                                                                        | 3                                        |
| the cluster (owner, once)                            | the roles script's self-check passes after the first rollout; `kubectl logs <pod> -c migrate` shows the migrations; `GET /api/v1/health/ready` is ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                | owner runbook, recorded in LG-0 item (6) |

The dev stack (`pnpm dev:stack`, `pnpm demo`) keeps one role: tier 2 is for app behaviour, and tier 3 is the production-like check for grants. Integration tests other than the new suite keep the superuser.

### 6. Owner runbook (once per environment)

Written into `docs/deployment/k3s-traefik.md` by LG-db-4:

1. Postgres StatefulSet up with `postgres-superuser`.
2. `kubectl -n <ns> exec -i postgres-0 -- psql -U <superuser> -d <db> -v ON_ERROR_STOP=1 -v migrator_role=abyss_migrator -v api_role=abyss_api -v backup_role=abyss_backup -f - < scripts/db/database-roles.sql`
3. `kubectl -n <ns> exec -it postgres-0 -- psql -U <superuser> -d <db>`, then `\password` for each of the three roles (values from `openssl rand -base64 32`).
4. Write the three Secrets with SOPS, remove `DB_USERNAME` from `cms-api-config`, apply.
5. Roll out cms-api; the init container migrates as `abyss_migrator`.
6. Run step 2 again; it must end without error (self-check).
7. Rotate later per role: `\password <role>`, update its Secret, then restart its user (cms-api: `rollout restart`; migrator: the next rollout; backup: the next run).

Restore drill and disaster restore: run the roles script on the target server first; the superuser creates the scratch database with `-O abyss_migrator`; `pg_restore --no-owner` runs as the migrator (the dump's grants for `abyss_api` are restored with it); `deploy:migrate` runs with the migrator credentials and `DB_NAME` pointed at it; the superuser drops it.

### 7. Production boot warning (Q-DB2: warn only)

With `NODE_ENV=production`, cms-api checks its own database role once at boot, before it serves requests, and logs one warning when the role is superuser, has `CREATE` on the database, has `CREATE` on `public` or (when it exists) `content`, or owns any object in those schemas. It still starts. The warning names the problems and the ADR, never a value, like the existing `OWNER_SETUP_TOKEN` warning. The user first chose "refuse", then changed it to "warn" (2026-10-27): the deployment uses one shared DB account today, which a refusing guard would block. The decision is a pure rule in `src/infrastructure/database/DatabaseConfig.rules.ts`; the query runs where the shared Prisma provider starts (`Prisma.service.ts`). Non-production boots (dev stack, demo, tests) skip it. The warning makes a shared or mis-wired account visible in the logs on every boot until the split is done; the CLIs run with `kubectl exec` do not boot the app and are not affected. Task LG-db-5.

## Module ownership, names, extension path

- Role creation and grants: only `scripts/db/database-roles.sql`. No migration, CLI or app code knows a role name.
- DB connection settings: only `src/config/` (`databaseEnvSchema`, `loadDatabaseConfig`). Migration commands depend on `DatabaseConfig`, not on the app config.
- Extension path: a new workload that needs the database (for example a read-only reporting job) is one more psql variable, one `CREATE ROLE` block and one grant block in the script, one Secret, one row in the SOPS guide. A new table or content type needs nothing (default privileges). A new migration CLI calls `loadDatabaseConfig`.
- Names chosen: `abyss_migrator`, `abyss_api`, `abyss_backup`; Secrets `cms-api-migrate-db`, `postgres-backup`, `postgres-superuser`; `databaseEnvShape`, `databaseEnvSchema`, `loadDatabaseConfig`.

## File map

| Task    | Files                                                                                                                                                                                                                                                                   | Count          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| LG-db-1 | `apps/cms-api/src/config/Env.schema.ts`, `src/config/AppConfig.setup.ts`, `src/config/AppConfig.setup.spec.ts`, `src/modules/content-engine/cli/ContentMigrate.command.ts`, `src/modules/identity/cli/Seed.command.ts`, `src/modules/identity/cli/IdentityCli.setup.ts` | 6 edits        |
| LG-db-2 | `scripts/db/database-roles.sql` (new), `apps/cms-api/test/integration/DatabaseRoles.integration.spec.ts` (new), `apps/cms-api/test/fixtures/CoreDb.fixture.ts` (`applyDatabaseRoles` helper)                                                                            | 2 new, 1 edit  |
| LG-db-3 | `docker-compose.smoke.yml`, `scripts/stack/cms-api.env`, `scripts/stack/database-roles.sh` (new, Postgres init hook), `scripts/smoke.sh`, `scripts/smoke/database-roles.sh` (new check section), `scripts/smoke/owner-setup.sh`                                         | 2 new, 4 edits |
| LG-db-5 | `apps/cms-api/src/infrastructure/database/DatabaseConfig.rules.ts`, `DatabaseConfig.rules.spec.ts`, `Prisma.service.ts`, `apps/cms-api/test/integration/DatabaseRoles.integration.spec.ts`                                                                              | 4 edits        |
| LG-db-4 | `docs/deployment/k3s-traefik.md`, `docs/deployment/k3s-secrets-sops.md`, `apps/cms-api/README.md`, `apps/cms-api/.env.example` (comment only)                                                                                                                           | 4 edits        |

No new TypeScript file outside the test suite; the SQL and shell files follow their own kebab-case convention (SPEC §5).

## Consequences

- A SQL injection or a compromised API process can still read and change app rows, but cannot change the schema, the migration history or the content type definitions, and never holds the migrator or superuser password.
- The init container no longer holds the JWT, OTP, TOTP, Cloudinary, Turnstile or SMTP secrets.
- First install gains one manual step (run the roles script twice and set three passwords). Forgetting the second run leaves the meta tables writable; the self-check reports it.
- A migration that the API must tolerate during a rollout (expand/contract, `k3s-traefik.md` §3) is unchanged: grants follow automatically.
- A future migration that changes ownership or creates objects as another role would miss the default privileges; tier 3 (full e2e as the API role) and the self-check catch it.

### 8. Accepted risk until the split is done

The separate roles (sections 1-6) stay the target. Until the owner has run the §6 runbook on an environment, that environment's cms-api and init container use one shared DB account that can run DDL. The user accepts this as a known risk (2026-10-27): a SQL injection or a compromised API process could then change the schema, the migration history and the content type definitions (including the `sensitive` masking flags), and the init container still needs the full app config if it shares the main container's Secret. Mitigations meanwhile: the §7 boot warning, the LG-0 item (6) record, and LG-1 / LG-3 report the account state. LG-0 item (6) is closed either by the split (the self-check passes on the deployed database) or by the user's written acceptance of the shared account for launch.

## Open questions

Answered by the user (2026-10-27). No question is open.

- **Q-DB1** Does a staging or production database with data to keep already exist? **Answer: no.** Every environment is created fresh with the §6 runbook; no ownership-transfer task.
- **Q-DB2** Should cms-api refuse to start in production when its database role can do DDL? **Answer: warn only** (first "refuse", changed by the user on 2026-10-27 because the deployment uses one shared DB account, which a refusing guard would block). cms-api logs a warning and still starts. See Decision §7 and §8; task LG-db-5.
