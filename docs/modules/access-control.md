# Access control (cms-api `src/modules/access/`)

This module decides what an actor may do with a subject, which fields it may
read or write, and which rows a conditioned permission reaches (SPEC §7
D2–D6, §8.1, §8.3). It was built in T14 (rules) and wired into Nest in T15 (guard and revocation
versions). T16 added field masking. T17 added the accounts and roles API,
the rank rule and the security audit. T17b added the read-only content
types API (`src/modules/content-types/`), which uses the evaluator to filter
types and fields. T19 added API tokens: the API, the subset check
(`domain/TokenScope.rules.ts`) and `ApiTokenGuard`.

| File                                                                      | What it holds                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/Access.constants.ts`                                              | Subjects, actions per subject (`PermissionAction`, `AccountStatus`), DSL operators/variables/limits, error codes, default matrix                                                                                                        |
| `domain/ActorContext.entity.ts`                                           | `ActorContext`, `RolePolicy`, token scope, `rolePolicyFromRows`, actor builders                                                                                                                                                         |
| `domain/EffectivePolicy.rules.ts`                                         | `effectivePolicy`: one resolver per actor kind (owner, read-only clamp, token scope ∩ creator)                                                                                                                                          |
| `domain/SubjectCatalog.rules.ts`                                          | Known subjects (`*`, registry slugs, system subjects), field paths, DSL field catalog                                                                                                                                                   |
| `domain/PolicyEvaluator.rules.ts`                                         | `PolicyEvaluator.can / canReadDrafts / fieldsFor / rowFilter`                                                                                                                                                                           |
| `domain/Conditions.rules.ts`                                              | DSL validation and compilation to parameterized Kysely SQL                                                                                                                                                                              |
| `domain/PermissionSet.rules.ts`                                           | Save-time check of a role's permission set: `validatePermissionSet`                                                                                                                                                                     |
| `domain/TokenScope.rules.ts`                                              | Save-time check of an API token scope (`validateTokenScope`) and the D5 subset check (`scopeEntriesBeyondCreator`)                                                                                                                      |
| `domain/FieldList.rules.ts`                                               | Field-list check and issue types shared by the two validators                                                                                                                                                                           |
| `application/VersionCache.service.ts`                                     | D9 in-process cache of account `tv`/status/role and role `pv`/permission rows (T15); holds `VERSION_CACHE_TTL_MS` and `VERSION_CACHE_MAX_ENTRIES`                                                                                       |
| `application/Access.port.ts`                                              | Ports with their tokens: `AccountVersionSource`, `RoleLookup` (exported for identity), `ApiTokenLookup`, `PermissionRepository`                                                                                                         |
| `application/ApiTokenAuthentication.service.ts`                           | D5: raw token in, principal out; one bare 401 for every cause; `last_used_at` throttled write                                                                                                                                           |
| `application/AnonymousActor.service.ts`                                   | The anonymous actor from the `public` role; 401 when the role is missing                                                                                                                                                                |
| `adapters/Prisma{AccountVersion,RolePolicy,ApiTokenLookup}.repository.ts` | The Prisma side of the ports (role policy repository also writes permission rows inside a `UnitOfWork`)                                                                                                                                 |
| `application/RolePermissions.service.ts`                                  | The one write path for a role's rows: replace + bump `policy_version` in the core `TransactionRunner`, invalidate in `afterCommit` (T15); `alsoInTransaction` receives the `UnitOfWork`                                                 |
| `http/Permission.guard.ts`                                                | `@RequirePermission()` with `PERMISSION_METADATA_KEY`, and `PermissionGuard`, which enforces it with the evaluator (T15)                                                                                                                |
| `application/AccessPolicy.service.ts`                                     | Builds the catalog + evaluator from the lazily loaded content registry (T15)                                                                                                                                                            |
| `Access.module.ts`                                                        | Nest wiring (imported by IdentityModule)                                                                                                                                                                                                |
| `http/ApiToken.guard.ts`                                                  | `ApiTokenAuthenticator` (bearer header, writes `request.user`) and `ApiTokenGuard`                                                                                                                                                      |
| `http/ActorThrottleSubject.resolver.ts`                                   | Throttle subject read off the actor an earlier guard set                                                                                                                                                                                |
| `http/AccessHttp.constants.ts`                                            | Account, role and API token routes; `ACCESS_RATE_LIMIT_POLICIES`                                                                                                                                                                        |
| `application/RoleSeed.service.ts`                                         | Seeds the system roles and the default rows for system roles that have none (`db:seed`); the table is `domain/SystemRoles.entity.ts`                                                                                                    |
| `domain/FieldProjection.rules.ts`                                         | `projectTable` / `selectedColumns`: never select unreadable columns (T16, D3)                                                                                                                                                           |
| `domain/RecordSerializer.rules.ts`                                        | `RecordSerializer`: the one record -> response path, masks + `_maskedFields` (T16)                                                                                                                                                      |
| `domain/WriteAllowlist.rules.ts`                                          | `WriteAllowlist`: client tree -> writable tree, drops masks, 400 otherwise (T16, D4)                                                                                                                                                    |
| `domain/QueryFieldAccess.rules.ts`                                        | `QueryGuard`: filter/sort/search only on readable fields (T16, D3)                                                                                                                                                                      |
| `domain/RecordReadAccess.rules.ts`                                        | `RecordReadAccess` / `recordReadAccess(actor, readable)`: fields + visible system fields                                                                                                                                                |
| `domain/FieldPaths.rules.ts`                                              | Field-path helpers and the 400s of the field checks (`FIELD_NOT_READABLE`, `FIELD_NOT_WRITABLE`, `FIELD_UNKNOWN`)                                                                                                                       |
| `domain/Rank.rules.ts`                                                    | D6: `outranks` / `assertOutranks`, `requireAccountActor`, `grantsBeyondActor` (T17)                                                                                                                                                     |
| `domain/ApiToken.rules.ts`                                                | `API_TOKEN` (token format and limits), `hashApiToken` and `isApiTokenExpired`: the one expiry rule (`expires_at <= now`) for authentication, list status and the update guard                                                           |
| `document-auth/`                                                          | `http/DocumentAuth.guard.ts` (`DocumentAuthGuard`, R1-12), `DocumentAuth.module.ts`; facade `index.ts` (not in the core `index.ts`: identity imports that)                                                                              |
| `management/domain/`                                                      | `AccessManagement.constants.ts` (error codes, limits, token statuses), `AccessManagement.errors.ts` (the `DomainError` constructors of the 19 refusals), `Account.entity.ts` (account records and views, the D6 target and role checks) |
| `management/application/AccessManagement.port.ts`                         | `AccountAdminRepository`, `RoleRepository`, `ApiTokenAdminRepository` (row locks, the role-cap lock and the unique-violation mapping live in their adapters)                                                                            |
| `management/application/Accounts.service.ts`                              | list, update, disable, enable, revoke sessions (T17, T17a); `recordAccountEvent` writes the account audit row                                                                                                                           |
| `management/application/Invitations.service.ts`                           | invite and resend invite (rank check, assignable role, invite code, mail sent after the commit)                                                                                                                                         |
| `management/application/{Roles,ApiTokens}.service.ts`                     | `/roles` (T17) and `/api-tokens` (T19) use cases; cache drops are `afterCommit` callbacks                                                                                                                                               |
| `management/adapters/Prisma{Account,Role,ApiToken}.repository.ts`         | the Prisma implementations of the three ports                                                                                                                                                                                           |
| `management/http/`                                                        | `Accounts`, `Roles`, `ApiTokens` controllers and their request schemas; `AccessManagement.module.ts` (imports identity) and `index.ts` at the folder root                                                                               |
| `../security-audit/`                                                      | D15 module (R1-04): `SecurityAuditService`, `PrismaAuditLogRepository` (built by hand by the CLIs), action names                                                                                                                        |

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
   them. On the `media` subject `rowFilter` adds `is_reviewer_preset = true`
   for such actors (T27), so the file library shows them preset files only;
   this keys on the actor kind, not on a role name. `JwtStrategy` makes an
   account whose role is `reviewer` the `reviewer` actor (T31), so the rule
   holds even if the owner edits the reviewer role's rows.
7. **API tokens** reach content subjects only. Effective permissions are
   the scope ∩ the creator's **current** role rows (D5): actions and field
   lists intersect, and the creator's conditions always apply. Tokens have
   no conditions of their own. A scope entry for a slug meets the creator's
   rows for that slug, or their `*` rows when they have none. A `*` entry
   meets every creator content row. For an owner creator, the scope applies
   as written. At save time (create and update) the scope must also be a
   **subset** of the creator's current rows (`scopeEntriesBeyondCreator`):
   same action on the entry's subject (or on `*`, when the creator has no
   row for that slug), field list inside the union of the creator's lists,
   and a `*` entry only against `*` rows. Conditions are not compared. An
   Owner editing another account's token is checked against that token's
   creator. Later loss of a permission is handled by the intersection.
8. `fieldsFor(actor, subject, writeAction = 'update')`: readable fields come
   from `read` rows, writable fields from `writeAction` rows. Field lists
   apply to content types only. A system subject is all or nothing.

The rank rule (target rank < actor rank, D6) is not part of the evaluator.
The T17 services enforce it inside each write transaction, with the target
row locked (`domain/Rank.rules.ts`):

- account writes: the target's current role rank and any role being
  assigned must be below the actor's rank; the actor never targets itself;
- role writes: the role's rank and any new rank must be below the actor's;
- permission sets: on top of the rank, a non-owner may grant a system
  subject action only if it holds that action itself (`grantsBeyondActor`).
  Content subjects are bounded by the rank rule alone; field-level subsets
  are not compared.

Only `account` actors pass `requireAccountActor`; tokens are content-only
and reviewers read-only, so the guard already denies them system subjects.

## Field lists

`readable_fields`, `writable_fields` and token scope lists hold API field
paths: `title`, or `reference.phone` for nested fields. A component path
covers its whole subtree. `null` means every field. Lists are only valid on
a specific content type: `readable_fields` on `read` rows, and
`writable_fields` on `create`/`update` rows. Every path must exist in the
definition, with no duplicates.

### Content types API (T17b)

`GET /content-types` and `/content-types/:slug` describe each type's field
paths with the same `FieldSelection` the serializer uses:

- a type is visible when `can(actor, read, slug)`; its paths are those
  `fieldsFor(actor, slug).readable.reaches(path)` keeps, and its system
  fields follow `recordReadAccess` (no `createdBy` / `updatedBy` for
  reviewers or anonymous actors);
- an actor allowed `roles:update` (`FULL_CATALOG_PERMISSION`) sees every type
  and field, since a role manager has to name fields it may not read itself
  (decision T17b). Field names are schema, not record data, and the rank
  rule still bounds which roles it can change;
- a hidden type answers the same `404 CONTENT_TYPE_NOT_FOUND` as an unknown
  one, so the API does not reveal which types exist.

## Field masking and write allowlist (T16, D3/D4)

Building blocks for the document endpoints (T20/T21). Each is created per
content type (`new X(registry.resolve(slug))`). Reads take a
`RecordReadAccess` from `recordReadAccess(actor, fieldsFor(...).readable)`:
the readable content fields plus the system fields the actor kind may see.
Writes take the `FieldAccess` from `fieldsFor()`.

**Read path.** `projectTable(type.root, readable)` returns a copy of the
plan tree with only readable columns, and without component tables that
nothing readable lies in. Pass it where the registry root would go
(`loadComponentTrees`, `rowToValues`, `selectedColumns(table, access)`
for the root select), so masked columns never reach SQL. Then
`RecordSerializer.serialize(record, access)` builds the response:

```json
{
  "documentId": "…",
  "version": 3,
  "publishedAt": null,
  "locale": null,
  "createdAt": "…",
  "updatedAt": "…",
  "createdBy": 1,
  "updatedBy": 2,
  "values": { "position": "Lead", "company": "***", "salary": null },
  "components": {
    "reference": null,
    "experience": [
      {
        "componentUid": "…",
        "values": { "company": "***", "years": 4 },
        "components": { "roles": [] }
      }
    ]
  },
  "_maskedFields": ["company", "salary", "reference", "experience.company"]
}
```

Decisions (T16):

- **Mask values** (SPEC §6): `"***"` for string/text/richtext, `null` for
  every other type and for a masked component (single or repeatable).
  A masked field gets its mask even when it is empty in the DB.
- **`_maskedFields`** is one list at the root, in definition order, with
  dotted definition paths and no item index (`experience.company`, not
  `experience[0].company`): field permissions are the same for every item.
  A fully masked component is listed once by its own path. A partly
  readable component (some sub-field readable, e.g. `reference.name`) is
  shown with its items, and its masked sub-fields are listed and masked in
  every item. The list depends only on the definition and the selection,
  not on the data.
- **System fields** (`RECORD_SYSTEM_FIELDS`): `documentId`, `version`,
  `publishedAt`, `locale`, `createdAt` and `updatedAt` are always readable
  and may be filtered and sorted on. Field lists cannot name them.
- **Account references** (user decision T16): `createdBy` and `updatedBy`
  are shown to signed-in accounts and API tokens only. For anonymous and
  reviewer actors (`ACCOUNT_REFERENCES_HIDDEN_FROM`) they are **omitted**
  (the keys are absent, not masked, and not in `_maskedFields`, which lists
  content fields only). `selectedColumns` does not select `created_by` /
  `updated_by` for them, and `QueryGuard` rejects filter, sort and search on
  them with 400 `FIELD_NOT_READABLE`. A row condition may still compare them
  in the WHERE clause. Internal row ids and `orderIndex` are
  never sent: `documentId` and `componentUid` are the public keys, and
  list order is the item order.
- The serializer builds its output from the definition, never by copying
  the record. A raw value in the record for a masked field (a load without
  the projection) is still masked, and keys the definition lacks are never
  copied.
- `SerializedRecord` is a branded type. Response types of document
  endpoints must use it.

**Only path.** The architecture test
`RecordSerializer.architecture.spec.ts` (a static scan of `src/`) fails
when the following holds. Imports are resolved to the real file by
`src/architecture/ImportGraph.analyzer.ts` (an `index.ts` facade is followed to the
file that defines each symbol), and `FacadeReexports.architecture.spec.ts`
fails when a module `index.ts` re-exports `KyselyContent.repository`,
`TreeLoader.adapter` or `FieldProjection.rules`:

- a file outside the content engine imports `KyselyContent.repository` or
  `TreeLoader.adapter` without also importing `domain/RecordSerializer.rules`;
- a file in an `http/` folder, or a controller, filter, interceptor or gateway by suffix, imports them at all;
- a file other than the serializer casts to `SerializedRecord`.

So list, detail, 409 conflict, bulk conflict, audit metadata and
error-detail bodies all go through `serialize`.

**Facades (R1-14).** Every folder under `src/modules/` has an `index.ts`, and
code outside a module imports it through that file only (ESLint
`no-restricted-imports`, patterns in `apps/cms-api/eslint.config.mjs`).
Named exceptions, each kept out of the facade on purpose: `adapters/KyselyContent.repository`,
`adapters/TreeLoader.adapter`, `domain/ContentRowMapping.rules` and `domain/ContentTree.entity`
in `content-engine`, `domain/FieldProjection.rules` and `document-auth/index.ts`
in `access`. `Modules.architecture.spec.ts` also enforces the two SPEC §2
sub-rules: `security-audit` imports access core with `import type` only, and
`content-types` and `media` import only `JwtAuthGuard` and
`AuthenticatedRequest` from `identity` (their Nest modules do not import
`IdentityModule`; the `jwt` passport strategy is registered by the
`IdentityModule` the app loads).

**Write path.** `WriteAllowlist.apply(payload, fields)` takes the tree part
of a body (`{ values, components }`; T21 takes `version` off first) and
returns the `TreeInput` to pass to `assertTreeInput` and `replaceTree` /
`insertTree`:

| Key in the payload                                    | Result                                          |
| ----------------------------------------------------- | ----------------------------------------------- |
| `_maskedFields` (root or item)                        | ignored                                         |
| unreadable field carrying its mask (`"***"` / `null`) | dropped; the DB value is unchanged (absent key) |
| field or key the definition does not have             | 400 `FIELD_UNKNOWN`                             |
| any other field that is not writable                  | 400 `FIELD_NOT_WRITABLE`                        |
| not an object / list where one is needed              | 400 `BAD_REQUEST`                               |

A component list replaces the stored list (items not sent are deleted), so
sending one needs the **whole component** writable. A grant on only some
sub-fields (e.g. `writable: ["reference.phone"]`) does not allow sending
`reference` (decision T16, fails closed). Inside a writable component,
masked sub-fields that come back with their mask are dropped per item, so a
matched item (`componentUid`) keeps them.

**Query path.** `QueryGuard.assert({ filter, sort, search }, access)`
takes the field paths a list query uses. System fields the access includes
pass. An unknown path is 400 `FIELD_UNKNOWN`. An unreadable field, or
`createdBy` / `updatedBy` for an anonymous or reviewer actor, is 400
`FIELD_NOT_READABLE`.
T20 (`DocumentsQueryService.list`) calls it with the `filter` and `sort`
paths before any SQL is built; a free-text search (not built yet) must only
search readable fields.

**Document reads (T20).** `DocumentAuthGuard` (JWT, `ak_live_` token, or no
header = `AnonymousActorService`) then `PermissionGuard`. For every read the
service builds `recordReadAccess(actor, fieldsFor().readable)` once and
passes it to `projectTable` / `selectedColumns`, `QueryGuard.assert` and
`RecordSerializer.serialize`. `status=draft` needs `canReadDrafts`. The
actor's `rowFilter` is part of the WHERE clause of list, total and detail.
Anonymous reads are throttled per IP (`DOCUMENTS_RATE_LIMIT_POLICIES.DOCUMENT_READ_ANONYMOUS`,
120/min, key source `ANONYMOUS_IP`, which skips every non-anonymous actor).
Endpoint rules: `apps/cms-api/README.md` "Documents, read".

**Document writes (T21).** `DocumentsCommandService`: `fieldsFor(actor, slug,
'create' | 'update').writable` feeds `WriteAllowlist.apply` (the `version`
key is removed from the body first), then `assertTreeInput`, then the value
rules, then the transaction. The `update` `rowFilter` is in the WHERE of the
OCC `UPDATE`. A 409 body (`server`, `submitted`, `diff`) is built only from
`RecordSerializer` output made with the actor's **read** access and the
**read** row filter, so an update-only actor, or one whose read conditions
exclude the row, never gets raw or unreadable values back; the 200/201 bodies use the same gate (else only `{ documentId, version }`). After `replaceTree` the `update` row filter is checked again on the new content (403 + rollback). `create` rows take no conditions (validator). Writes are not throttled in v1 (user decision). Rules: README
"Documents, write".

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

| Write                                                      | Where                                                                | Invalidates |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------- |
| Password change, reset or set                              | `password.service.ts`                                                | the account |
| Refresh-token reuse                                        | `application/RefreshToken.service.ts`                                | the account |
| Role permission changes                                    | `RolePermissionsService.replacePermissions` (bumps `policy_version`) | the role    |
| Account role/name change, disable, enable, revoke sessions | `application/Accounts.service.ts` (disable/revoke bump `tv`)         | the account |
| Role rename/re-rank (bumps `policy_version`), delete       | `application/Roles.service.ts`                                       | the role    |

A read that started before an invalidation is not cached (generation
check), so it cannot re-cache pre-write data. Writes the process cannot see
(the `owner:reset-2fa` CLI, another replica, manual SQL) take effect within
`VERSION_CACHE_TTL_MS` (5 s).

Permission writes go through `RolePermissionsService.replacePermissions()`
only; T17 adds its audit row (and a locked rank re-check) through
`alsoInTransaction`.

**Swap point (more than one replica).** `VersionCache` and the rate-limit
store are in memory. Before scaling out, replace `VersionCache` with a
shared store or a pub/sub invalidation. Until then, other replicas are
bounded by the 5 s TTL.

**Content registry.** `ContentRegistry` (content-engine `application/`, exported as `ContentRegistry`)
loads `content._content_types` on first use, not at boot, so the API still
starts while the database is down (readiness 503). A failed load is retried
on the next call, and a successful load is kept until restart (D10). If
`content:migrate` never ran, the registry is empty and every content
subject is denied.
