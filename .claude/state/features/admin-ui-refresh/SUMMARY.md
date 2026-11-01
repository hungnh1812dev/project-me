# admin-ui-refresh
Done: 2026-11-01 · Commits: 6ec6aa48..fbc6127d · Apps / packages: cms-api, cms-admin, web, form-commons, e2e, docs

## Overview
The cms-admin console gets a new shell: grouped side menu with icons, a top-right user menu, separate settings routes, and a shared component set. Media moves to a File Library with search, filters, an upload dialog with confirmation and progress, in-place file replace, a media field in forms, and a rich-text editor with a palette, toolbar and media-backed images. Local disk storage is available for dev and smoke stacks only.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Shell | Side menu groups and icons, top-bar user menu, settings routes | UIS-1..5 |
| Component fields | Dashed add slots, corner delete, up/down controls | UIC-1..2 |
| Upload | Upload allowlist and limits from the API; queue with checks, progress and abort; upload dialog | UIU-1..4 |
| File Library | Search and MIME filter, in-place replace, embedded media metadata, local provider and public media file route | UIL-1..14 |
| Media field | Preview and overlay actions in forms; field uses the dialog and grid | UIM-1..3 |
| Rich-text editor | Palette, grouped toolbar, text colour, media image dialog, sanitizer follows the media rules | UIR-1..9 |
| Test stability | Shared test waits in the jsdom packages for parallel root runs | UIX-1 |
| Smoke stack fix | Previous stack torn down before start | DR1 |
| Setup rate limits | Smoke-only overrides of the setup limits | QC-FE3-1 fix |

## Structure
Changed paths since base, grouped (259 files; the range also holds commits of other features):
- apps/cms-api — 74 (media, richtext, config, tests)
- apps/cms-admin — 63 (shell, library, settings, editor, dialogs)
- apps/e2e — 32 (new specs for shell, component fields, upload, media chain, richtext images)
- packages/form-commons — 31 (primitives, media preview and details, editor, tests)
- docs/modules — 26 (module docs for changed modules)
- apps/web — 8 (sanitizer and test settings)
- scripts, docs/deployment, .claude — stack, env and tooling changes

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| UIL-B-qc#1 (medium, qc) | OwnerSetup e2e specs failed late in the full suite: `GET /setup/status` answered 429 | Two false failures in the tier 3 full run; no product defect | The status route allows 30 reads per minute per IP and every request behind the proxy shares one bucket | Each OwnerSetup test polls the status route until it answers 200 (`5a0969bc`); smoke-only override of the setup limits (`710a1cc1`) |
| UIM-A-qc#1 (medium, qc) | A saved or reloaded media field showed the file name without the short hash | Editors saw less file identity than in the library; REST and GraphQL document reads lacked the field | UIL-3 added mimeType, width, height and updatedAt to `EmbeddedMedia` but not sha256 | `sha256` added to the embed, its columns and mapping, GraphQL `Media.sha256` (nullable), schema regenerated (`25008d49`) |
| UIM-A-qc#2 (medium, qc) | Closing the upload dialog opened from Replace file left focus on the page body | Keyboard and screen reader users lost their place in the form | `MediaField` passed no focus return to `UploadDialog`, and the controlled dialog has no Radix trigger | `MediaField` restores focus to its opener with `useRestoreFocus`, unit and e2e tests (`3217f2ce`) |
