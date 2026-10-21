# Access control (cms-api `src/modules/access/`)

This module decides what an actor may do with a subject, which fields it may
read or write, and which rows a conditioned permission reaches (SPEC §7
D2–D6, §8.1, §8.3). It was built in T14 (rules) and wired into Nest in T15 (guard and revocation
versions). Masking (T16), the management API (T17) and tokens (T19) build on
it.

| File                          | What it holds                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `access.constants.ts`         | Subjects, actions per subject, DSL operators/variables/limits, error codes, default matrix |
| `actor-context.ts`            | `ActorContext`, `RolePolicy`, token scope, `rolePolicyFromRows`, scope ∩ creator           |
| `subject-catalog.ts`          | Known subjects (`*`, registry slugs, system subjects), field paths, DSL field catalog      |
| `policy-evaluator.ts`         | `PolicyEvaluator.can / canReadDrafts / fieldsFor / rowFilter`                              |
| `conditions.compiler.ts`      | DSL validation and compilation to parameterized Kysely SQL                                 |
| `permission.validator.ts`     | Save-time checks: `validatePermissionSet` (T17), `validateTokenScope` (T19)                |
| `permission.decorator.ts`     | `@RequirePermission()` metadata (read by the T15 guard)                                    |
| `version-cache.ts`            | D9 in-process cache of account `tv`/status/role and role `pv`/permission rows (T15)        |
| `role-permissions.service.ts` | The one write path for a role's rows: replace + bump `policy_version` + invalidate (T15)   |
| `permission.guard.ts`         | Enforces `@RequirePermission()` with the evaluator (T15)                                   |
| `access-policy.service.ts`    | Builds the catalog + evaluator from the lazily loaded content registry (T15)               |
| `access.module.ts`            | Nest wiring (imported by IdentityModule)                                                   |
| `role-permissions.seed.ts`    | Default rows for system roles that have none                                               |

## Subjects and actions

- **Content subjects**: every registered content type slug, plus the
  wildcard `*` in permission rows, which covers every content type and never
  a system subject. `*` is never a request subject.
- **System subjects** and their valid actions:

  | Subject             | Actions                      |
  | ------------------- | ---------------------------- |
  | `accounts`          | read, create, update, delete |
  | `roles`             | read, create, update, delete |
  | `api_tokens`        | read, create, update, delete |
  | `media`             | read, create, update, delete |
  | `audit_logs`        | read                         |
  | `reviewer_settings` | read, update                 |

- Any other subject is unknown and always denied, even for the owner. The
  same applies to an action a subject does not have (e.g. `delete` on
  `audit_logs`).

## Evaluation rules

1. The **owner** system role (`is_system` and slug `owner`) may do every
   valid action on every known subject, with all fields and no conditions.
   It has no permission rows.
2. For a content type, rows naming its slug **override** the `*` rows for
   the same action. This lets a field profile for one type (e.g. T30's masks
   on `cv-page`) narrow a broad `*` grant.
3. Rows at the same level **add up**: field lists are unioned (`null` = all
   wins), and conditions are ORed. A row without conditions makes the action
   unconditional.
4. `can()` ignores conditions. Conditions narrow rows through `rowFilter()`,
   which returns `{ allowed: false }` or a parameterized `where` (or `null`
   for every row). A stored condition that no longer validates (e.g. its
   field was removed) grants nothing: it fails closed.
5. **Drafts** need `read` + `update` on the subject (`canReadDrafts`).
   `read` alone sees published content only.
6. **Reviewer** and **anonymous** actors only ever read, whatever their
   role's rows say (D2). They never get drafts, and nothing is writable for
   them.
7. **API tokens** reach content subjects only. Effective permissions are
   the scope ∩ the creator's **current** role rows (D5): actions and field
   lists intersect, and the creator's conditions always apply. Tokens have
   no conditions of their own. A scope entry for a slug meets the creator's
   rows for that slug, or their `*` rows when they have none. A `*` entry
   meets every creator content row. For an owner creator, the scope applies
   as written.
8. `fieldsFor(actor, subject, writeAction = 'update')`: readable fields come
   from `read` rows, writable fields from `writeAction` rows. Field lists
   apply to content types only. A system subject is all or nothing.

The rank rule (target rank < actor rank, D6) is not part of the evaluator;
T17 enforces it.

## Field lists

`readable_fields`, `writable_fields` and token scope lists hold API field
paths: `title`, or `reference.phone` for nested fields. A component path
covers its whole subtree. `null` means every field. Lists are only valid on
a specific content type: `readable_fields` on `read` rows, and
`writable_fields` on `create`/`update` rows. Every path must exist in the
definition, with no duplicates.

## Conditions DSL (SPEC §8.3)

```json
{
  "all": [
    { "field": "createdBy", "op": "eq", "value": "$actor.id" },
    { "field": "title", "op": "in", "value": ["a", "b"] }
  ]
}
```

- **Shape**: exactly `{ all: [clause, ...] }`, with 1 to
  `CONDITION_LIMITS.MAX_CLAUSES` clauses. A clause has exactly
  `field`, `op` and `value`.
- **Operators**: `eq`, `ne`, `in`. `in` takes 1 to `MAX_IN_VALUES`
  non-null values.
- **Fields**:
  - the system fields `createdBy`, `updatedBy` and `documentId`;
  - root-level scalar fields of the subject that the same permission set
    makes readable. These are mapped to columns by the content engine's
    table plan (`naming.ts`).

  Component fields, nested paths and `json` fields are not allowed. On `*`,
  only the system fields are allowed.

- **Values**: a literal of the field's kind (string ≤ `MAX_STRING_LENGTH`,
  integer, number, boolean, `YYYY-MM-DD` date, ISO date-time, UUID for
  `documentId`, or `null` for eq/ne), or one of the variables
  `$actor.id` / `$actor.roleRank`. Both variables are integers, so they are
  only valid on integer or decimal fields. Any other `$…` string is
  rejected.
- **Variable values**: `$actor.id` is the account id. For a token it is the
  creator's id; for a reviewer, the ephemeral account's id. Anonymous actors
  have no id: `$actor.id` binds `NULL`, so `eq` matches no row.
- **Errors**: every violation is reported as `PERMISSION_INVALID_CONDITION`
  with a path inside the payload.
- **Compiled SQL**: columns go through `sql.ref` and only names the catalog
  produced can reach it. Values are always bind parameters. `eq null` →
  `IS NULL`, `ne` → `IS DISTINCT FROM` (rows whose column is NULL count as
  not equal).

## Default role matrix (seed, decision T14)

These rows are seeded only into a system role that has no rows yet. All
fields are allowed and there are no conditions.

| Role       | Content (`*`)                            | System subjects                                               |
| ---------- | ---------------------------------------- | ------------------------------------------------------------- |
| `owner`    | everything (evaluator, no rows)          | everything valid (no rows)                                    |
| `admin`    | all 6 actions                            | accounts, roles, api_tokens, media: read/create/update/delete |
| `editor`   | read, create, update, publish, unpublish | media: read, create, update                                   |
| `guest`    | none                                     | none                                                          |
| `reviewer` | read (published only)                    | media: read                                                   |
| `public`   | read (published only)                    | none                                                          |

## Request flow and revocation (T15, D9)

1. `JwtAuthGuard` (passport-jwt, HS256 pinned) verifies the token. Then
   `JwtStrategy.validate` reads the account through `VersionCache`:
   - a missing account → 401;
   - `tv` ≠ `token_version` → 401;
   - status not `active`, or deleted → 401.

   It then loads the account's **current** role with its rows and puts
   `req.user.actor` (an `account` ActorContext) on the request.

2. `pv` never rejects a token. The request always runs with the role's
   current rows, so a permission change applies on the next request with
   the same token (§12-11). A `tv`/`pv` claim above the cached value
   (the token is newer than the cache) forces a DB re-read.
3. `PermissionGuard` reads `@RequirePermission()`:
   - no metadata → the route needs authentication only;
   - no actor → 401;
   - a `subjectParam` that is not a registered content type → 404;
   - `can()` false → 403 `FORBIDDEN`.

   Usage: `@UseGuards(JwtAuthGuard, PermissionGuard)`.

**Invalidation.** Every write in the process calls `VersionCache` **after**
its commit:

| Write                         | Where                                                                | Invalidates |
| ----------------------------- | -------------------------------------------------------------------- | ----------- |
| Password change, reset or set | `password.service.ts`                                                | the account |
| Refresh-token reuse           | `refresh-token.service.ts`                                           | the account |
| Role permission changes       | `RolePermissionsService.replacePermissions` (bumps `policy_version`) | the role    |

A read that started before an invalidation is not cached (generation
check), so it cannot re-cache pre-write data. Writes the process cannot see
(the `owner:reset-2fa` CLI, another replica, manual SQL) take effect within
`VERSION_CACHE_TTL_MS` (5 s).

T17 must call `VersionCache.invalidateAccount()` after committing any
account write: disable, role change, delete, or session revoke with a `tv`
bump. For permission writes it must call
`RolePermissionsService.replacePermissions()`, adding its audit row through
`alsoInTransaction`.

**Swap point (more than one replica).** `VersionCache` and the rate-limit
store are in memory. Before scaling out, replace `VersionCache` with a
shared store or a pub/sub invalidation. Until then, other replicas are
bounded by the 5 s TTL.

**Content registry.** `ContentRegistryProvider` (content-engine module)
loads `content._content_types` on first use, not at boot, so the API still
starts while the database is down (readiness 503). A failed load is retried
on the next call, and a successful load is kept until restart (D10). If
`content:migrate` never ran, the registry is empty and every content
subject is denied.
