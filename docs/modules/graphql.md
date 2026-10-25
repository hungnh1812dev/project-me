# GraphQL read API (cms-api)

Status: **accepted** (user answers Q-G1..Q-G7, 2026-10-21; limits built in GQ3). SPEC D18. The
`(Q-G#)` markers and the questions at the end record the decisions. ADR: [0003](../adr/0003-graphql-read-gateway.md).

## Scope

- One endpoint, `POST /api/v1/graphql`, **queries only**. No mutations, no
  subscriptions, no batching, no GET, no persisted queries in v1.
- It exposes **document reads** only: the same data, rules and limits as
  `GET /documents/:slug` and `GET /documents/:slug/:documentId` (README
  "Documents, read"). Accounts, roles, tokens, media library, reviewer and
  audit stay REST-only. cms-admin keeps using REST. (Q-G2)
- Consumers: apps/web (server: anonymous; browser: the signed-in or reviewer
  actor with a Bearer token) and API tokens (`ak_live_`, D5).

## Request pipeline

Everything below runs inside the normal Nest HTTP pipeline (request id, CORS,
global error filter, `TRUST_PROXY_HOPS`). The GraphQL part is in-house on top
of `graphql` (graphql-js); no Apollo/Yoga/`@nestjs/graphql` (Q-G1).

1. **Transport** (`GraphqlController`, `@Post(GRAPHQL_ROUTE)`):
   `DocumentAuthGuard` (JWT, API token, or no `Authorization` header =
   anonymous `public` role; present-but-invalid = 401) then the existing
   `DOCUMENT_READ_ANONYMOUS` throttle (one request counts once, anonymous
   only). Body must be `application/json` `{ query, variables?,
operationName? }`, at most `GRAPHQL_LIMITS.MAX_BODY_BYTES`; an array body
   (batch) is 400. Errors at this stage use the REST error shape
   (`{ statusCode, errorCode, message, requestId }`): 401, 415, 429. The
   413 for a body over the limit is the exception: it uses the GraphQL
   error shape (`{ errors: [{ message, extensions: { code:
"PAYLOAD_TOO_LARGE", requestId } }] }`) and is sent by a middleware
   (`http/GraphqlBodyLimit.middleware.ts`, mounted at its exported `GRAPHQL_BODY_LIMIT_MOUNT_PATH` in `app.setup.ts`, never via `configure(consumer)`; byte checks shared in `common/middleware/byte-limit.ts`) mounted before Nest's JSON parser,
   from `Content-Length` or by counting a chunked body.
   There is no `PermissionGuard`: the subject differs per root field.
2. **Parse** with `maxTokens = GRAPHQL_LIMITS.MAX_TOKENS`; the parser's
   abort is reported as `GRAPHQL_LIMIT_EXCEEDED`, not a syntax error. The
   depth, root-field and field-node rules then run alone, first, before the
   access policy or the caller's schema is loaded.
3. **Validate** with the graphql-js specified rules plus:
   - `MaxDepthRule` (`MAX_DEPTH`), counted after fragment expansion; the root field is level 1;
   - `MaxRootFieldsRule` (`MAX_ROOT_FIELDS`, aliases count; each root field
     costs one REST read);
   - `MaxFieldNodesRule` (`MAX_FIELD_NODES`, total selected fields after
     fragment expansion; bounds alias spam and response size);
   - `ContentTypeVisibilityRule(actor)`: a root field whose content type the
     actor cannot `read` (`evaluator.rowFilter(actor, read, slug).allowed`
     false, incl. a token scope without it) is reported **with exactly the
     same error as an unknown field** (`Cannot query field "x" on type
"Query".`). Hidden = unknown, as in REST (T17b: hidden = 404).
   - production only: `NoSchemaIntrospectionCustomRule`, and "Did you mean"
     suggestions are stripped from every message.
     Any validation failure: HTTP 400, `{ errors }`, nothing executed.
4. **Execute** (`operationName` honoured; only `query` operations exist).
   Root resolvers convert their arguments to the REST internal
   `ListDocumentsQuery` / `(documentId, status)` and call
   `DocumentsQueryService.list` / `.get` **unchanged**. That service already
   does the D3 order: read + draft checks, `recordReadAccess`, projection,
   `QueryGuard`, row conditions, `RecordSerializer`, media embed. Nested
   fields are plain property resolvers over the `SerializedRecord`; there is
   no other data path, so masking cannot be bypassed and there is no N+1
   (the service loads the readable tree in batched queries per level).
5. **Respond** HTTP 200 `{ data, errors? }`, `Content-Type: application/json`,
   `Cache-Control: no-store`, `default-src 'none'` CSP like every API route.

## Schema (generated from the content registry)

Built by a **pure function** `buildGraphqlSchema(definitions)` from the
validated content definitions (the same input as the registry), once per
process on first request (the registry is already lazy, so boot still works
with the DB down) and cached. The same function backs the SDL print script
`graphql:print-schema` (writes the committed `apps/cms-api/content/schema.graphql`,
`--check` fails when it is stale). Every user's schema is the same; access
differences are handled by step 3 visibility and by masking.

### Names

| Source                         | GraphQL                                                       | Example (`cv-page`)      |
| ------------------------------ | ------------------------------------------------------------- | ------------------------ |
| content type slug (kebab-case) | object type, PascalCase                                       | `CvPage`                 |
| component path                 | `<Root>_<Field>[_<Field>]`, PascalCase parts                  | `CvPage_Experience_Role` |
| single item root field         | camelCase slug                                                | `cvPage`                 |
| list root field (collection)   | camelCase slug + `List`                                       | `cvPageList`             |
| page / filter / sort types     | `<Root>Page`, `<Root>Filter`, `<Root>Sort`, `<Root>SortField` | `CvPageFilter`           |
| content field                  | the API field name, unchanged                                 | `isMain`, `teamSize`     |

Root type names never contain `_`, so they cannot clash with component names.
The builder **fails** (never renames) on any other clash: two slugs mapping to
the same name, a slug's `List` field equal to another slug's item field, or a
generated name equal to a shared type (`Media`, `PageMeta`, `DocumentStatus`,
`SortDirection`, the scalars and filter inputs). The error names both sources.

### Shared types

```graphql
scalar Date # "YYYY-MM-DD" (string on the wire, as in REST)
scalar DateTime # ISO 8601 string
scalar Decimal # decimal as string (exact, as in REST)
scalar JSON # free JSON value
enum DocumentStatus {
  PUBLISHED
  DRAFT
}
enum SortDirection {
  ASC
  DESC
}
type PageMeta {
  page: Int!
  pageSize: Int!
  total: Int!
}
type Media {
  id: ID!
  fileName: String
  url: String
  thumbnailUrl: String
  provider: String
  alt: String
  size: Int
  createdAt: DateTime
}
```

`Media` mirrors the T29 embed (`id` is the media uuid; the internal integer id
never appears).

### Per content type (example: `cv-page`, collection)

```graphql
type CvPage {
  documentId: ID!
  version: Int!
  publishedAt: DateTime
  locale: String
  createdAt: DateTime!
  updatedAt: DateTime!
  createdBy: Int # null for anonymous / reviewer (REST omits the key)
  updatedBy: Int
  position: String # every content field is nullable: masked = "***" or null
  isMain: Boolean
  company: String
  summary: String # richtext, sanitized HTML as stored
  skill: [CvPage_Skill!] # masked component = null (not [])
  experience: [CvPage_Experience!]
  # project, education, language, reference ...
  _maskedFields: [String!]!
}
type CvPage_Experience {
  componentUid: ID!
  company: String
  location: String
  role: [CvPage_Experience_Role!]
}
type CvPagePage {
  data: [CvPage!]!
  meta: PageMeta!
}

type Query {
  cvPage(documentId: ID!, status: DocumentStatus = PUBLISHED): CvPage
  cvPageList(
    status: DocumentStatus = PUBLISHED
    page: Int = 1
    pageSize: Int = 20
    sort: [CvPageSort!]
    filter: CvPageFilter
  ): CvPagePage
}
```

- A `single` type gets only `<x>(status): X` (the one document, null when
  there is none); a `collection` gets the item field (by `documentId`) and the
  `List` field.
- Field type map: `string text richtext` -> `String`; `integer` -> `Int`;
  `decimal` -> `Decimal`; `boolean` -> `Boolean`; `date` -> `Date`;
  `datetime` -> `DateTime`; `json` -> `JSON`; `media` -> `Media`;
  `component` -> its object type (list when `repeatable`).
- Values and `_maskedFields` are exactly the serializer's: the resolver for a
  content field reads `values[name]` or `components[name]` of the
  `SerializedRecord`; nothing is recomputed.
- Root fields are nullable so one failing root field does not null its
  siblings. A missing or hidden row (row conditions) is `null` with no error,
  as indistinguishable as REST's 404.

### Pagination, sort, filter (same contract as REST)

- **Offset paging** (SPEC Q10): `page` 1..10000, `pageSize` 1..100, `meta`
  `{ page, pageSize, total }`; same constants as REST (`DOCUMENT_QUERY_LIMITS`,
  `PAGINATION`). No cursors in v1 (Q-G3).
- **Sort**: `[{ field: CvPageSortField!, direction: SortDirection = ASC }]`,
  at most 3; default `-updatedAt`, tie on row id. `<Root>SortField` lists the
  top-level scalar fields + system fields, as REST.
- **Filter**: `<Root>Filter` has one optional entry per filterable field (the
  REST set: top-level scalar fields + system fields; no components, nested
  paths or `json`), typed by field kind with the REST operator set:

  | Input            | Operators                           | Used for                                    |
  | ---------------- | ----------------------------------- | ------------------------------------------- |
  | `TextFilter`     | `eq ne in contains`                 | string, text, richtext, locale              |
  | `IntFilter`      | `eq ne in gt gte lt lte`            | integer, version, createdBy/updatedBy       |
  | `DecimalFilter`  | `eq ne in gt gte lt lte` (Decimal)  | decimal                                     |
  | `DateFilter`     | `eq ne in gt gte lt lte` (Date)     | date                                        |
  | `DateTimeFilter` | `eq ne in gt gte lt lte` (DateTime) | datetime, createdAt, updatedAt, publishedAt |
  | `BooleanFilter`  | `eq ne in`                          | boolean                                     |
  | `IdFilter`       | `eq ne in`                          | documentId                                  |

  Each set operator becomes one REST `FilterClause { path, op, values }`
  (values stringified), so the REST value typing, `QueryGuard`
  (`FIELD_NOT_READABLE`, also for `createdBy`/`updatedBy` as anonymous), the
  10-filter and 20-value limits and `contains` escaping are reused, not
  re-implemented. Entries are AND-ed; there is no `or`/`not` (REST has none).
  The exact operator per type comes from the REST table in
  `documents/domain/DocumentFilter.rules.ts`; this table must match it.

## Authorization (no new rules)

| Rule                                       | Where it is enforced                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| Who may call (anon / JWT / token)          | `DocumentAuthGuard` (reviewer actor arrives with T32) |
| `read` on the type, hidden = unknown       | `ContentTypeVisibilityRule` (validation) + service    |
| drafts need read + update (else FORBIDDEN) | `DocumentsQueryService` scope                         |
| row conditions (ABAC)                      | service SQL                                           |
| field masking, `_maskedFields`             | `RecordSerializer` (only data path)                   |
| filter/sort on unreadable field            | `QueryGuard` -> `FIELD_NOT_READABLE`                  |
| token = scope ∩ creator's current rights   | `ApiTokenGuard` / evaluator, per request (D5)         |
| anonymous throttle                         | `DOCUMENT_READ_ANONYMOUS`, per HTTP request           |

Policy checks stay in `access` (SPEC §10); the GraphQL module never compares
role slugs.

## Limits (`application/Graphql.constants.ts`, named constants, provisional values Q-G4)

| Constant          | Value  | Why                                                               |
| ----------------- | ------ | ----------------------------------------------------------------- |
| `MAX_BODY_BYTES`  | 32 KiB | query + variables; REST filters are far smaller                   |
| `MAX_TOKENS`      | 2 000  | parser stops early on huge documents                              |
| `MAX_DEPTH`       | 8      | list > data > 3 component levels > media > scalar = 7 (root = 1)  |
| `MAX_ROOT_FIELDS` | 5      | each root field is one REST-equivalent read (rows + count + tree) |
| `MAX_FIELD_NODES` | 500    | the full cv-page tree is ~60 fields; blocks alias spam            |

Why no weighted cost analysis: a root field's database work does not depend
on its selection (the service loads the readable tree in a fixed number of
batched queries), and `pageSize` is capped at 100 like REST. So DB load is
bounded by `MAX_ROOT_FIELDS` × one REST read, and response size by
`MAX_FIELD_NODES` × page size. If resolvers ever load per selection, add a
cost rule then.

## Errors

GraphQL-shaped once the request reaches step 2:

```json
{
  "data": { "cvPageList": null },
  "errors": [
    {
      "message": "Field is not readable.",
      "path": ["cvPageList"],
      "locations": [{ "line": 1, "column": 3 }],
      "extensions": {
        "code": "FIELD_NOT_READABLE",
        "details": { "field": "company" },
        "requestId": "…"
      }
    }
  ]
}
```

- `extensions.code` reuses the REST `errorCode` values
  (`FIELD_NOT_READABLE`, `FIELD_UNKNOWN`, `BAD_REQUEST`,
  `ACCESS_INVALID_REQUEST`, `FORBIDDEN`, `INTERNAL_SERVER_ERROR`) plus
  `GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`,
  `GRAPHQL_LIMIT_EXCEEDED` (in `GRAPHQL_ERROR_CODES`, `application/Graphql.constants.ts`).
- `details` only for client errors and never carries a submitted value
  (same rule as the REST filter). 5xx-class errors: generic message, no
  `details`, logged server-side with the request id.
- HTTP: 400 for parse/validation/limit errors (no `data` key); 200 when
  execution ran, even with errors. Clients treat any `errors` entry as a
  failure of that root field.
- Logs: operation name and root field names only, never `variables`.

## Introspection and playground

- `NODE_ENV=production`: introspection off, suggestions stripped, no
  playground. Developers and the web contract test use the committed SDL
  (`content/schema.graphql`) instead. (Q-G5)
- Other environments: introspection on; still no playground served by the
  API (its CSP is `default-src 'none'`); use any external GraphQL client.

## Nest module layout

```
apps/cms-api/src/modules/graphql/
├── Graphql.module.ts           # imports AccessModule, DocumentsModule (exports DocumentsQueryService), ContentEngineModule
├── index.ts
├── graphql.executor.ts         # parse -> validate (rules) -> execute -> format (moves to application/ in CR-gq-2)
├── graphql.schema.provider.ts  # per-readable-slug-set schema cache (moves in CR-gq-2)
├── application/
│   └── Graphql.constants.ts    # GRAPHQL_LIMITS, GRAPHQL_ROUTE, shared type names
├── http/
│   ├── Graphql.controller.ts   # POST GRAPHQL_ROUTE, guards + throttle, body checks
│   ├── GraphqlBodyLimit.middleware.ts
│   ├── Document.resolver.ts    # root resolvers -> DocumentsQueryService
│   ├── ListArguments.rules.ts  # list arguments -> ListDocumentsQuery
│   ├── GraphqlError.filter.ts  # GraphQLError -> extensions { code, details?, requestId }; Nest exceptions and DomainError read via common describeError
│   ├── rules/
│   │   ├── Limits.rules.ts     # depth, root fields, field nodes
│   │   └── Visibility.rules.ts # hidden content type = unknown field
│   └── schema/
│       ├── SchemaBuilder.rules.ts  # buildGraphqlSchema(definitions): pure, cached by the module; scalar field output types come from the field-type registry (`graphqlOutput`)
│       ├── SharedTypes.entity.ts   # DocumentStatus, SortDirection, PageMeta, Media
│       ├── TypeNames.rules.ts      # naming + collision checks
│       ├── Scalars.rules.ts        # Date, DateTime, Decimal, JSON
│       └── FilterInputs.rules.ts   # kind -> filter input, args -> FilterClause/SortKey
└── cli/print-schema.ts         # SDL from content/schemas (no DB), --check
```

Architecture test (like `record-serializer.architecture.spec.ts`): files in
`modules/graphql` must not reach `KyselyContent.repository`, `TreeLoader.adapter` or
`field-projection` (resolved files, facades followed) or import Kysely; reads go through `DocumentsQueryService` only.

## apps/web usage

- Query documents live next to the feature (`features/cv/cv.query.ts`): a
  plain string + hand-written result types, no client library (Q-G6).
- Server: `lib/graphql/graphql-fetch.server.ts` (`server-only`) POSTs to
  `${API_INTERNAL_URL}/graphql` with no `Authorization` and no forwarded
  cookies or client IP headers, cached for `WEB_REVALIDATE_SECONDS`
  (60 s prod, 0 smoke). Any `errors` entry or non-200 = error state.
- Browser (T33/T32 refetch): `lib/graphql/graphql-request.ts` POSTs the same
  query through the Axios client to `NEXT_PUBLIC_API_BASE_URL` + `/graphql`
  with the in-memory Bearer token.
- Contract test: a web Vitest test validates every web query document
  against `apps/cms-api/content/schema.graphql` (`graphql` as a web
  devDependency, Q-G6).

## Open questions (planner recommendations; user to confirm)

- **Q-G1 deps**: add `graphql` (graphql-js, current stable, exact pin) to cms-api only;
  in-house handler. Trade-off: Apollo/Yoga/`@nestjs/graphql` give plugins and
  a landing page but are heavy, and decorator code-first does not fit
  runtime-defined types.
- **Q-G2 scope**: documents read-only; no mutations; admin stays on REST.
- **Q-G3 pagination**: offset (`page`/`pageSize`/`meta`) as REST; cursors later.
- **Q-G4 limits**: values in the table above.
- **Q-G5 introspection**: off in production for everyone (owner included).
- **Q-G6 web client**: no GraphQL client library; `graphql` as a web
  devDependency for the contract test.
- **Q-G7 which CV**: the web shows the published cv-page with `isMain = true`
  (newest `updatedAt` if several; none = empty state).

## Implementation notes (GQ1)

- `graphql` is pinned to 17.0.2 (the current stable; `parse` supports
  `maxTokens`). Scalars use the v17 `coerceOutputValue` / `coerceInputValue` /
  `coerceInputLiteral` API (the v16 `serialize` / `parseValue` / `parseLiteral`
  are deprecated in v17). The web contract test (T30) pins the same version.
- A **non-repeatable** component field is its one item (or `null`), not a
  list: the serializer returns a list of at most one item, the resolver
  unwraps it. Repeatable = `[T!]`, masked = `null`.
- Each root field carries `extensions.abyss = { slug, operation }` with
  `operation` one of `item | list | single`, so GQ2 attaches resolvers without
  parsing names.
- `http/schema/FilterInputs.rules.ts` also exports `filterToClauses` / `sortToKeys` (args ->
  REST `FilterClause[]` / `SortKey[]`). `page` / `pageSize` range checks and
  the default sort (`SORT_DEFAULT` when `sort` is empty) are left to GQ2.
- The filterable/sortable rule is `queryKindOfField`
  (`documents/domain/QueryableFields.rules.ts`), shared with REST `queryColumnOf`.
- `buildGraphqlSchema([])` throws `GraphqlSchemaError` (a `Query` type needs
  a field).

## Implementation notes (GQ2)

- Validation runs against the caller's own schema (`GraphqlSchemaProvider.schemaFor`):
  only the content types the caller can read (with their Page / Filter / Sort
  / component types), cached by the readable set (max `MAX_CACHED_SCHEMAS`).
  A hidden type is absent, so graphql-js itself gives the unknown-field and
  unknown-type errors: same count, messages and locations as for a name that
  never existed (user decision: hidden types are invisible, type names too).
  A caller who reads nothing gets a schema with a `_none` placeholder field.
  `ContentTypeVisibilityRule` stays in the rule list as a second line of
  defence. "Did you mean" hints name visible types only; on the `Query` type
  they are stripped always, elsewhere only in production. The committed SDL
  is the full owner schema, for tooling.
- Resolvers are attached to the built schema (`attachDocumentResolvers`)
  through `extensions.abyss`; the schema is built once from the registry in
  `GraphqlSchemaProvider`. `toListQuery` (`http/ListArguments.rules.ts`) maps the
  arguments to the REST shapes and calls `normalizeListQuery` (documents),
  the same range check `parseListQuery` runs for REST. `QueryGuard` stays in
  the service.
- A not-found item (`DOCUMENT_NOT_FOUND`) is `null`; any other service error
  stays an error on that root field. Execution-time `INTERNAL_ERROR` (the REST
  code for 5xx; the design text's `INTERNAL_SERVER_ERROR` is this) is generic.
- Variable coercion errors are reworded to name the variable only (graphql-js
  echoes the value).
- Not in GQ2 (GQ3): the 32 KiB body check (Nest's default JSON parser limit
  applies meanwhile), depth / root-field / field-node rules, and classifying
  the `maxTokens` parse error as `GRAPHQL_LIMIT_EXCEEDED` (now
  `GRAPHQL_PARSE_FAILED`).

## Implementation notes (GQ3)

- `http/rules/Limits.rules.ts`: `MaxDepthRule`, `MaxRootFieldsRule`,
  `MaxFieldNodesRule`. One memoized walk per operation expands fragments and
  inline fragments (each fragment is measured once, so fragments that spread
  each other many times stay linear; a cycle counts as empty and is reported
  by graphql-js's own rule). Each operation of a document is judged alone.
  Aliases and repeated fields each count. `__schema` / `__type` (dev
  introspection roots) are left out of all three counts; production refuses
  them in validation.
- Every limit error carries `extensions.code = GRAPHQL_LIMIT_EXCEEDED`
  (`http/GraphqlError.filter.ts` keeps it); messages never echo the query.
- The body cap counts bytes on the wire. A gzip-compressed body is counted
  compressed; the global 100 KB parser limit still bounds the inflated size.
