# ADR 0006: Clean-architecture layers inside each cms-api module

- Status: accepted (2026-10-25) for sections 1-6 with the user's answers to Q-CA1..Q-CA4 (end of this file). Section 7 holds the amendments the audit (CA1a-CA4) proved and CA5 settled. The audit questions Q-CA5..Q-CA17 were answered by the user on 2026-10-25 (end of this file). Item 7.13 (file granularity) was decided by the user on 2026-10-25.
- Date: 2026-10-25
- Amends (once accepted): SPEC §2 "Module directions (cms-api)", §5 project structure and naming

## Context

The user asked for cms-api core logic to be separated from framework parts, clean-architecture style, with an audit first and the refactor after it.

Planning probes on the current code (to be confirmed by the audit, not findings yet):

- 85 non-spec files under `src/modules/` import `@nestjs/*`, and business rules sit in the same `*.service.ts` classes as Nest DI and HTTP concerns.
- 29 non-controller files throw Nest HTTP exceptions (`BadRequestException`, `ConflictException`, ...), so domain rules decide HTTP status codes. Examples: `identity/auth.service.ts`, `access/management/accounts.service.ts`, `documents/documents.command.service.ts`, `media/upload.pipeline.ts`.
- 29 module files use Prisma directly (no repository port). Only the platform adapters (`src/infrastructure/{mail,media,turnstile,activity}`) sit behind `*.port.ts` interfaces.
- `common/time/clock.ts` is already a port for time, and `src/architecture/import-graph.ts` with `module-edges.constants.ts` already guards which module may import which. Both stay and are reused.

## Decision

### 1. Layers live inside each module

The SPEC §2 module map and its guard stay as they are. Each module folder gets four layer folders:

```
src/modules/<module>/
  domain/        entities, value objects, business rules, domain errors. Plain TypeScript.
  application/   use cases (application services) and the ports this module needs
                 (repository and gateway interfaces with their injection tokens)
  adapters/      implementations of this module's ports: Prisma / Kysely repositories,
                 wrappers of libraries that do I/O (mail, storage, HTTP clients);
                 library calls without I/O (argon2, jsonwebtoken, otplib, node:crypto)
                 get no port and stay in application/ (section 7.13)
  http/          controllers, *.requests.ts (Zod), guards, decorators, *.routes.ts,
                 mapping from use-case results to response bodies
  cli/           CLI entry points (existing); they call use cases, never adapters directly
  <module>.module.ts   Nest wiring only: binds ports to adapters, lists controllers
  index.ts             the module's public interface (facade)
```

Small modules may omit a layer they do not need (for example `health` has no `domain/`). A layer folder is never split across modules.

The folder name is `adapters/` and not `infrastructure/` so it is not confused with the platform folder `src/infrastructure/` (shared adapters used by several modules).

### 2. Dependency rule (one direction)

| Layer                            | May import                                                                                                                     | Must not import                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                         | its own `domain/`, pure `common/` helpers and constants, `common/errors`                                                       | anything else; any third-party framework or I/O package                                                                                                                |
| `application`                    | its own `domain/` and `application/`, other modules' facades (application exports only), platform ports (`*.port.ts`, `Clock`) | `@nestjs/*` (see Q-CA1), `express`, `@prisma/*`, `src/generated/**`, `kysely`, `pg`, `passport*`, `process.env`, Nest HTTP exceptions, its own `adapters/` and `http/` |
| `adapters`                       | its own `application/` (ports) and `domain/`, platform `infrastructure/`, third-party libraries                                | its own `http/`                                                                                                                                                        |
| `http`                           | its own `application/` and `domain/` types, other modules' facades, `common/` HTTP pipeline, `@nestjs/*`, `express`            | its own `adapters/`, Prisma, Kysely                                                                                                                                    |
| `<module>.module.ts`, `index.ts` | everything in the module                                                                                                       | -                                                                                                                                                                      |

The rule table lives in one place, `src/architecture/layer-rules.constants.ts` (`LAYER_RULES`), and `src/architecture/layers.architecture.spec.ts` checks every resolved import against it with the existing `import-graph.ts`. Existing violations go in `KNOWN_LAYER_VIOLATIONS` and leave it module by module, the same pattern R1-03 used for module edges (stale entries fail).

### 3. Errors: domain errors, one HTTP mapping

- New platform file `src/common/errors/domain-error.ts`: `class DomainError extends Error { kind; errorCode; details? }`.
- `kind` is one of a closed list in `common/errors/domain-error-kinds.constants.ts`: `invalid_input`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `gone`, `too_large`, `rate_limited`, `unavailable`. The final list comes from the audit (check L2).
- `common/filters/http-exception.filter.ts` maps `kind` to the HTTP status through one table, `DOMAIN_ERROR_HTTP_STATUS`. The response body stays `{ errorCode, message, details }` (contract unchanged, Q-A8).
- Error codes stay in the owning module's `*.constants.ts` and in `public-constants.json`.

### 4. Persistence behind repository ports

- One repository port per aggregate, in the owning module's `application/` (for example `AccountRepository` in `access/management`). The Prisma or Kysely implementation sits in `adapters/`.
- Domain types are defined in `domain/`; adapters map Prisma rows to them (see Q-CA3).
- Transactions: if the audit (check L3) finds use cases that need several repositories in one transaction, a `TransactionRunner` port goes into platform `src/infrastructure/database`. Not built before the audit shows the need.
- The content engine keeps its own rules (SQL names only from `naming.ts`, reads through `ContentDbProvider.db`); its repository already exists and moves into `content-engine/adapters/` unchanged.

### 5. Facades

`index.ts` exports the Nest module, application use cases and port types, and domain types other modules need. It may also export `http/` guards and decorators that other modules' `http/` layers use (`JwtAuthGuard`, `RequirePermission`); the layer rule stops any `application/` file from importing them. A facade never exports `adapters/`. The existing exceptions (`access/field-projection`, `access/document-auth`, `content-engine/content.repository`, `content-engine/tree-loader`) are re-checked by the audit.

### 6. Platform folders

- `src/infrastructure/` keeps the shared adapters and their `*.port.ts` files (several modules use them). Amended by Q-CA14a: an adapter or port used by one module only moves into that module (`application/` port, `adapters/` implementation).
- `src/common/` keeps the shared HTTP pipeline (filters, middleware, guards, rate limit) and pure helpers. The audit classifies each file as HTTP-pipeline or pure (check L7); pure helpers may be imported by `domain/` and `application/`, pipeline files only by `http/`.
- The composition root (`main.ts`, `bootstrap.ts`, `app.module.ts`, `app.setup.ts`) is unchanged.

## Module ownership, names, extension path

- **Ownership:** each module still owns one SPEC §2 responsibility. Inside it, `domain/` owns the rules, `application/` owns the use cases and port definitions, `adapters/` owns I/O, `http/` owns transport. Error-to-status mapping has one owner: `common/filters`. Layer rules have one owner: `layer-rules.constants.ts`.
- **Key names:** `domain/`, `application/`, `adapters/`, `http/`; `DomainError`, `DOMAIN_ERROR_HTTP_STATUS`, `LAYER_RULES`, `KNOWN_LAYER_VIOLATIONS`, `<Aggregate>Repository` ports with `Prisma<Aggregate>` adapters. File names follow ADR 0008 once it is accepted.
- **Extension path:**
  - New use case: one file in `application/`, one handler in `http/`, one provider line in `<module>.module.ts`.
  - New storage technology for an aggregate: one adapter file and one binding change in `<module>.module.ts`; no use case changes.
  - New error kind: one entry in `domain-error-kinds.constants.ts` and one row in `DOMAIN_ERROR_HTTP_STATUS`.
  - New module: a folder with the layers it needs, one SPEC §2 row and one `ALLOWED_MODULE_EDGES` row (unchanged from today).

## Migration

1. Audit (CA1a-CA4, read-only) classifies every file, lists every violation and proposes the target file map per module.
2. CA5 (planner) writes refactor tasks: first the guard and `DomainError` (platform), then one module per task, smallest and lowest-risk first (`health`, `content-types`) as the pattern, high-risk modules (identity, access, reviewer, media) last with `Security gate: yes`.
3. Every refactor task is behavior-preserving: same routes, response bodies, error codes, audit rows and timing-parity tests. Moves use `git mv` without content change in the same commit (Q-CA4).

## Alternatives considered

- **Global layer folders** (`src/domain`, `src/application`, ...): rejected. It splits each capability across four top-level folders and breaks the SPEC §2 module ownership and the module-edge guard.
- **Suffix-only layering** (keep flat module folders, mark layers by file suffix): rejected. Harder to see and to guard; a path-prefix rule is simpler to check and read.
- **Full DDD** (aggregates with domain events, CQRS buses): rejected. The spec has no need for it; it adds ceremony without a second consumer.
- **Leave as is, only stop HTTP exceptions in services**: smaller, but does not meet the request (framework parts and persistence stay mixed with rules).

## Consequences

- Many file moves per module; reviewers see large but mechanical diffs (moves separated from edits).
- Use cases become unit-testable with `new` and fake ports, without a Nest testing module.
- Mapping code between Prisma rows and domain types is added in adapters.
- `docs/modules/*.md`, module READMEs and SPEC §5 are updated as each module moves.

## 7. Amendments from the audit (CA5, 2026-10-25)

Sources: `.claude/state/findings/AUDIT-CA1a.md`, `AUDIT-CA1b.md`, `AUDIT-CA2.md`, `AUDIT-CA3.md`, `AUDIT-CA4.md`. These follow from sections 1-6, the user's answers, and the migration rule "behavior-preserving" (Migration 3).

1. **Error kinds (section 3, final list).** `invalid_input` 400, `unauthenticated` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `too_large` 413, `unsupported_media_type` 415, `rate_limited` 429, `unavailable` 503. `unsupported_media_type` is added (3 media sites answer 415 today; mapping them to 400 would change the contract). `gone` is dropped: no site needs it.
2. **`DomainError` shape.** `kind`; optional `errorCode: string` (a plain string, because two sites take the first validation issue's code); optional `message` (a free string; one code may carry several messages); optional `details`; optional `retryAfterSeconds` (`rate_limited` only). A `DomainError` with no `errorCode` and no `message` describes exactly as the matching Nest exception does today: `errorCode = ERROR_CODE_BY_STATUS[status]` and Nest's default message for the status (for example `new ForbiddenException()` gives `403 FORBIDDEN "Forbidden"`). So the bare 401 / 403 / 404 / 503 sites keep their bodies byte for byte (this settles Q-CA11: keep them as they are; adding codes would be a separate contract change).
3. **One error reader.** `describeHttpException` becomes `describeError(unknown)` in `common/http/` (Nest `HttpException`, `DomainError`, anything else as a generic 500). The REST filter, the GraphQL error formatter, the bulk per-item error mapping and the GraphQL "missing document is null" check all read errors through it; nothing outside `common/` reads `instanceof HttpException`. The 5xx rule stays: generic message, no `details`. The filter writes `Retry-After` for a `rate_limited` error that carries `retryAfterSeconds`.
4. **`TransactionRunner` (section 4; audit shows the need: 9 identity, 13 access, 3 reviewer/media and every documents write flow).** Port `src/infrastructure/database/TransactionRunner.port.ts`: `run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T>`; `UnitOfWork` is opaque to `application/` and offers `afterCommit(callback)` (cache drops after commit; synchronous callbacks only, item 12). Two bindings because there are two pools: `CORE_TRANSACTION_RUNNER` (Prisma: identity, access, security-audit, media, reviewer; adapter in `infrastructure/database/`) and `CONTENT_TRANSACTION_RUNNER` (Kysely content DB: content-engine, documents), the latter with `runInSavepoint(unit, work)` for bulk per-item work. Its adapter lives in `content-engine/adapters/` because it needs the content DB provider and the platform never imports a module. Repository methods that write take the `UnitOfWork`. Cross-module signatures that take a Prisma `tx` today (`revokeAllSessions`, `OtpService.issue` / `tryConsume`, `writeAuditLog`, `RolePermissionsService` `alsoInTransaction`) change to `UnitOfWork` in their owner's CR task; a not-yet-migrated caller wraps its Prisma `tx` with a transitional helper of the Prisma adapter, removed when the last caller has moved.
5. **Logging in `application/`.** Q-CA1 allows only `@Injectable` and `@Inject`, so a use case logs through a platform port `src/infrastructure/logging/AppLogger.port.ts` (`APP_LOGGER`, `warn`, `error`) with a Nest `Logger` adapter. `http/`, `adapters/`, `jobs/` (if Q-CA7 is yes) and wiring keep Nest `Logger`.
6. **Platform roles by folder (settles Q-CA15a).** After the two platform splits (`request-parsing`, `error.constants`): `common/constants/`, `common/errors/`, `common/time/`, `common/types/` (plain value types such as `ClientMeta`) and `common/validation/` (shared zod schemas: pagination, document id) are pure (any layer); `common/http/`, `common/middleware/`, `common/filters/`, `common/guards/`, `common/rate-limit/` are HTTP pipeline (`http/` and wiring only); `infrastructure/**/*.port.ts` are ports (`application/`, `adapters/`); `infrastructure/scheduling/` is the job runner (`jobs/` and wiring only; Q-CA7); every other `infrastructure/` file is an adapter (`adapters/`, `cli/` and wiring only); `config/` is typed config (`application/`, `adapters/`, `http/`, `cli/`, `jobs/`, wiring; `http/` because guards such as `allowed-origin.guard.ts` read `APP_CONFIG`), never `process.env`. When two folder prefixes match a file, the longer one wins. (Amended 2026-10-25 by the CR-pf-3 design review, item 11.)
7. **`ClientMeta` (settles Q-CA15d).** The plain `{ ip, userAgent }` interface moves to `common/types/`; `clientMetaOf(clientIp, req)` stays in `common/http/client-meta.ts`, which re-exports the type so existing imports keep working (additive).
8. **Layer guard rollout (settles Q-CA15b).** `layers.architecture.spec.ts` checks the modules listed in `MIGRATED_MODULES`; a listed module may have no file outside its layer folders except `<Module>.module.ts` and `index.ts`. `KNOWN_LAYER_VIOLATIONS` holds entries of listed modules only (stale entries fail). The last CR task lists every module and removes the list. An import from a listed module into a module that is not listed yet is judged on the import only (facade-only, `domain/` type-only, packages, banned text); the files it reaches are not judged, because they have no layers yet. When a module joins the list, the guard judges every listed consumer's imports of it, and that module's task fixes them or adds a transitional `KNOWN_LAYER_VIOLATIONS` entry naming the task that removes it (item 11).
9. **Prisma vocabulary (from Q-CA3).** `PermissionAction` and `AccountStatus` are domain constants in `access/domain/`; `TwoFaMethod` and `OtpPurpose` in `identity/domain/`. String values equal the Prisma enums (they are stored and appear in token scopes and audit metadata); adapters map 1:1 with a compile-time exhaustive check and a parity spec.
10. **Dropped from the audit proposals.** `IdGenerator` / `TokenGenerator` / `StorageKeyGenerator` / `RandomSource` ports: `node:crypto` is not a banned package for `application/` and no test needs fixed ids; `uuidv7` gets its time from `Clock` as an argument. The typed `RowCondition` tree for row filters (CA1b L5) is not built in the refactor (see Q-CA17).
11. **Layer guard decisions (design review of CR-pf-3, 2026-10-25; sub-item 4 added after CR-hc-2).**
    1. **Node built-ins in `domain/`: named functions only.** The user's rule is "pure packages allowed, I/O banned". `createHash` is pure and deterministic, so `domain/` may import it (the content fingerprint in `content-engine` `sql-generator`). The rest of `node:crypto` is not: `randomUUID` / `randomBytes` are not deterministic, the same reason `domain/` bans `new Date()`; ids and tokens are made in `application/` or `adapters/` (item 10). The allowance is a name list per built-in, `ALLOWED_DOMAIN_BUILTIN_IMPORTS = { 'node:crypto': ['createHash'] }`, checked the way `@nestjs/common` is checked for `application/`: a namespace, default or other named import fails, and the bare specifier `crypto` fails. This replaces the whole-package `ALLOWED_DOMAIN_NODE_BUILTINS`.
    2. **Unmigrated targets are not judged; deep imports stay banned.** Confirmed as built (wording in item 8). Judging an unmigrated module's files would flag every cross-module import of the pilot, because those files are all "unlayered". Not judging them leaves a gap only until the target module migrates, and the guard closes it then. Deep imports into any module stay banned for every layer, migrated target or not, except the named `LAYER_EXCEPTIONS`.
    3. **Platform roles and the `cli/` and `jobs/` rows.** `domain` pure; `application` pure, port, config; `adapters` pure, port, adapter, config, generated; `http` pure, pipeline, config (no ports: `http/` calls use cases); these four are confirmed. Two rows change:
       - `cli/` is the composition root of its own process (a CLI has no Nest container): it may import its own `adapters/`, another module's adapter reached through its facade (only `loadDefinitions` is exported that way, Q-CA14b, used by `graphql/cli/print-schema.ts`), platform adapters, `generated/` and any package. Business rules stay in use cases; a `cli/` file holds argument parsing, terminal I/O and composition only. This is how section 1's "they call use cases, never adapters directly" is read: a CLI builds adapters and hands them to use cases, and never uses an adapter to do the work of a use case. The guard checks imports; review checks the rest. `cli/` still may not import its own `http/` or `jobs/`.
       - `jobs/` may import the job runner role (`infrastructure/scheduling/`, the shared interval-job helper of Q-CA7, created in CR-md-1) and loses the port role: a job calls use cases only (Q-CA7) and needs no port. Rows: pure, config, scheduling.
    4. **Values from other modules in `domain/` (Q-CA6, decided 2026-10-25 after CR-hc-2).** Besides `import type`, a `domain/` file may import a _named pure value_ from another module's facade, along an edge already in `ALLOWED_MODULE_EDGES`. A named pure value is either a pure function (no I/O, no state, no clock, no randomness) or an `as const` data constant with no function members. Each such name is listed once in `DOMAIN_CROSS_MODULE_VALUES` in `layer-rules.constants.ts` (the list is renamed from `DOMAIN_CROSS_MODULE_HELPERS`). A name that is not listed fails the layer guard. Reason: a frozen constant carries no more coupling than a pure helper, and both are the owner's single source. Passing them into a rule as arguments only to avoid the import widens every signature and makes each caller know what the rule needs. Classes, Nest providers, stateful objects and anything that reaches an adapter stay banned. Extension path: one new name in `DOMAIN_CROSS_MODULE_VALUES`, reviewed against this definition.
    - **Ownership:** `layer-rules.constants.ts` stays the one owner of every allowance; `layer-check.ts` holds no rule data.
    - **Names:** `ALLOWED_DOMAIN_BUILTIN_IMPORTS`; platform role `scheduling`.
    - **Extension path:** another pure built-in function for `domain/` is one name in `ALLOWED_DOMAIN_BUILTIN_IMPORTS`; a new platform folder is one `PLATFORM_ROLE_FOLDERS` row (the longest prefix wins, so row order does not matter); a new role is one `PlatformRole` value plus the rows that may import it.
12. **After-commit callbacks are synchronous (CR-pf-5 security review, 2026-10-25; amends item 4).** The review asked whether a slow or hung callback, awaited one after another, may delay the cache drops after it and the response. Decision: neither a timeout nor an ordering rule; `afterCommit` takes synchronous callbacks only.
    - **Rule.** The port signature is `afterCommit(callback: () => void): void`. An after-commit callback does in-memory work only (today: `VersionCache.invalidateAccount` / `invalidateRole`, which are synchronous `void` methods). The runner calls the callbacks in registration order, synchronously, after the commit and before `run` resolves, so every cache drop has happened before the use case returns and the response is sent. This keeps SPEC D9 ("with one replica that's immediate") with no added latency and no tunable.
    - **Misuse.** At compile time, `@typescript-eslint/no-misused-promises` (on through `recommendedTypeChecked` in `@abyss/base-config`) rejects an `async` function passed where `() => void` is expected. At run time, a callback that returns a thenable is not awaited: the runner logs an error (`An after-commit callback returned a promise; after-commit callbacks must be synchronous`), attaches a rejection handler that logs the rejection the same way (message only, so no unhandled rejection), and goes on with the next callback at once. A callback that throws is logged and does not stop the later ones (unchanged).
    - **Post-commit I/O** (mail, activity tracking, outside calls) is not an after-commit callback. The use case does it after `run` resolves, with its own error handling, as `publish.service` `track` and the invite / password mail do today.
    - **Why not a timeout.** A timeout cannot cancel the callback, only stop waiting for it; it cannot interrupt a synchronous callback at all; and the spec gives no value to choose, so any number would be a guess that still adds up to that much latency per hung callback on the request path.
    - **Why not "cache drops first".** It needs two kinds of callback (a priority or a second method) for a problem that disappears once nothing slow can be registered.
    - **Ownership.** `src/infrastructure/database/AfterCommitCallbacks.store.ts` is the one owner of the callback list, the unit state (`open` → `committed` / `rolledBack`, CR-pf-5 finding F1) and the synchronous run with its logging. The Prisma unit (`PrismaTransactionRunner.adapter.ts`) and the content unit (`content-engine/adapters/KyselyContentTransactionRunner.adapter.ts`, CR-ce-2) both use it; neither keeps its own list.
    - **Names.** `AfterCommitCallbacks` (`register(callback)`, `markCommitted()`, `markRolledBack()`, `runAll(logger)`); `AfterCommitCallback = () => void`.
    - **Extension path.** A new cache that must drop on commit registers a synchronous callback; nothing in the runner changes. If a real need for awaited post-commit work appears, it is an additive, separately named port method with its own timeout decision, never a change to `afterCommit`. Not built now.
13. **File granularity (user decision, 2026-10-25; amends sections 1 and 4 and every target file map).** The layered modules were split too finely for a person to review (after CR-hc-1, `health` had 6 of 8 source files under 30 lines; the audit map for `media` planned about 35 files). Layers stay as in sections 1-2; inside a layer, files follow `code-standards` §4.4.
    - **Rule.** Split by layer, then by use case. Per module layer at most one ports file (`<Module>.port.ts`, ADR 0008 word `port`; user answer Q-R1, 2026-10-25) and one constants file (`<Module>.constants.ts`, or `<Module><Layer>.constants.ts` when a layer needs its own). No types-only, single-constant-group or re-export-only files. No file under 30 lines except `index.ts`, `<Module>.module.ts` and files a layer rule requires. A port exists only where the layer rules forbid the I/O in the caller or a second implementation (including a spec fake) exists; a one-call library wrapper stays inside its adapter; a library call without I/O (argon2, jsonwebtoken, otplib, `node:crypto` HMAC / HKDF / AES) gets no port and no adapter and stays in the `application/` file that uses it (user answer Q-R3, 2026-10-25; amends section 1); one adapter per aggregate and storage technology. A new file needs a reason: separate use case or entry point, own spec, over 300 lines, or a layer rule.
    - **Check.** A new endpoint or use case touches at most 6 files. A target file map states its file count per module.
    - **Supersedes.** The L8 target file maps in `.claude/state/findings/AUDIT-CA*.md` and the file lists of CR tasks written before this item, where they conflict. The planner revises the open CR tasks before they are dispatched; modules already moved (health, content-types, content-engine, the platform files of CR-pf-1..6) are consolidated by separate behavior-preserving tasks.
    - **Unchanged.** Layer rules, the layer guard, ADR 0008 naming, facades, the error model, the transaction runner, behavior-preserving migration (same routes, bodies, error codes, audit rows; tests change import paths only).

## Open questions

Answered (user, 2026-10-25, recorded in `.claude/state/handoff.md`):

- **Q-CA1: Nest decorators in `application/`.** A: only `@Injectable()` and `@Inject(token)` from `@nestjs/common`.
- **Q-CA2: layer folder names.** `domain/`, `application/`, `adapters/`, `http/`.
- **Q-CA3: Prisma types in the core.** No Prisma types in `domain/` or `application/`; adapters map rows.
- **Q-CA4: renames.** Blanket approval for `git mv` and renames inside approved CR tasks, no content change in the same commit; whole-file deletions still asked each time.

Answered (user, 2026-10-25, handoff "CA5 user answers"; the details are in `tasks/todo.md` "Phase CR"):

- **Q-CA5 / Q-CA13:** `zod` and `sanitize-html` are allowed in `domain/` (`ALLOWED_DOMAIN_PACKAGES`); I/O packages stay banned.
- **Q-CA6:** `domain/` may use `import type` from other modules' facades, plus named pure values (pure functions and `as const` data constants) listed in `LAYER_RULES`, along existing module edges only (section 7.11).
- **Q-CA7:** a `jobs/` layer folder for scheduled entry points (lifecycle hooks and `Logger` allowed; calls use cases only), with one shared interval-job helper in `src/infrastructure/scheduling/`.
- **Q-CA8:** moot (Q-CA14a).
- **Q-CA9b:** SQL on tables a module does not own stays in the consuming module, behind a port (narrow selects).
- **Q-CA10:** `graphql/rules/` and `graphql/schema/` live in `http/`.
- **Q-CA14a (also Q-CA9a, Q-CA12b):** the single-consumer folders `infrastructure/{activity,media,turnstile}` and the database-health port move into documents, media, reviewer and health. Section 6 now reads: `src/infrastructure/` keeps adapters and ports used by several modules (`database`, `mail`, `logging`, `scheduling`).
- **Q-CA14b:** `loadDefinitions` and `DEFAULT_CONTENT_PATHS` stay on the content-engine facade.
- **Q-CA14c:** `DocumentNotFoundError` from a concurrent delete answers `404 DOCUMENT_NOT_FOUND` (a planned change in CR-dc-3).
- **Q-CA15c:** `access/<layer>/` (core), `access/management/<layer>/`, `access/document-auth/<layer>/` with its own `index.ts`; module-graph nodes are decided by folder.
- **Q-CA16:** only `resolver` is added to ADR 0008.
- **Q-CA17:** `kysely` stays in `access/domain/PolicyEvaluator.ts` and `access/domain/Conditions.rules.ts` as the one named `LAYER_RULES` exception; other modules' `application/` receive the opaque `RowFilter` type.
- **Q-CA12, Q-CA15a / b / d:** as settled in section 7.
