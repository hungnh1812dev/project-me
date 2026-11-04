---
app: cms-api
summary: NestJS API: REST, read-only GraphQL, data, access policy, sessions and audit
replaces: D3, D4, D5, D8, D9, D19
---

# cms-api: spec

Part of the [project spec](../../../SPEC.md). App `cms-api`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Behaviour

cms-api (NestJS 11 on Express) serves every API under `/api/v1`: REST for cms-admin and API tokens, and the read-only GraphQL API the web server reads. It owns the database (Prisma core tables in `public`, generated content tables in `content`), the access policy and field masking, sessions and tokens, and the security audit. Modules and their dependencies: [capability-map.md](../../global/reference/capability-map.md); endpoints: [api-contract.md](../../global/reference/api-contract.md).

## Requirements

The decisions below, plus the requirements of the flows that use cms-api (Docs table of the [project spec](../../../SPEC.md)). New app-wide requirements go here with ids `API-<n>`.

## Decisions

**D3 Field-level reads (C4).** Applied **when the query is built**: no `read` on a subject → `403` (not a masked row) · unreadable columns are never selected; the serializer emits the sentinel and `_maskedFields` · filter, sort or search on an unreadable field → `400 FIELD_NOT_READABLE` · every payload carrying record data uses the same serializer (list, detail, 409 conflict, bulk conflicts, audit metadata view, error details).

**D4 Write allowlist (C5).** Writable fields come from policy, per request. A masked field sent back with the sentinel is dropped silently; any other non-writable or unknown key → `400`. Client-sent `_maskedFields` is ignored.

**D5 API tokens (C6).** Effective permissions = token scope ∩ creator's **current** permissions, per request. A deactivated or deleted creator stops the token. Create, update and revoke only from a JWT session (never with a token); the subset check runs on create **and** update. Admins manage only tokens they created; the Owner manages all. Format `ak_live_` + 32 random bytes base64url, stored as SHA-256, raw value shown once. Expired once `expires_at <= now` (same rule at request authentication and in the list status). Expired = revoked: no update (`PATCH /api-tokens/:id` → `409`, so an expiry can never be moved forward to revive it); only a new token restores access (user decision 2026-10-25, CA1b security).

**D8 Credentials and OTP.** Passwords: Argon2id, min 12 characters. OTPs stored as HMAC-SHA256 with `OTP_PEPPER`, bound to `(account, purpose)`; purposes `INVITE_SET_PASSWORD`, `RESET_PASSWORD`, `LOGIN_2FA_EMAIL`. Unknown-email responses look like known ones (no enumeration). Password reset also needs a TOTP code when TOTP is on. Turning on 2FA needs the current password plus a valid first code. TOTP remembers the last used time step (no replay); its secret is encrypted with AES-256-GCM using `TOTP_ENC_KEY` and a key id for rotation.

**D9 Sessions and revocation.** JWT HS256, algorithm pinned; claims `sub`, `tv` (`accounts.token_version`), `pv` (`roles.policy_version`), `kid`. The guard compares claims with DB values through an in-process cache invalidated on every write in that process: immediate at one replica, bounded by a 5 s cache TTL at more. Refresh tokens rotate with `family_id`; reusing a rotated token revokes the family and bumps `token_version`. A password change or reset bumps `token_version`.

**D19 Database roles (added 2026-10-27, user decision; ADR 0012).** Production uses separate PostgreSQL roles:

- `abyss_migrator` owns the database and runs DDL, only in the init container (`deploy:migrate` = `db:migrate` + `content:migrate`) and the restore drill. `abyss_api` (cms-api runtime): `SELECT, INSERT, UPDATE, DELETE` on app tables of `public` and `content` (plus `USAGE` on schemas and sequences), only `SELECT` on `_prisma_migrations`, `content._migrations`, `content._content_types`; no DDL, no `TRUNCATE`, no temporary tables. `abyss_backup` only reads (`pg_read_all_data`). The superuser stays in the Postgres pod.
- One idempotent, self-checking script, `scripts/db/database-roles.sql`, sets roles and grants; default privileges cover later objects. Each workload gets only its own credential Secret; migration commands load only `DB_*` keys (`loadDatabaseConfig`), so the init container holds no app secret. The tier 3 smoke stack uses the same split.
- In production cms-api logs one boot warning (names only, no values) when its role is superuser, can `CREATE` in the database or the `public` / `content` schemas, or owns objects there, and still starts. Until the split is applied on an environment, its shared DDL-capable DB account is a user-accepted risk (ADR 0012 §8). Every environment starts from a fresh database (user answers Q-DB1, Q-DB2 "warn only", 2026-10-27).
- Production on a Supabase free project (amended 2026-10-27, user decision, ADR 0012 §9): `postgres` = migrator and operator, `abyss_api` = API role, `abyss_backup` reads with explicit `SELECT`. Every Supabase connection (API, init container, backup, roles script) goes through the session pooler on 5432 (user names `<role>.<project-ref>`), never the transaction pooler on 6543 or a direct connection. Roles script in `hosting=supabase` mode (no ownership change, no `PUBLIC` revoke, all grants removed from the Data API roles); Data API off. TLS via `DB_SSL_MODE` / `DB_SSL_ROOT_CERT_PATH` (default `disable` for local stacks; Supabase production: `verify-full` with the project CA, "Enforce SSL" on). The free-plan pause is accepted for launch. Postgres 17 is the target major for production, tests, smoke, dev and backup images (user answers Q-DB3..Q-DB7, 2026-10-27).

## Change log

- 2026-11-04 Created from the old SPEC (D3, D4, D5, D8, D9, D19).
