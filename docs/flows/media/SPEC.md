---
flow: media
replaces: §15, §15.1, §15.2, §15.3, §15.4, MU-1..MU-5, §14 Q-MU1..Q-MU6, D12
summary: Media library: upload with progress, replace in place, alt text, delete while unreferenced, purge; stored file names
---

# Media: spec

Part of the [project spec](../../../SPEC.md). Flow `media`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

Editors upload files to the File Library (`/media`) and from a media field, replace a file in place, edit alt text, and delete files no document references; a job purges cloud objects afterwards. Uploads are checked by magic bytes, images are re-encoded, and the stored name carries the first 8 hex of the file hash. The full decision is D12 in Decisions below.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) row "Media". Values (upload limits, upload request timeout): [canonical-values.md](../../global/reference/canonical-values.md).

### Upload fixes (2026-11-03, user report)

Scope: the cms-admin upload dialog, the File Card (`MediaGrid` card) and `MediaInput` (form-commons), the stored file name in cms-api media (new uploads and a rename migration for existing rows), and the proxy and server timeouts the upload path crosses. The media API keeps its routes and response shape; only the value of `fileName` changes (MU-3). Storage keys stay UUIDv7 (D12), so stored object names and URLs do not change.

### Findings (from the code, 2026-11-03)

| # | Report | Cause |
|---|---|---|
| F1 | Progress bar jumps to 100 % on Safari (macOS), then the user still waits | The bar measures only bytes handed to the browser. Safari reports upload progress coarsely (often one event at the end), and after the last byte the server still spools, re-encodes (sharp) and uploads to Cloudinary inside the same request. The `processing` state exists in `UploadQueue.rules.ts`, but the dialog draws it as a full determinate bar and the batch bar counts it as complete. |
| F2 | Uploads often fail with "Could not reach the server..." (`canceled` in the network tab) | Every cms-admin request, uploads included, uses the 10 s client timeout (`API_TIMEOUT_MS`, `apis/client/Api.client.ts`). An upload whose sending plus server processing passes 10 s is aborted by axios (the browser shows `canceled`), and `toMediaError` maps every response-less failure, timeouts and user cancels included, to the network message. Behind it: Traefik v3 stops reading a request body after 60 s by default (`respondingTimeouts.readTimeout`), and Node's HTTP server ends a request after 300 s (`requestTimeout`). |
| F3 | File name format | The stored `fileName` is the sanitized original name; `MediaDetails` shows `<fileName> · <hash8>`. |
| F4 | Extension hidden on long names | The name is one `truncate` line, so its end (the extension) is cut first. |
| F5 | `MediaInput` footer has no frame | Preview and details sit loose in the field; the File Card has a bordered frame, `MediaInput` does not. |

## Requirements

**MU-1 Honest progress (F1).** Owner: cms-admin `features/media` (`UploadQueue.rules.ts`, `useUploadQueue.ts`, `UploadDialog.tsx`).
- A file row shows a determinate bar with `Uploading <n> %` only while bytes are being sent and the browser reports a known total. When the total is unknown, or once every byte is sent, the row shows an indeterminate bar (native `<progress>` without `value`) with the existing `Processing...` label until the server answers.
- No bar, per file or batch, shows 100 % before the server has answered for every file it covers.
- Batch bar: each accepted file is weighed by its size. While sending, its sent bytes count for `UPLOAD_SENT_SHARE` = `0.9` of the file (named constant in `UploadQueue.rules.ts`); a `processing` file counts 90 %; a `done` or `failed` file counts 100 % (settled; a failed one is still listed as failed). Processing fills the last 10 % only when the server answers. The bar never moves backwards.
- Screen readers: the indeterminate bar keeps its accessible name; the row's status text changes from the percentage to `Processing...`.

**MU-2 Uploads are not cut off by a timeout (F2), and slow requests are bounded (SQ-1).** Owners: cms-admin `features/media` (`Media.api.ts`, `Media.constants.ts`, `Media.errors.ts`), `features/auth` (`Auth.interceptor.ts`, fresh token before an upload) and `apis/client/ApiFailure.errors.ts`; cms-api `Bootstrap.setup.ts` (where the app listens; `main.ts` only calls `bootstrap()`); `docker-compose.smoke.yml`; `docs/deployments/traefik.md`. Amended 2026-11-03 (user, Q-UT3 option 2, ADR 0014): N = 5 min.
- `upload` and `replaceFile` pass `timeout: MEDIA_UPLOAD_TIMEOUT_MS` = 4 min (constant in `Media.constants.ts`, below the proxy's N so the browser reports "took too long" before the proxy cuts) instead of the 10 s default; every other call keeps `API_TIMEOUT_MS`.
- `ApiFailure.errors.ts` gains two additive exports, `isRequestTimeout(error)` and `isRequestCanceled(error)`; the `ApiFailure` union is unchanged, so no other caller changes. `toMediaError` checks them first: a timeout shows the new copy `COPY.media.errors.timeout` ("The upload took too long. Try again, or try a smaller file."); a cancel the user started (remove, stop, close) shows no error (the row is already gone). The network message stays for real connection failures.
- **Fresh token before an upload (S).** cms-api checks the access token when the request headers arrive, and an early 401 to a half-sent upload can reach the browser as a network error (the proxy closes the connection). So `upload` and `replaceFile` opt in, per request, to a check in the auth interceptor: when the in-memory access token's JWT `exp` is less than `ACCESS_TOKEN_REFRESH_MARGIN_MS` (60 s) away, or `exp` cannot be read, the interceptor runs the existing single-flight, cross-tab refresh first and sends the new token. A refused refresh ends the session as the 401 path does, and the upload is not sent. Other calls are unchanged (refresh on 401 and retry once).
- **Proxy (smoke and the deploy repo).** The Traefik entrypoint `readTimeout` is N = 5 min for every route (it also bounds slow request headers). A separate router `api-upload` matches only `POST /api/v1/media` and `PUT /api/v1/media/:id/file`, in every path form cms-api accepts (case-insensitive, optional trailing slash; MUF-8-security#1) (explicit priority above `api`, same service) with the middlewares `api-inflight` (`inFlightReq`, 100 per client IP) and `upload-close` (`headers.customResponseHeaders`, `Connection: close`). The `api` router keeps `api-inflight` too, because the 5 min entrypoint value applies to every `/api` route, login and the other anonymous routes included (each router counts its own 100). `Connection: close` makes Traefik skip draining up to 256 KB of an unread body before it answers, so an early 401/403 to a slow anonymous upload ends at once; keep-alive stays on for every other route. Traefik stays `v3.6` (no router-level timeouts). The first task confirms on smoke that the header reaches the client on v3.6 and that slow headers are bounded by the entrypoint value.
- cms-api sets the Node server `requestTimeout` = N (5 min) from a named constant in `Bootstrap.setup.ts` (no new env key; `headersTimeout` stays at the Node default) and keeps the error-filter change that closes the socket after a 401/403 to an unfinished multipart request (defence in depth when Node is reached directly). `docs/deployments/traefik.md` states the values, the `api-upload` route and its two `Middleware` objects for the deploy repo, and the real cause of the slow-body hold.
- Accepted limits: an upload slower than 4 min fails with the timeout copy (100 MB needs about 3.5 Mbit/s); slow requests on any route are held at most 5 min (was 60 s by Traefik's default before this section); every upload response closes its connection; HTTP/2 and TLS behaviour cannot be shown on smoke (plain HTTP/1.1).
- Rate limits, size limits (§6) and the D12 checks are unchanged.

**MU-3 Stored file name `<stem>_<hash8>.<ext>` (F3).** Owner: cms-api `modules/media` (high-risk path, security gate). The rule `storedFileNameOf(originalName, sha256, mimeType)` lives in `domain/MediaUpload.rules.ts` and is applied once, in the step that produces the prepared upload (where the hash of the stored bytes is known), so `POST /media` and `PUT /media/:id/file` both store it without their own copy of the rule.
- `<stem>`: the sanitized original name (existing `sanitizeFileName`) without its extension. `<hash8>`: the first 8 hex characters of the `sha256` of the stored bytes (after re-encoding). `<ext>`: the original extension, lower-cased, when it belongs to the detected type; otherwise the detected type's canonical extension (`jpeg` -> `jpg`, `png`, `webp`, `gif`, `avif`, `pdf`, `mp4`). A name with no extension gets the canonical one.
- Examples: `Photo.JPG` -> `Photo_a1b2c3d4.jpg`; `scan` (a pdf) -> `scan_9f8e7d6c.pdf`; `fake.png` holding JPEG bytes -> `fake_a1b2c3d4.jpg`.
- Uploading a file whose stem already ends with `_<hash8>` of the same bytes keeps the name (no `x_a1b2c3d4_a1b2c3d4.jpg`).
- The stem is cut so the whole name stays within `FILE_NAME_MAX_LENGTH` (255 characters); the suffix `_<hash8>.<ext>` is never cut.
- A replace stores the new file's name with the new hash. The tombstone row keeps the previous name (unchanged behaviour).
- Search by name keeps working on the original stem (`search` matches `file_name`).
- **Existing rows (Q-MU6):** one Prisma migration (`apps/cms-api/prisma/migrations/<timestamp>_media_stored_file_name/migration.sql`, plain SQL, no app code) renames every `file_library` row, live and tombstoned, to the same rule: `<stem>_<left(sha256, 8)>.<ext>`, using the row's `mime_type` for the extension check and the canonical extension, and cutting the stem so the name fits 255 characters. A row that already ends with `_<left(sha256, 8)>.<ext>` is left as is, so running the SQL twice changes nothing. It runs with the other migrations through `db:migrate` / `deploy:migrate`; no new CLI and no new env key. It changes only `file_name` (no key, URL, hash or timestamp). Document references read the name from the row, so they show the new name without a rewrite.
- The SQL and `storedFileNameOf` must give the same name for the same row; an integration test checks this on a shared fixture set (acceptance 4a).

**MU-4 The extension stays visible (F4, Q-MU3).** Owner: form-commons `media-input/` (new exported component `FileName`; an additive public API change, `PublicApi.snapshot.ts` updated).
- `FileName` splits a name into a shrinking head and a fixed tail: the tail is `_<hash8>.<ext>` when the name ends that way, else `.<ext>`, else empty. The head truncates with an ellipsis; the tail never shrinks: `a-very-long-holiday-ph..._a1b2c3d4.jpg`. The full name stays in `title` and in the accessible text (no ellipsis read out).
- `MediaDetails` shows the stored `fileName` through `FileName` and drops the ` · <hash8>` addition (the hash is now in the name). The `sha256` prop stays accepted (public API unchanged).
- The cms-admin upload dialog file rows show the local file name through `FileName` while the file waits or is sent, and the stored name from the server's answer once it is done.
- Works at the narrowest File Card width, in `MediaInput` at the editor's narrowest column, and in the upload dialog rows.

**MU-5 `MediaInput` frame (F5).** Owner: form-commons `media-input/MediaInput.tsx`.
- With a file attached, the preview and the details footer (with the Delete button) sit inside one frame with the File Card's look: `rounded-md border border-border bg-card p-3`, theme tokens only. The empty drop area keeps its dashed border. When the field has an error, the frame border uses the field's error token, like other inputs.

## Acceptance

1. Unit (cms-admin): progress events `0 -> total` move the item `uploading -> processing`; the batch percent stays at or below 90 % of the file until `markDone`, then reaches 100 %; with an unknown total the row renders `<progress>` without `value`; the batch percent never decreases across a sequence of events.
2. Unit (cms-admin): `upload` and `replaceFile` send `timeout = MEDIA_UPLOAD_TIMEOUT_MS` (4 min), other media calls keep the default; an axios timeout maps to the timeout copy, a cancel to no visible error, a response-less failure to the network copy.
2a. Unit (cms-admin): a request that opts in to the fresh-token check, with an access token whose `exp` is under 60 s away or unreadable, is sent only after one shared refresh and carries the new token; a token with more time left is sent as is without a refresh; a refused refresh ends the session and the request is not sent; requests that do not opt in behave as before; `upload` and `replaceFile` opt in, other media calls do not.
3. Unit (cms-api): `storedFileNameOf` gives the examples of MU-3, keeps an already-suffixed name, uses the canonical extension on a mismatch, and cuts a 300-character stem so the name is 255 characters with the suffix whole.
4. Integration (cms-api): `POST /media` and `PUT /media/:id/file` answer and store `fileName` = `<stem>_<first 8 of sha256>.<ext>`; `GET /media?search=<original stem>` finds the file.
4a. Integration (cms-api, Testcontainers): rows seeded with old names (with and without extension, upper-case extension, mismatched extension, a 255-character name, a tombstone, one already in the new format) are renamed by the migration SQL exactly as `storedFileNameOf` names them; running the SQL a second time changes no row; `storage_key`, `url`, `sha256` and `updated_at` are unchanged.
5. Unit (form-commons): `FileName` keeps `_a1b2c3d4.jpg`, `.pdf` or nothing as the fixed tail, `title` holds the full name; `MediaDetails` renders the stored name without ` · `; `MediaInput` with a value renders one bordered frame containing the preview and `media-details`; the empty state is unchanged.
6. Tier 3: through the smoke proxy, an upload whose request lasts longer than 60 s and less than 4 min (a throttled upload of a large allowed file) succeeds.
6b. Tier 3 (smoke proxy, Traefik v3.6): an anonymous 200 KB multipart `POST /api/v1/media` sent at 2 KB/s gets its 401 within 5 s with `Connection: close` and the connection closes; an anonymous `PUT /api/v1/media/<id>/file` also answers with `Connection: close`; other `/api` answers carry no `Connection: close` and keep the connection; a request whose headers arrive slowly, to `/api/v1/media` or any other route, is closed by the proxy after about 5 min, not 15.
6a. Tier 3: on the smoke stack, `deploy:migrate` applies the new migration on a database that already holds media rows with old names (seeded before the migration), the API then lists them in the new format, and a second `deploy:migrate` run reports nothing to apply.
7. Tier 2 browser (Chromium): the upload dialog shows the indeterminate bar after sending and no 100 % before the row is done; dialog rows, File Card and `MediaInput` show long names with the extension visible; the `MediaInput` frame is visible.
8. Manual (user, Safari on macOS; no WebKit e2e project, Q-MU4): the bar no longer sits at 100 % while waiting; a 50 MB video upload completes.

Global success criterion of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 13.

## Decisions

**D12 Media.** Type detected from magic bytes against an allowlist (`jpeg png webp gif avif pdf mp4`); SVG and HTML always rejected. Images re-encoded with sharp (strips EXIF/GPS). Storage keys UUIDv7; full SHA-256 stored for dedupe. Soft delete, blocked (`409 MEDIA_IN_USE`) while any document references the file; a job purges cloud objects afterwards. The stored `fileName` is `<stem>_<hash8>.<ext>` (§15 MU-3); existing rows are renamed by one SQL migration; storage keys stay UUIDv7.

| # | Question | Recommendation |
|---|---|---|
| Q-MU1 | Is `<origin>_<hash8>.<ext>` only shown, or stored? | Stored: `file_library.file_name` holds it (API `fileName` too); storage keys stay UUIDv7 |
| Q-MU2 | Upload timeouts | Client 10 min (upload and replace only); Traefik readTimeout 15 min; Node requestTimeout 15 min. Amended 2026-11-03 (user, SQ-1, Q-UT3 option 2, ADR 0014): entrypoint readTimeout N = 5 min for every route; client 4 min (below N); Node requestTimeout 5 min; a separate `api-upload` router for the two upload routes with `api-inflight` and `upload-close` (`Connection: close`); cms-admin refreshes an access token that is about to expire (JWT `exp`) before each upload or replace; Traefik stays v3.6. Trade-off accepted: a 100 MB file needs about 3.5 Mbit/s upload to finish within 4 min |
| Q-MU3 | Extension-safe names in the upload dialog rows too? | Yes, same `FileName` component |
| Q-MU4 | Safari check | Manual by the user; no WebKit e2e project |
| Q-MU5 | Batch bar weight of sent bytes | 90 %; processing fills the last 10 % |
| Q-MU6 | Rename existing files to the new rule? | Yes: one Prisma SQL migration, idempotent, `file_name` only; checked at tier 3 through `deploy:migrate` |

## Out of scope

Resumable or chunked uploads, direct browser-to-Cloudinary uploads, changing storage keys, object names or URLs (D12), a WebKit e2e project.

S3 adapter for media ([out of scope](../../../SPEC.md)).

## Open questions

None.
