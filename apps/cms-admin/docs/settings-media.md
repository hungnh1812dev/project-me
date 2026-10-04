# Settings media

The Media library at `/admin/settings/media` (Phase 4.6): a grid of uploaded images with
keyboard-friendly multi-file upload and delete, plus `MediaThumbnail`, the safe image renderer that
the schema form's media field reuses. For editors managing the images documents use.

## Feature

- **Grid (M1).** `useMediaList` loads the assets (only with `media:read`), newest first. A labelled
  list ("Media files") of cards: 2 columns at 375px, 3 from `sm`, 4 from `lg`, 5 from `xl`. Each card
  has the thumbnail (`thumbnailUrl`, `alt` = file name, `loading="lazy"`, width and height attributes,
  in a fixed `aspect-square` box so nothing shifts), the file name (truncated, full in `title`),
  "W × H", `formatBytes(size)` (binary units, one decimal) and the upload date. Search ("Search
  files") covers the file name. One page of cards with `Pagination` under it.
- **Policy.** Upload `useCan('upload', 'media')`, Delete `useCan('delete', 'media')`, both
  `media:manager`. A denied Upload also ignores dropped files.
- **Upload (M2, AC-36, AC-37).** `FileDropzone` has a visible Upload `GatedButton` that opens a
  hidden `<input type="file" multiple accept="image/png,image/jpeg">` (cleared after each pick), and
  a drop zone. `useUploadMedia().upload(files)`:
  1. `guard(can(actor, 'upload', 'media'))`;
  2. `validateUploadFile`: anything not PNG or JPEG by both MIME type and extension fails at once
     ("<name>: only PNG and JPEG images are supported.") and is never sent; no size check (D7);
  3. sends the rest one at a time as `FormData` field `file` (the request clears `cmsApi`'s JSON
     `Content-Type` so the browser sets the boundary). A failure doesn't stop the batch:
     `uploadErrorMessage` maps 413 "File is too large.", 422 "Unsupported file type.", else the
     server message;
  4. invalidates `media` once if anything uploaded and resolves `{ uploaded, total }`.

  While a batch runs the button is `loading` and new files are ignored. `items` drives the "Upload
  progress" list (Waiting, Uploading, Uploaded, "Failed: <reason>" in text, with an icon). At the end
  `uploadSummary` ("2 of 3 files uploaded.") shows under the list and is announced.
- **Delete (M3, AC-38).** `DeleteMediaDialog` confirms `Delete "<file name>"?` with "Documents that
  use this image will show a broken image. This can't be undone.", the thumbnail and name, then M3.
  "File "<name>" deleted." is announced; errors stay in the dialog.
- **Thumbnails (P4-SEC-2).** Images load straight from the media host, not through `/api`.
  `MediaThumbnail` passes the URL through `safeImageSrc` (see
  [CSP and headers](./csp-and-headers.md)) and renders allowed ones with
  `referrerPolicy="no-referrer"`; anything else gets a neutral placeholder with no `src`, named by the
  file name (`role="img"`). Props `fit` (`cover` default, `contain`) and `source` (`thumbnail`
  default, `url`) let the media field show the full image contained. Set `CSP_IMG_ORIGINS` to the
  media host in production.

### Decisions

- **Sequential uploads, never stopping on a failure**, so one bad file doesn't lose the batch and
  progress is reported per file.
- **Type check on both MIME and extension**, and no client size check (D7): the server's 413 is the
  authority.

## Files

| File                                           | Spec                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/pages/settings/MediaLibraryPage.tsx`      | Default export: grid, search, paging, upload, delete.                              |
| `src/pages/settings/media/MediaThumbnail.tsx`  | Exports `MediaThumbnail`, `MediaThumbnailProps`. Allowlisted image or placeholder. |
| `src/pages/settings/media/DeleteMediaDialog.tsx` | Exports `DeleteMediaDialog`: confirmed M3.                                       |
| `src/features/settings/api/mediaApi.ts`        | Exports `getMedia`, `uploadMedia` (multipart), `deleteMedia` (M1–M3).             |
| `src/features/settings/hooks/useMedia.ts`      | Exports `useMediaList`, `useUploadMedia`, `useDeleteMedia`, `UploadItem`, `UploadStatus`. |
| `src/features/settings/media.ts`               | Exports `validateUploadFile`, `formatBytes`, `uploadErrorMessage`, `uploadSummary`, `UPLOAD_ACCEPT`, `UploadSummary`. |

## Testing

- `MediaLibraryPage.test.tsx`, `media/MediaThumbnail.test.tsx`, `api/mediaApi.test.ts`,
  `hooks/useMedia.test.ts` (uses `useNodeFormData` and `uploadFile`), `media.test.ts`.
- `e2e/settings-media.spec.ts`: uploads canvas-generated PNG and JPEG plus a `.gif` through the file
  chooser, measures layout shift at 375px. The mock's M2 parses the multipart `file` part (none →
  400, a name containing `too-large` → 413, `unsupported` → 422), stores `data:` URLs of the bytes
  and the PNG's IHDR size; M3 404 for an unknown id. `csp.spec.ts` loads the thumbnails under the
  policy.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/settings/MediaLibraryPage.test.tsx src/pages/settings/media src/features/settings/media.test.ts src/features/settings/hooks/useMedia.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-media.spec.ts`.

## Related

- [Settings foundation](./settings-foundation.md), [CSP and headers](./csp-and-headers.md)
- [Schema form](./schema-form.md) (media field and picker reuse the hooks and `MediaThumbnail`)
- [Design system](./design-system.md) (`FileDropzone`)
