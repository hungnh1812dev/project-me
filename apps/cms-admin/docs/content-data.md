# Content data

The React Query data layer for content types and their documents (Phase 2): request functions,
the list query and its validation, `contentKeys`, the cache invalidation matrix and the per-slug
ABAC decisions. Logic only; the pages build on these hooks. Every request goes through `cmsApi`, and
ABAC here is client-side defense in depth only.

## Feature

### Backend contract

Paths are relative to `/api/v1`, taken from the legacy docs in `../docs-old-dev/`
(`api-reference.md`, `cms-admin-integration.md` §5.5–5.7 and §6, `documents/documents.md`). Every
slug or `documentId` segment goes through `encodeURIComponent`.

| #   | Method and path                                | Permission                           | Hook                                               |
| --- | ---------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| C1  | `GET /content-types`                           | `content_type:read`                  | `useContentTypes()`                                |
| C2  | `GET /content-types/:slug`                     | `content_type:read`                  | `useContentType(slug)`                             |
| C3  | `PATCH /content-types/:slug/list-fields`       | `content_type:manager`               | `useUpdateListFields(slug)`                        |
| S1  | `GET /documents/single-type/:slug`             | `document:read`                      | `useSingleTypeDocument(ref)` (404 resolves `null`) |
| S2  | `PUT /documents/single-type/:slug`             | `document:update`                    | `useSaveSingleType(ref)` (create-or-update)        |
| S3  | `POST /documents/single-type/:slug/publish`    | `document:publish`                   | `usePublishSingleType(ref)`                        |
| S4  | `POST /documents/single-type/:slug/unpublish`  | `document:unpublish`                 | `useUnpublishSingleType(ref)`                      |
| D1  | `GET /documents/collection-type/:slug`         | `document:read`                      | `useDocumentList(ref, params, catalog?)`           |
| D2  | `POST /documents/collection-type/:slug`        | `document:create`                    | `useCreateDocument(ref)`                           |
| D3  | `GET …/:slug/:documentId`                      | `document:read`                      | `useDocument(ref, documentId)`                     |
| D4  | `PUT …/:slug/:documentId`                      | `document:update`                    | `useUpdateDocument(ref)`                           |
| D5  | `DELETE …/:slug/:documentId`                   | `document:delete`                    | `useDeleteDocument(ref)`                           |
| D6  | `POST …/:slug/:documentId/publish`             | `document:publish`                   | `usePublishDocument(ref)`                          |
| D7  | `POST …/:slug/:documentId/unpublish`           | `document:unpublish`                 | `useUnpublishDocument(ref)`                        |
| D8  | `POST …/:slug/:documentId/duplicate`           | `document:create`                    | `useDuplicateDocument(ref)`                        |
| D9  | `POST /documents/collection-type/:slug/bulk`   | `document:create` **and** `:publish` | `useBulkCreateDocuments(ref)` (all-or-nothing)     |
| D10 | `DELETE /documents/collection-type/:slug/bulk` | `document:delete`                    | `useBulkDeleteDocuments(ref)` (partial success)    |

Global `document:<action>` covers every type; scoped `document:<action>:<slug>` covers one.

### List query (D1)

Params go out through `toListSearchParams`, never axios's nested serialization.

| Param     | Values                                                                  | Default (dropped) |
| --------- | ----------------------------------------------------------------------- | ----------------- |
| `start`   | integer ≥ 0                                                             | `0`               |
| `size`    | integer 1–100 (`MAX_LIST_SIZE`)                                         | `20`              |
| `orderBy` | system column or `text`/`number`/`boolean` field                        | `id`              |
| `sortDir` | `asc` or `desc`                                                         | `desc`            |
| `search`  | trimmed; dropped when empty                                             | —                 |
| `filters` | `filters[field][$op]=value`, one operator per field, keys sorted, ANDed | —                 |

- **Normalization** (`normalizeListParams`) drops `undefined`, backend defaults (`LIST_DEFAULTS`), an
  empty search and empty filters, so equivalent params share one key and one URL.
- **Wire names** (`toWireField`): `documentId → document_id`, `createdAt → created_at`,
  `updatedAt → updated_at`, `publishedAt → published_at`; `id` and schema fields pass through.
- **Values:** booleans as `"true"`/`"false"`, numbers via `String(n)`, `Date` as ISO.
- **Validation** (`validateListParams`, fails with `ERR_CLIENT_VALIDATION` and sends nothing): bad
  `start`/`size`/`sortDir`, unknown or repeated operators; the **identifier rule** (P2-SEC-1)
  `^[A-Za-z_][A-Za-z0-9_]{0,63}$` for `orderBy` and filter keys, so a crafted `?orderBy=` can't inject
  brackets; the **length cap** (P2-SEC-2) `MAX_LIST_TEXT_LENGTH` = 256 on `search` and string filter
  values. With a column catalog as the third argument, `validateListParamsForType` then requires a
  known sortable/filterable column and an allowed operator (see
  [Documents list](./documents-list.md)).
- **Items:** each `ListedDocumentItem` has its system columns beside `data`, and `data` is projected
  to the type's `listFields`.

### Query keys

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

A prefix invalidation on `documents(slug)` reaches exactly one type. `logout()` and
`sessionExpired()` clear the whole client, so no content survives a session.

### Cache invalidation matrix

| Mutation                 | Writes from response            | Removes                      | Invalidates                                     |
| ------------------------ | ------------------------------- | ---------------------------- | ----------------------------------------------- |
| update list-fields       | `type(slug)`                    | —                            | `lists(slug)`                                   |
| save single              | `single(slug)`                  | —                            | —                                               |
| publish/unpublish single | —                               | —                            | `single(slug)`                                  |
| create                   | `detail(slug, new.documentId)`  | —                            | `lists(slug)`                                   |
| update                   | `detail(slug, id)`              | —                            | `lists(slug)`                                   |
| delete                   | —                               | `detail(slug, id)`           | `lists(slug)`                                   |
| duplicate                | `detail(slug, copy.documentId)` | —                            | `lists(slug)`                                   |
| publish/unpublish        | —                               | —                            | `detail(slug, id)`, `lists(slug)`               |
| bulk create              | `detail(…)` per created item    | —                            | `lists(slug)`                                   |
| bulk delete              | —                               | `detail(…)` per `deleted` id | `lists(slug)` (also when `failed` is non-empty) |

No optimistic updates; a failed or denied mutation leaves the cache untouched.

### ABAC per content type

`contentTypeAccess(actor, ref)` (pure) and `useContentTypeAccess(ref)` (memoized on `ref.slug` and
`ref.draftToPublish`) return one `Decision` per action in `CONTENT_TYPE_ACTIONS`: `read`, `create`,
`update`, `delete` (global or scoped grant), `publish`/`unpublish` (also denied when
`draftToPublish === false`), `bulkCreate` (`create` then `publish`), `bulkDelete` (as `delete`),
`configureColumns` (`content_type:manager`). `useContentTypes`/`useContentType` expose
`useCan('read', 'content_type')` as `decision` and are disabled when denied.
`filterReadableContentTypes(actor, types)` keeps the readable types for a menu. Mutations call
`guard(decision)` first (see [RBAC and ABAC](./rbac-abac.md)).

### Client error codes

| Code                    | Status | When                                                                                              |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `ERR_CLIENT_FORBIDDEN`  | 403    | The ABAC decision is denied; `message` is the reason. No request.                                 |
| `ERR_CLIENT_VALIDATION` | 400    | Invalid list params, empty `listFields`, or a bulk size outside 1–100; `messages` lists them all. |

A server 403 is an `ApiError` 403, not retried, and does not end the session.

### Using the hooks

Pass a `ContentTypeRef` (`{ slug, draftToPublish }`), usually from `useContentType(slug)`, and gate
controls with `useContentTypeAccess(ref)`. `useSingleTypeDocument` resolves `null` for a never-saved
single type; `useSaveSingleType(ref).mutate(data)` creates or updates it.
`useBulkDeleteDocuments(ref).mutateAsync(ids)` resolves `{ deleted, failed }` even on partial
failure. Filters use camelCase names: `{ filters: { featured: { $eq: true } } }`.

### Decisions

- The legacy docs are the contract: snake_case system columns on the wire, `id` listable, item
  system columns beside `data`.
- A denied mutation rejects locally with `ERR_CLIENT_FORBIDDEN` and sends nothing.
- Bulk create needs `publish`, so it is denied when `draftToPublish` is false.
- Types stay app-local; dynamic fields are `Record<string, unknown>`. No locale support.
- The known-column check is opt-in (third argument), so the change was additive.

### Manual smoke against :8080

**Not run (2026-10-01):** the backend answered an unauthenticated C1 with 401, but no `super_admin`
credentials were available. The wire format (AC-3, AC-4) is checked only against the legacy docs and
the e2e mock. To run: C1, C2, D1 with a text filter, a `createdAt` sort and a boolean filter, and C3
with `listFields` including `id`, through the dev proxy; record results here and fix any mismatch in
`listQuery.ts` with a test.

## Files

| File                                              | Spec                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/content/types.ts`                   | Wire and domain types: content types, fields, documents, list params and responses, `ContentTypeRef`. |
| `src/features/content/api/contentTypesApi.ts`     | Exports `getContentTypes`, `getContentType`, `updateListFields` (C1–C3).                |
| `src/features/content/api/documentsApi.ts`        | Exports the S1–S4 and D1–D10 request functions; unwraps `{ data }`.                     |
| `src/features/content/listQuery.ts`               | Exports `normalizeListParams`, `validateListParams`, `listValidationError`, `toListSearchParams`, `toWireField`, `LIST_DEFAULTS`, `MAX_LIST_SIZE`, `MAX_LIST_TEXT_LENGTH`. |
| `src/features/content/queryKeys.ts`               | Exports `contentKeys`.                                                                  |
| `src/features/content/access.ts`                  | Exports `contentTypeAccess`, `filterReadableContentTypes`, `CONTENT_TYPE_ACTIONS`, `ContentTypeAction`, `ContentTypeAccess`. |
| `src/features/content/hooks/useContentTypes.ts`   | Exports `useContentTypes`, `useContentType`, `useUpdateListFields`.                     |
| `src/features/content/hooks/useSingleType.ts`     | Exports `useSingleTypeDocument`, `useSaveSingleType`, `usePublishSingleType`, `useUnpublishSingleType`. |
| `src/features/content/hooks/useCollectionQueries.ts` | Exports `useDocumentList`, `useDocument`.                                            |
| `src/features/content/hooks/useCollectionMutations.ts` | Exports the eight collection mutations (create to bulk delete).                    |
| `src/features/content/hooks/useContentTypeAccess.ts` | Exports `useContentTypeAccess`.                                                      |
| `src/test/contentFixtures.ts`                     | Exports `makeContentTypeSummary`, `makeContentType`, `makeFieldSet`, `makeDocument`, `makeListedItem`, `makeListResponse`. |
| `src/test/msw/contentHandlers.ts`                 | One opt-in MSW recorder per contract row plus `errorReply`; records method, path, query, body. |
| `e2e/fixtures/mockContent.ts`                     | In-memory content backend (`mockContent` fixture): bearer 401, global or scoped 403, 404, Mode B 400s, status moves draft → published → modified → draft, D9 all-or-nothing, D10 per-id `failDelete`, `saves` log. |
| `e2e/fixtures/contentFixtures.ts`                 | `FIELD_SHOWCASE`, `BLOG`, `HOMEPAGE`, Mode B `CHANGELOG`, `blogPost(n)`, `seedContent`, `CONTENT_MANAGER`. |

## Testing

- `api/contentTypesApi.test.ts`, `api/documentsApi.test.ts`, `listQuery.test.ts` (wire names,
  normalization, identifier and length rules), `queryKeys.test.ts`, `access.test.ts`,
  `cachePurge.test.ts` (logout and expiry leave no content query, AC-28), and the hook tests
  `useContentTypes`, `useSingleType`, `useCollectionQueries`, `useCollectionMutations`,
  `useBulkMutations`, `useContentTypeAccess`.
- `src/test/msw/contentHandlers.test.ts` checks the recorders.
- `e2e/content-mock.spec.ts`: the mock backend's contract (C3, S2–S4 transitions, errors).
- Run: `pnpm --filter cms-admin exec vitest run src/features/content` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/content-mock.spec.ts`.

## Related

- [API client](./api-client.md), [RBAC and ABAC](./rbac-abac.md)
- [Content-type pages](./content-type-pages.md), [Documents list](./documents-list.md),
  [Document editor](./document-editor.md), [Single-type editor](./single-type-editor.md)
- [App shell](./app-shell.md) (menu and breadcrumbs read this cache)
