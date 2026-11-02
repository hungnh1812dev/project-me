# draft-publish
Done: 2026-11-02 · Commits: 9fff1c8d..02d6ce38 · Apps / packages: apps/cms-api, apps/cms-admin, apps/e2e, docs/modules

## Overview
Content types show a display name in the admin, and documents get a draft lifecycle: save, publish, unpublish and discard. A document shows Draft, Modified or Published; readers who may read drafts see the state on REST reads and the list page. Spec: SPEC §16.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Display names | Required `displayName` per content type; shown in the side menu, list and edit titles; returned by the content-types API | DPN-1, DPN-2, DPN-3, DPN-4 |
| Publish state on reads | `publishState` (draft, modified, published) on document reads for draft readers | DPL-1 |
| Discard endpoint | Restores the published tree into the draft; needs update plus write access to every field; 409 when not modified | DPL-2 |
| Admin client | Publish, unpublish and discard calls; `canWriteEveryField` as a UI hint | DPL-3 |
| Edit page actions | Status badge; Save, Publish, Unpublish, Discard with confirm dialogs | DPL-4 |
| List status column | Status badge per row on types with draft and publish | DPL-6 |
| Lifecycle e2e | End-to-end coverage of publish, unpublish, discard, roles and focus | DPL-5 |

## Structure
- apps/cms-api: content-engine (definition key and validator, migration `0005` comment-only, snapshot, six definitions, component restore option); content-types (view returns displayName); documents (new `Discard.service.ts`, `domain/PublishState.rules.ts`, discard route, publish state on reads); access untouched; integration and fixture specs updated.
- apps/cms-admin: content API and constants; `features/content/PublishStateBadge.tsx` (new); `views/document-edit/DocumentActions.tsx` (new); collection list Status column; side menu and titles; `features/access/useCallerAccess.ts` (`canWriteEveryField`).
- apps/e2e: `DocumentLifecycle.e2e.spec.ts` (new); `ContentDisplayNames.e2e.spec.ts` (new); updates to SideMenu, ContentForm, ContentConflict, FeatureRegistry and RichtextToolbar specs.
- docs/modules: `cms-api/documents.md`, `cms-api/content-types.md` (new), `cms-api/content-engine.md`, `cms-admin/access.md` (new), `cms-admin/collection-list.md` (new), `cms-admin/content-types.md` (new), `cms-admin/document-edit.md`, plus updated `content.md`, `components.md`, `admin-navigation.md`; `MODULES.md` regenerated.

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| DPL-B-qc#1 (medium) | after Cancel or Escape, focus landed on body instead of the button that opened the dialog | keyboard and screen-reader users lost their place on the edit page | the dialog had no DialogTrigger, so Radix had no element to restore focus to | dialog stays mounted; the opening button is remembered and refocused in onCloseAutoFocus |
