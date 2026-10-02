# Content Type

`src/content-type-registry/index.ts`, `src/hooks/useContentTypes.ts`, `src/components/content-type/ContentTypeLayout.tsx`, `src/pages/admin/panels/ContentTypePage.tsx`, `src/pages/admin/panels/content-type/*` — schema-driven single/collection-type edit forms, and the escape hatch for content types that need bespoke list-view rendering. Depends on [form-system.md](./form-system.md) for the actual field inputs; consumed by [documents.md](./documents.md) for collection-type list/detail routing.

## `useContentTypes` (`hooks/useContentTypes.ts`)

`useContentTypes()` (list) and `useContentTypeBySlug(slug)` against `/content-types` (relative to `/api/v1`, see [app-shell.md](./app-shell.md)), plus `useUpdateListFields` (`PATCH /content-types/:slug/list-fields`) — the one schema-adjacent thing this frontend can mutate; everything else about a content type's schema is read-only here (defined server-side as schema-as-code). There is **no fetch-by-id route** on this API — content types are only addressable by slug, so the old `useContentType(id)` hook is gone. `useUpdateListFields` backs the "configure columns" flow in [documents.md](./documents.md)'s `ColumnChooserDialog`.

## Content type registry (`content-type-registry/index.ts`)

`contentTypeRegistry: ContentTypeRegistration[]` — an opt-in, slug-keyed override table for collection types that need custom list-view columns or a custom detail-page wrapper component (`ContentTypeLayoutProps`-shaped) instead of the generic schema-derived rendering. Currently registers exactly one entry, `blog-posts`, with a 4-column (`title`/`slug`/`coverImage`/`featured`) override. `getRegistration(slug)` returns `undefined` for any unregistered slug, which is the common case — [documents.md](./documents.md)'s `CollectionListPage` falls back to deriving columns from `listFields`/schema when there's no registry entry, and hides the "configure columns" button entirely when there is one (a registry override is meant to be authoritative, not further end-user-configurable).

## Routing (`ContentTypePage`, `pages/admin/panels/ContentTypePage.tsx`)

The element mounted at both `content-type/single-type/:slug` and `content-type/collection-type/:slug` (see [app-shell.md](./app-shell.md)'s router table). Resolves the content type by slug via `useContentTypeBySlug`, then branches purely on `contentType.kind`: `"single"` renders `ContentTypePanel` directly, `"collection"` renders `CollectionListPage` (see [documents.md](./documents.md)). `CollectionDetailPage` (mounted separately at `.../:slug/new` and `.../:slug/:id`) also renders `ContentTypePanel`, with `id`/`isNew` props derived from route params.

## `ContentTypePanel` (`panels/content-type/ContentTypePanel.tsx`)

The actual single-type-or-one-collection-entry edit screen — the densest file in this module. Responsibilities:

- **No locale resolution anymore** — the former `activeLocale`/`LocaleSelector`/discard-and-switch-locale dialog is gone entirely; this backend has no locale support (see [locales-and-invites.md](./locales-and-invites.md)).
- **Single vs. collection branching** — two parallel sets of query/mutation hooks (`useSingleTypeDocument`/`useSaveSingleType`/`usePublish...`/`useUnpublish...` vs. their `useCollectionDocument*` counterparts, see [documents.md](./documents.md)), selected via `isSingle = contentType.kind === "single"`.
- **First-save vs. subsequent-save** — when there's no document yet (`!doc`, which is always true for `isNew` collection entries, and also true the first time a single type is opened before it's ever been saved), it renders a bare `ContentTypeBuilder` with no `query` (so the form starts empty) and a `handleFirstSave` mutation function that, for collections, creates the document and then **navigates** to its real detail URL (`replace: true`) so a page refresh doesn't re-create a duplicate entry.
- **Publish/unpublish** — `canPublish = status !== "published"`, `canUnpublish = status !== "draft"` (so a `"modified"` document — published, then edited — shows both actions). Publish/unpublish buttons are disabled while the form itself is dirty or submitting, forcing a save-before-publish order.
- **Audit line** — `doc.data.updatedBy?.name`/`updatedAt` (`updatedBy` is now an object, `{ documentId, name } | null`, not a flat string), formatted via a local `formatAuditDate` (relative for <24h, absolute `Intl.DateTimeFormat` otherwise) — not shared with [documents.md](./documents.md)'s near-identical `formatDate` in `CollectionListPage`, a small duplication worth consolidating if a third caller appears.

## `ContentTypeBuilder` (`panels/content-type/ContentTypeBuilder.tsx`)

Thin composition: wraps `FormProvider` (see [form-system.md](./form-system.md)) around a `Card` that maps `schema: FieldDefinition[]` through `renderSchemaField`, plus a `FormActions` row (Save button, keyed off `useCmsFormState()`, plus any caller-supplied `renderActions` — publish/unpublish buttons from `ContentTypePanel`).

**Permission gating** — `ContentTypeBuilder` takes a `requiredPermission: string` prop, threaded into a `<PermissionTooltip required={requiredPermission} contentTypeSlug={contentType.slug}>` around the Save button (see [access-control.md](./access-control.md) for the shared primitives). `ContentTypePanel` computes it per call site: `isNew ? "create" : "update"` on first save (collections only — single types have no create endpoint, so their first save is always `"update"`), always `"update"` once a document exists. Publish/Unpublish in `ContentTypePanel` are gated the same way — `hasDocumentPermission(permissions, "publish"/"unpublish", contentType.slug)` — layered on top of the existing `canPublish`/`canUnpublish` visibility conditions (a button gated-but-disabled still only renders when the status makes the action meaningful).

## `renderSchemaField` (`panels/content-type/renderSchemaField.tsx`)

Recursive field renderer, the actual schema→form-markup mapping:

- `component` fields recurse — `repeatable: true` delegates to `RepeatableComponentField` (see [form-system.md](./form-system.md)); non-repeatable renders a `CollapsibleFieldset` (collapsed by default below the top level — `depth < 1` — with a preview "hint" pulled from the group's header/first text field, same pattern as `RepeatableComponentField`'s per-entry hint).
- `json`/`richtext` fields lazy-load their input components (see [form-system.md](./form-system.md)) behind a `Suspense` boundary with a pulse-animated placeholder.
- `media` fields render `MediaInput` directly (not wrapped in `FormField` — it self-registers via `Controller`). No per-field extension allowlist anymore (`FieldDefinition` dropped `ext` — see [app-shell.md](./app-shell.md)); the API accepts PNG/JPEG only, enforced server-side (see [media.md](./media.md)).
- Everything else (`text`/`number`/`boolean`/unrecognized) goes through `FormField` + `primitiveInput()`, which maps `type` to `NumberInput`/`BooleanInput`/`TextInput` (default fallback).
- `field.width` (`"100%" | "50%" | "1/3"`) maps to a `md:col-span-{6,3,2}` Tailwind class in a 6-column form grid (`widthToColSpan`).
- Nesting depth cycles through 3 hardcoded color themes (indigo/violet/amber) for component-field borders, purely visual, `depth % 3`.

## `ContentTypeLayout` / `ContentDetailLayout`

Two header-wrapper components with overlapping purpose: `ContentTypeLayout` (`components/content-type/ContentTypeLayout.tsx`) supports either a fully custom `renderHeader` render-prop or falls back to `StickyActionBar`; `ContentDetailLayout` (`panels/content-type/ContentDetailLayout.tsx`) is a simpler fixed composition (`StickyActionBar` + optional back-link + optional metadata row) with no `renderHeader` escape hatch. `ContentTypePanel` uses `ContentDetailLayout`; `ContentTypeLayout` exists for registry-driven custom wrappers (`ContentTypeRegistration.wrapper`) but no registered content type currently supplies one — dead in practice today, kept as the registry's escape-hatch contract.
