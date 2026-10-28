# Conventions trim 2026-10-25

Module-only facts moved out of `conventions.md` (module READMEs and `docs/modules/` hold the detail).

- Backend: `RequestWithId` from request-id.middleware for Express Request typing (module augmentation fails under pnpm strict).
- Backend: throttle key source `actor` works only on routes whose class guards include JwtAuthGuard.
- Backend: list pagination `page` default 1, `pageSize` default 20 max 100, `meta {page,pageSize,total}`, strict query (README "List pagination convention").
- Backend: module graph guard lives in `src/architecture/module-edges.constants.ts`; adding a module = one SPEC §2 row plus one `ALLOWED_MODULE_EDGES` row; a removed violation must also leave `KNOWN_VIOLATIONS`.
- Gotcha: /auth/me re-reads the account itself; use a guard-only route to test VersionCache staleness.
- Gotcha: Express 5 query parser is `simple`: `filter[a][gte]=1` is one flat key.
- Gotcha: busboy `*Limit` events fire when the count reaches the limit; set limits one above what is allowed.
- Frontend (form-commons): table parts (`SortableSheet`, `TablePagination`, `BulkActionBar`) take all copy via `labels`; column renderers are named `renderCell`; admin list copy is `COPY.content.collection` / `COPY.content.bulk`.
