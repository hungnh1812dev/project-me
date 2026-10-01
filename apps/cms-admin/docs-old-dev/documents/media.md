# Media

`src/components/media/MediaLibrary.tsx`, `src/hooks/useMedia.ts`, `src/pages/admin/settings/MediaLibraryPage.tsx` — asset upload/browse/delete, both as a standalone settings page and as a picker modal embedded in schema forms via `MediaInput` (see [form-system.md](./form-system.md)).

## `useMedia.ts`

- `useMediaList()` — `GET /media` (relative to `/api/v1`, see [app-shell.md](./app-shell.md)), **not paginated** — returns every asset, newest first. Takes no arguments; the old `page`/`limit` params are gone.
- `useUploadMedia` — `POST /media/upload`, `multipart/form-data` with a single `file` field per call; multi-file upload is a client-side loop of sequential `mutateAsync` calls (both `MediaLibrary` and `MediaLibraryPage` do this identically), not a batched endpoint.
- `useDeleteMedia` — `DELETE /media/:id`, called with the asset's `documentId` from both call sites.

All three invalidate the single `["media"]` query key on success.

`MediaAsset` (see [app-shell.md](./app-shell.md)) is a new shape: `{ documentId, fileName, mimeType, size, width, height, url, thumbnailUrl, publicId, hash, uploadedBy: string | null, createdAt, updatedAt }` — no more `ID`/`fileExt`.

## `MediaLibrary` (modal picker)

Opened by `MediaInput` (see [form-system.md](./form-system.md)) when a media-type schema field is clicked. No pagination (renders every asset from `useMediaList()`), no server- or client-side filtering — the old `ext` prop and its client-side `filteredItems` filtering are gone, since `FieldDefinition` no longer carries a per-field extension allowlist (see [content-type.md](./content-type.md)). Upload accepts a fixed `image/png,image/jpeg` (the API's actual allowed types) rather than a schema-driven `accept` string. Selecting an asset calls the caller's `onSelect` then immediately closes the modal.

## `MediaLibraryPage` (`/admin/settings/media`)

A near-duplicate, always-expanded-upload version of the same grid/delete UI as `MediaLibrary`, minus the "select an asset" callback (this is the standalone browse/manage view, not a picker) and minus pagination controls (removed along with `MediaLibrary`'s, since the list is no longer paginated). The upload dropzone markup, staged-file preview grid, and delete-confirmation dialog are still copy-pasted between this file and `MediaLibrary.tsx` almost verbatim — a candidate for extraction into a shared component the next time either needs a behavior change.

No route-level `minLevel`/permission gate on `settings/media` in `router.tsx` (see [app-shell.md](./app-shell.md)) — unlike every other settings page. The sidebar link is still gated by `media:read` (see [navigation-shell.md](./navigation-shell.md)), so this is a UI-only gap: any authenticated user who knows/guesses the URL can reach the page directly.

## Button-level permission gating

The Upload button and per-asset delete icon-button are wrapped in `<PermissionTooltip required="media:manager">` in both `MediaLibrary` and `MediaLibraryPage` (see [access-control.md](./access-control.md) for the shared gating primitives) — disabled with a tooltip when the current user lacks `media:manager` (or the `:read`-satisfying-`:manager` equivalent doesn't apply, since these are write actions). The delete icon is a raw `<button>` rather than the shared `Button` component; `PermissionTooltip` accepts either.
