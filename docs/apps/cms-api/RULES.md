---
app: cms-api
summary: Rules every cms-api module must keep
---

# cms-api: rules

Part of the [project spec](../../../SPEC.md). App `cms-api`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Module directions and layers

Applies to: all flows.

Amended 2026-10-23 (audit G6): the map follows the code and is the one authority for which module may import which.

- A file in module A may import from module B only when B is in A's "Depends on" cell; no cycles. `apps/cms-api/test/architecture/ModuleEdges.constants.ts` (`ALLOWED_MODULE_EDGES`) mirrors the cms-api rows row for row; change both together.
- `platform` (`src/common`, `src/config`, `src/infrastructure`, `src/generated`) never imports `src/modules/**`. The composition root (`app.module.ts`, `app.setup.ts`, `bootstrap.ts`, `main.ts`) may import any module.
- `access` is one folder with three parts, by folder (Q-CA15c): core `access/<layer>/` with `access/Access.module.ts` and `access/index.ts`; management `access/management/<layer>/` and document auth `access/document-auth/<layer>/`, each with its own module file and `index.ts`. Core never imports `identity`; only management and document auth do. `AccessModule` (core) imports `ContentEngineModule`.
- "types only" = `import type` (security-audit uses the `ActorContext` and `SystemSubject` types). "auth guard only" = the JWT guard and `AuthenticatedRequest`, nothing else.
- Other modules use a module only through its `index.ts` (public interface), never internal files.
- `KNOWN_VIOLATIONS` (edges the code has but the table forbids) is empty and must stay empty.
- Adding a module: one table row and one `ALLOWED_MODULE_EDGES` entry in the same change.
- **Layers inside a module** (amended 2026-10-25, ADR 0006 §1-2, §7). A module folder holds only the layer folders it needs (`domain/`, `application/`, `adapters/`, `http/`, `cli/`, `jobs/`) plus wiring files `<Module>.module.ts` and `index.ts`. `apps/cms-api/test/architecture/LayerRules.constants.ts` (`LAYER_RULES`) mirrors this bullet; change both together. A layer may import:
  - `domain/`: own `domain/`; another module's facade along a module edge with `import type` only, except the pure helpers in `DOMAIN_CROSS_MODULE_HELPERS` (Q-CA6); pure platform folders; no package but `zod`, `sanitize-html` (Q-CA5) and `createHash` from `node:crypto`. No `process.env`, `new Date()` or `Date.now(`.
  - `application/`: own `domain/`, `application/`; other modules' facades (not their `http/` exports); pure platform folders, platform ports, `config/`. From `@nestjs/*` only `Injectable` and `Inject` (Q-CA1); never `express`, `@prisma/*`, `src/generated/**` (`import type` included), `kysely`, `pg`, `passport*`, `process.env`, `new Date()` or `Date.now(`.
  - `adapters/`: own `domain/`, `application/`, `adapters/`; other modules' facades (not their `http/` exports); pure platform folders, platform ports and adapters, `config/`, `src/generated/`; any package.
  - `http/`: own `domain/`, `application/`, `http/`; other modules' facades incl. their exported guards and decorators; pure platform folders, the HTTP pipeline, `config/`; never `@prisma/*`, `kysely` or `pg`.
  - `cli/`: own `domain/`, `application/`, `adapters/`, `cli/`; other modules' facades (not their `http/` exports), incl. an adapter a facade exports (`loadDefinitions`, Q-CA14b); pure platform folders, platform ports and adapters, `config/`, `src/generated/`; any package. A CLI builds adapters and hands them to use cases.
  - `jobs/` (Q-CA7): own `domain/`, `application/`, `jobs/`; other modules' facades (not their `http/` exports); pure platform folders, `config/`, `infrastructure/scheduling/`. From `@nestjs/common` only `Injectable`, `Inject`, `Logger` and lifecycle hooks; never `express`, `@prisma/*`, `kysely`, `pg` or `passport*`. A job calls use cases only.
  - Wiring (`<Module>.module.ts`, `index.ts`): anything in the module. A facade never exports `adapters/` (except `loadDefinitions`).
  - Platform folders by role (ADR 0006 §7.6): pure = `common/{constants,errors,time,types,validation}/`; HTTP pipeline = `common/{http,middleware,filters,guards,rate-limit}/`; ports = `infrastructure/**/*.port.ts`; job runner = `infrastructure/scheduling/`; every other `infrastructure/` file is an adapter.
  - Named exceptions only in `LAYER_EXCEPTIONS`: `kysely` in `access/domain/PolicyEvaluator.ts` and `access/domain/Conditions.rules.ts`, seen by other modules as the opaque `RowFilter` type (Q-CA17); `documents` reading the access field projection by file (D3). `src/contract/` is not module code and not checked (`LAYER_EXEMPT_ROOTS`); the guards live in `test/architecture/`, outside `src/`. Deep imports into another module stay banned for every layer.
  - `Layers.architecture.spec.ts` checks every module: no file outside its layer folders and wiring files. `KNOWN_LAYER_VIOLATIONS` is empty and must stay empty.

## Code style

Applies to: all flows.

```ts
// apps/cms-api/src/modules/documents/documents.controller.ts
@Controller(API_ROUTES.DOCUMENTS.ROOT)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Put(API_ROUTES.DOCUMENTS.BY_ID)
  @RequirePermission(PERMISSION_ACTIONS.UPDATE)
  async update(
    @Param() { slug, documentId }: DocumentParamsDto,
    @Body() body: UpdateDocumentDto,
    @Actor() actor: ActorContext,
  ): Promise<SerializedDocument> {
    return this.documents.update({ slug, documentId, ...body }, actor);
  }
}
```

- Services take an explicit `ActorContext`. Policy checks live in `access`, never inline `role === 'x'`.

- DTOs validated with Zod (`nestjs-zod`), one schema per DTO; shared schema types are exported for the frontends.

## Field-level reads and writes (D3, D4)

Applies to flows: `content-editing`, `public-site`, `reviewer`, `access-admin`.

1. Apply field-level reads when the query is built: no `read` on a subject → `403`; unreadable columns are never selected; filter, sort or search on them → `400 FIELD_NOT_READABLE` (D3).
2. Every payload carrying record data (list, detail, 409 conflict, bulk conflicts, audit metadata view, error details) goes through the one serializer (D3).
3. Writable fields come from policy per request; a resent mask is dropped silently; any other non-writable or unknown key → `400`; client-sent `_maskedFields` is ignored (D4).
4. No answer carries a raw value of a field the caller cannot read, the 409 body included (D3, criterion 4).
5. `:slug` is checked against the content type registry before any SQL is built ([api-contract.md](../../global/reference/api-contract.md)).

## API tokens (D5)

Applies to flows: `access-admin`, `content-editing`, `public-site`.

1. Effective permissions = token scope ∩ the creator's **current** permissions, per request; a deactivated or deleted creator stops the token (D5, criterion 6).
2. Create, update and revoke only from a JWT session; the subset check runs on create and update; admins manage only tokens they created, the owner manages all (D5).
3. Stored as SHA-256, the raw value shown once; an expired token counts as revoked and cannot be updated (`409`) (D5).

## Credentials and one-time codes (D8)

Applies to flows: `sign-in`, `password`, `two-factor-setup`, `owner-setup`.

1. Passwords: Argon2id, at least 12 characters (D8).
2. One-time codes are stored as HMAC-SHA256 with `OTP_PEPPER`, bound to `(account, purpose)`, with the OTP limits of [canonical-values.md](../../global/reference/canonical-values.md) (D8, criterion 9).
3. Answers for unknown emails cannot be told apart from known ones (D8).
4. TOTP remembers its last used time step (no replay); its secret is encrypted with AES-256-GCM using `TOTP_ENC_KEY` and a key id (D8).

## Sessions and revocation (D9)

Applies to flows: `sign-in`, `password`, `access-admin`.

1. JWT HS256 with the algorithm pinned; the guard compares `tv` and `pv` with the database through an in-process cache invalidated on every write (D9).
2. Refresh tokens rotate within a `family_id`; reusing a rotated token revokes the family and bumps `token_version` (D9, criterion 10).
3. A password change or reset bumps `token_version` (D9).

## Database roles (D19)

Applies to flows: `content-modeling`, `backups`.

1. At runtime cms-api connects as `abyss_api`: no DDL, no `TRUNCATE`; DDL runs only as `abyss_migrator` in the init container (`deploy:migrate`) (D19).
2. Migration commands load only the `DB_*` keys (D19).
3. Grants come only from `scripts/db/database-roles.sql` (D19).

## API headers (D17)

Applies to: all flows.

- CSP `default-src 'none'` on every route, `/graphql` included (D17).
