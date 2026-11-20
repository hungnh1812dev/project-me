# Summary - single-type-stale-redirect

## Overview
Reopening a single type from the side menu now always opens its saved document. A create form no longer keeps another content type's values. Bug fix, cms-admin only, one phase (STR-A), size small.

## Built
- STR-1: The single-type redirect waits for a fresh list; a first save marks the type's list stale.
- STR-2: A create form restarts from its own content type's defaults; a same-version refetch keeps typed values.
- STR-e2e: e2e specs cover reopening a single type and a collection document after work on another type.

## Structure
- `CHANGELOG.md` - Bug fixes entry under Unreleased
- `apps/cms-admin/src/features/content/` - `Content.queries.ts` (`invalidateDocumentQueries`)
- `apps/cms-admin/src/views/collection-list/` - `SingleTypeRedirect.tsx`, test
- `apps/cms-admin/src/views/document-edit/` - `DocumentEditPage.tsx`, `DocumentActions.tsx`, tests
- `apps/cms-admin/test/` - `RenderApp.fixture.tsx`
- `apps/e2e/tests/` - `ContentSingleType`, `ContentCollectionReopen`, `ContentConflict` specs
- `docs/modules/cms-admin/` - `content.md`, `collection-list.md`, `document-edit.md`

## Commits
- Base: 21a5df654c76ac04e33053b6eba29a376aef5995
- Head: 2c8c08f1
- aaf6bc56 (STR-1), 16b22980 (STR-2), 1362ce8d (lifecycle and redirect tests), f8f53d75 (e2e), 2c8c08f1 (STR-CL)

## Issues resolved
None (major issues).
