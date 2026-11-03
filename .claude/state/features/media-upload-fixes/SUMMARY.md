# Summary - media-upload-fixes

Base: c47132ca · Head: 1e7cab92 · Commits: c20838b4 ... 1e7cab92 (16 commits incl. 8f2ec0a7, b6e22ba2, c792236e)

## What was built
- Stored media file names are `<stem>_<hash8>.<ext>` (hash of the stored bytes); existing rows renamed by an idempotent SQL migration.
- Upload dialog and media cards keep the extension visible on long names (FileName, MediaInput frame).
- Honest upload progress per row and batch (processing state, batch bar never moves back).
- 10 min client upload timeout for upload and replace (4 min after the proxy change); timeout and cancel messages.
- Access token refreshed 60 s before expiry before each upload or replace.
- Server request timeout 5 min; api-upload Traefik router with upload-close and api-inflight middlewares; rejected uploads drained, not reset; 100 Continue sent only once the body is read.
- ADR 0014 (upload route read timeout) implemented; Traefik stays on v3.6.

## Structure
- apps/cms-api: media module (application, domain, adapters), common (filters, middleware), Bootstrap.setup.ts, prisma migration `20261103090000_media_stored_file_name`, integration tests and fixtures.
- apps/cms-admin: features/media, features/auth (interceptor), apis/client, configs/copy, views/media-library.
- packages/form-commons: components/forms/media-input (FileName, frame).
- apps/e2e/tests: media and richtext specs.
- docker-compose.smoke.yml, docs/deployment/k3s-traefik.md, docs/modules (cms-api, cms-admin, form-commons), MODULES.md.

## Resolved issues
| Record | Problem | Impact | Root cause | Fix applied |
|---|---|---|---|---|
| MUF-C-security-1 | 15 min readTimeout let anonymous slow-drip POSTs hold connections. | Proxy and Node sockets could be exhausted without credentials. | 401 is sent only after the body arrives; no per-IP connection limit. | Error filter closes the socket after a 401/403 on an unfinished multipart request; Traefik inFlightReq (100 per IP) on the api router plus docs. |

Other findings from the checkpoint (qc MUF-C-qc#1 to #4: 502 and missing 403 on rejected uploads through the proxy; qc MUF-C-qc#4 Expect 100-continue edge) were fixed in c792236e and rechecked; their records were removed when closed.

## Open
- GraphQL and bulk size-limit 413s may have the same proxy 502 race (follow-up, unscheduled).
- Production deploy repo still needs the entrypoint readTimeout, api-upload route and Middleware objects (features.md Follow-ups).
- ADR 0014 open question on web and admin routers without a cap, left open by the user.
