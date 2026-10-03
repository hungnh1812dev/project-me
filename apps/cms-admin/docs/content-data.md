# Content data layer

Phase 2 adds a React Query data layer for content types and their documents. Phase 5 builds the
editing UI on top of these hooks; the pages, the form and the list are described in
[Documents UI](./documents-ui.md).

Every request goes through `cmsApi` (see [API client](./api-client.md)), so a 401 is refreshed once
and retried, and every error reaches the hooks as an `ApiError`. ABAC checks are **client-side
defense in depth only** (see [RBAC and ABAC](./rbac-abac.md)); the backend stays the authority.

Source: `src/features/content/`:

```text
types.ts                  wire and domain types
api/contentTypesApi.ts    request functions for C1–C3
api/documentsApi.ts       request functions for S1–S4 and D1–D10 (unwrap { data })
listQuery.ts              normalizeListParams, validateListParams, toListSearchParams, toWireField
queryKeys.ts              contentKeys
access.ts                 contentTypeAccess, filterReadableContentTypes
hooks/                    useContentTypes, useSingleType, useCollectionQueries,
                          useCollectionMutations, useContentTypeAccess
```

## Backend contract

Paths are relative to `/api/v1`. The contract comes from the legacy docs in
[`../docs-old-dev/`](../docs-old-dev/) (`api-reference.md`, `cms-admin-integration.md` §5.5–5.7 and
§6, and `documents/documents.md`).

| #   | Method and path                                | Permission                           | Hook                                               |
| --- | ---------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| C1  | `GET /content-types`                           | `content_type:read`                  | `useContentTypes()`                                |
| C2  | `GET /content-types/:slug`                     | `content_type:read`                  | `useContentType(slug)`                             |
| C3  | `PATCH /content-types/:slug/list-fields`       | `content_type:manager`               | `useUpdateListFields(slug)`                        |
| S1  | `GET /documents/single-type/:slug`             | `document:read`                      | `useSingleTypeDocument(ref)` (404 resolves `null`) |
| S2  | `PUT /documents/single-type/:slug`             | `document:update`                    | `useSaveSingleType(ref)` (create-or-update)        |
| S3  | `POST /documents/single-type/:slug/publish`    | `document:publish`                   | `usePublishSingleType(ref)`                        |
| S4  | `POST /documents/single-type/:slug/unpublish`  | `document:unpublish`                 | `useUnpublishSingleType(ref)`                      |
| D1  | `GET /documents/collection-type/:slug`         | `document:read`                      | `useDocumentList(ref, params)`                     |
| D2  | `POST /documents/collection-type/:slug`        | `document:create`                    | `useCreateDocument(ref)`                           |
| D3  | `GET …/:slug/:documentId`                      | `document:read`                      | `useDocument(ref, documentId)`                     |
| D4  | `PUT …/:slug/:documentId`                      | `document:update`                    | `useUpdateDocument(ref)`                           |
| D5  | `DELETE …/:slug/:documentId`                   | `document:delete`                    | `useDeleteDocument(ref)`                           |
| D6  | `POST …/:slug/:documentId/publish`             | `document:publish`                   | `usePublishDocument(ref)`                          |
| D7  | `POST …/:slug/:documentId/unpublish`           | `document:unpublish`                 | `useUnpublishDocument(ref)`                        |
| D8  | `POST …/:slug/:documentId/duplicate`           | `document:create`                    | `useDuplicateDocument(ref)`                        |
| D9  | `POST /documents/collection-type/:slug/bulk`   | `document:create` **and** `:publish` | `useBulkCreateDocuments(ref)` (all-or-nothing)     |
| D10 | `DELETE /documents/collection-type/:slug/bulk` | `document:delete`                    | `useBulkDeleteDocuments(ref)` (partial success)    |

Global `document:<action>` covers every content type; scoped `document:<action>:<slug>` covers one.
Every path segment built from a slug or a `documentId` goes through `encodeURIComponent`.

### List query (D1)

`useDocumentList` takes `ListParams` and sends them through `toListSearchParams`, never through
axios's own nested-object serialization.

| Param     | Values                                                                  | Default (dropped) |
| --------- | ----------------------------------------------------------------------- | ----------------- |
| `start`   | integer ≥ 0                                                             | `0`               |
| `size`    | integer 1–100                                                           | `20`              |
| `orderBy` | system column or `text`/`number`/`boolean` field                        | `id`              |
| `sortDir` | `asc` or `desc`                                                         | `desc`            |
| `search`  | trimmed; dropped when empty                                             | —                 |
| `filters` | `filters[field][$op]=value`, one operator per field, keys sorted, ANDed | —                 |

- **Normalization:** `normalizeListParams` drops `undefined` values, backend defaults, an empty
  search and empty filters, so `{}` and `{ start: 0, size: 20 }` share one cache key and one URL.
- **Wire names:** system columns are camelCase in responses but snake_case on the wire, in `orderBy`
  and in filter keys: `documentId → document_id`, `createdAt → created_at`,
  `updatedAt → updated_at`, `publishedAt → published_at`. `id` and schema fields pass through. The
  mapping is the one table in `listQuery.ts` (`toWireField`).
- **Values:** booleans as `"true"`/`"false"`, numbers via `String(n)`, `Date` values as ISO strings.
- **Validation:** `validateListParams` flags a bad `start`, `size` or `sortDir`, an unknown operator
  and more than one operator on a field. The query then fails with `ERR_CLIENT_VALIDATION` and sends
  nothing.
  - **Identifier rule (P2-SEC-1):** `orderBy` and every filter key must be a plain identifier,
    `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, checked before wire mapping. `id`, `createdAt`, `title` and
    `published_at` pass. `x][$ne`, `a b`, `created_at;`, `""` and 65-character names do not, so a
    crafted `?orderBy=` in the address bar cannot inject extra `filters[...]` brackets.
  - **Length caps (P2-SEC-2):** `MAX_LIST_TEXT_LENGTH` is 256. A `search` longer than that after
    trimming, or a string filter value longer than that, is a problem. Exactly 256 passes. Numbers,
    booleans and `Date` values are not capped.
  - **Known-column check (Phase 5):** pass the content type's column catalog as the third
    argument, `useDocumentList(ref, params, buildColumnCatalog(type))`. After the rules above,
    `validateListParamsForType` (`columns.ts`) then requires `orderBy` to be a sortable column,
    each filter key a filterable column and each operator one that column allows. A failure is
    `ERR_CLIENT_VALIDATION` and nothing is sent. Without the catalog only the rules above run, so
    existing callers are unchanged. Which columns qualify is listed in
    [Documents UI](./documents-ui.md#known-column-check).
- **Items:** each `ListedDocumentItem` carries its system columns (`id`, `documentId`, `status`,
  `createdAt`, `updatedAt`, `updatedBy`) beside `data`, and `data` is projected to the content
  type's `listFields`.

## Query keys

Build content keys only with `contentKeys` (`queryKeys.ts`).

| Key                                    | Value                                                  |
| -------------------------------------- | ------------------------------------------------------ |
| `contentKeys.all`                      | `['content']`                                          |
| `contentKeys.types()`                  | `['content', 'types']`                                 |
| `contentKeys.typeList()`               | `['content', 'types', 'list']`                         |
| `contentKeys.type(slug)`               | `['content', 'types', 'detail', slug]`                 |
| `contentKeys.documents(slug)`          | `['content', 'documents', slug]`                       |
| `contentKeys.single(slug)`             | `['content', 'documents', slug, 'single']`             |
| `contentKeys.lists(slug)`              | `['content', 'documents', slug, 'list']`               |
| `contentKeys.list(slug, params)`       | `['content', 'documents', slug, 'list', normalized]`   |
| `contentKeys.detail(slug, documentId)` | `['content', 'documents', slug, 'detail', documentId]` |

Every key starts with `['content']`, and every document key for a slug starts with
`documents(slug)`, so a prefix invalidation reaches exactly one content type. `logout()` and
`sessionExpired()` call `queryClient.clear()`, so no `['content', …]` entry survives a session.

## Cache invalidation matrix

| Mutation                 | Writes from response            | Removes                      | Invalidates                                     |
| ------------------------ | ------------------------------- | ---------------------------- | ----------------------------------------------- |
| update list-fields       | `type(slug)`                    | —                            | `lists(slug)` (the projection changed)          |
| save single              | `single(slug)`                  | —                            | —                                               |
| publish/unpublish single | —                               | —                            | `single(slug)`                                  |
| create                   | `detail(slug, new.documentId)`  | —                            | `lists(slug)`                                   |
| update                   | `detail(slug, id)`              | —                            | `lists(slug)`                                   |
| delete                   | —                               | `detail(slug, id)`           | `lists(slug)`                                   |
| duplicate                | `detail(slug, copy.documentId)` | —                            | `lists(slug)`                                   |
| publish/unpublish        | —                               | —                            | `detail(slug, id)`, `lists(slug)`               |
| bulk create              | `detail(…)` per created item    | —                            | `lists(slug)`                                   |
| bulk delete              | —                               | `detail(…)` per `deleted` id | `lists(slug)` (also when `failed` is non-empty) |

There are no optimistic updates. A failed mutation, including a client-side denial, leaves every
cache entry untouched.

## ABAC per content type

`contentTypeAccess(actor, ref)` is pure; `useContentTypeAccess(ref)` memoizes it for the signed-in
actor on `ref.slug` and `ref.draftToPublish`. Both return one `Decision` per action.

| Action             | Rule                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `read`             | `document:read` or `document:read:<slug>`                             |
| `create`           | `document:create` or `document:create:<slug>`                         |
| `update`           | `document:update` or `document:update:<slug>`                         |
| `delete`           | `document:delete` or `document:delete:<slug>`                         |
| `publish`          | `document:publish[:<slug>]`, denied when `draftToPublish === false`   |
| `unpublish`        | `document:unpublish[:<slug>]`, denied when `draftToPublish === false` |
| `bulkCreate`       | `create`, then `publish`; the reason names the first one missing      |
| `bulkDelete`       | same as `delete`                                                      |
| `configureColumns` | `content_type:manager` (the `content_type` `configure` policy)        |

`useContentTypes` and `useContentType` use `useCan('read', 'content_type')` and expose it as
`decision`. `filterReadableContentTypes(actor, types)` keeps the types whose `read` is allowed, for a
menu; `useContentTypes` itself returns the full server list. Queries are disabled when read is
denied; mutations call `guard(decision)` first. `guard` lives in
`src/features/auth/permissions/guard.ts` since Phase 4, shared with the settings feature.

## Client error codes

| Code                    | Status | When                                                                                                                       |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `ERR_CLIENT_FORBIDDEN`  | 403    | The ABAC decision for the action is denied. `message` is the decision's reason. No request is sent.                        |
| `ERR_CLIENT_VALIDATION` | 400    | Invalid list params, an empty `listFields`, or a bulk size outside 1–100. `messages` lists every problem. No request sent. |

A server 403 surfaces as an `ApiError` with status 403. It is not retried and does not end the
session. Other 4xx errors are not retried either (the `queryClient` default).

## Using the hooks

Pass a `ContentTypeRef` (`{ slug, draftToPublish }`), usually taken from `useContentType(slug)` or
the `useContentTypes()` list, and gate buttons with `useContentTypeAccess`.

```tsx
const { data: type } = useContentType(slug);
const ref = { slug, draftToPublish: type?.draftToPublish ?? true };
const access = useContentTypeAccess(ref);

const catalog = buildColumnCatalog(type); // columns.ts; memoize it per type
const list = useDocumentList(
  ref,
  { start, size: 20, orderBy: 'createdAt', sortDir: 'asc' },
  catalog,
);
// list.data → { items, total, start, size }; list.isPlaceholderData while the next page loads

const create = useCreateDocument(ref);
create.mutate({ title: 'Hello' }); // variables: DocumentData

const update = useUpdateDocument(ref);
update.mutate({ documentId, data: { title: 'Renamed' } });

const publish = usePublishDocument(ref); // variables: documentId
<button disabled={!access.publish.allowed} title={access.publish.reason ?? undefined}>
  Publish
</button>;
```

- **Single types:** `useSingleTypeDocument(ref)` resolves `null` when the document was never saved;
  `useSaveSingleType(ref).mutate(data)` creates or updates it.
- **Filters:** `{ filters: { featured: { $eq: true }, createdAt: { $gte: new Date(...) } } }`. Use
  camelCase system-column names; the wire mapping is automatic.
- **Bulk delete:** `useBulkDeleteDocuments(ref).mutateAsync(ids)` resolves with `{ deleted, failed }`
  even on partial failure, so show `failed` to the user. `bulkDeleteSummary(result, labels)` in
  `bulk.ts` turns it into "2 of 3 entries deleted." plus one line per failed entry.
- **Bulk publish and unpublish (D5):** `useBulkStatus(ref).run('publish' | 'unpublish', items)`
  skips entries already in the target status (`planBulkStatus`), sends D6 or D7 one entry at a
  time, keeps going after a failure, and invalidates `lists(slug)` once at the end. `progress`
  (`{ target, current, total }`) feeds `bulkProgressText` ("Publishing 2 of 5…"), and the resolved
  `{ succeeded, failed, skipped }` feeds `bulkStatusSummary`. A denied decision rejects with
  `ERR_CLIENT_FORBIDDEN` before any request.
- **Columns:** `useUpdateListFields(slug).mutate(['id', 'title'])`, gated by
  `access.configureColumns`.
- **Errors:** narrow with `isApiError`; check `error.code` for the two client codes above and
  `error.status === 403` for a forbidden state.

## E2E harness

The `mockContent` fixture (`e2e/fixtures/mockContent.ts`) is the in-memory content backend for C1 to
C3, S1 to S4 and D1 to D10; [Documents UI](./documents-ui.md#test-doubles) describes it. The Phase 2
placeholder pages and their `e2e/content-types.spec.ts` are gone: Phase 5 replaced the pages, and
their assertions (the scoped 403, the 401 refresh during a list load, the sort read from the URL,
the overview grouping and the `/403` redirect) now live in `documents-list.spec.ts`,
`content-permissions.spec.ts` and `content-mock.spec.ts`. Automated tests never hit a real backend.

## Manual smoke against :8080

**Status: not run (2026-10-01).** The backend on :8080 was reachable (an unauthenticated
`GET /api/v1/content-types` answered `401 Invalid or expired access token`), but no `super_admin`
credentials were available, so none of the planned authenticated checks ran:

- C1 and C2
- D1 with a text filter, a `createdAt` sort and a boolean filter (snake_case wire names accepted,
  system columns beside `data`)
- C3 with `listFields` including `id`

The wire format in AC-3 and AC-4 is therefore confirmed only against the legacy docs and the e2e
mock. Run the smoke through the dev server (proxied to :8080) signed in as `super_admin`, record the
requests and results here, and fix any mismatch in the `listQuery.ts` mapping with a test.

## Decisions

- The legacy docs in `docs-old-dev/` are the contract: snake_case system columns on the wire, `id`
  is listable, and list-item system columns sit beside `data`.
- A denied mutation rejects locally with `ApiError 403 ERR_CLIENT_FORBIDDEN` and sends no request.
- Bulk create is denied client-side when `draftToPublish` is false (it needs `publish`).
- Types stay app-local in `types.ts`; dynamic document fields are `Record<string, unknown>`.
- No locale support: there is no `locale` param and no locale segment in the keys.
- The known-column check is opt-in on the hook (the third argument), so the change is additive.
