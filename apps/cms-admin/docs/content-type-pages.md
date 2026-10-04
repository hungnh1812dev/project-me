# Content-type pages

The entry into content editing (Phase 5): the `/admin/content-types` overview, the `:slug` page that
picks the single-type editor or the collection list, and the helpers every content page shares
(load states, paths, announcements across navigation, action error text). For editors choosing what
to work on.

## Feature

### Routes

| Path                                     | Page                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `/admin/content-types`                   | `ContentTypesPage`: links grouped into Single types and Collection types, with "Draft & publish" when it is on |
| `/admin/content-types/:slug`             | `ContentTypePage`: a single type opens [Single-type editor](./single-type-editor.md), a collection [Documents list](./documents-list.md) |
| `/admin/content-types/:slug/new`         | [Document editor](./document-editor.md) (collection only)                      |
| `/admin/content-types/:slug/:documentId` | [Document editor](./document-editor.md) (collection only)                      |

All four sit behind `RequireAccess can read content_type`. An unknown slug shows "Content type not
found." with a link back to the overview. Breadcrumbs and `document.title` follow
`Home › Content types › <type> › …` (see [App shell](./app-shell.md)).

### Shared behaviour

- **Load states** (`ContentTypeLoadState`): what a type page shows until C2 loads: "You don't have
  access to this content type." on a 403, "Content type not found." with a `BackLink` to the
  overview on a 404, and a generic alert on any other error.
- **Paths** (`listPath`, `documentPath`): every slug and id segment URL-encoded.
- **Announcements across navigation** (`announcementOf`, `AnnounceState`): a page that navigates
  after an action ("Entry created.", "Entry deleted.") passes the text in router state, and the
  target page announces it once in its live region.
- **Action errors** (`actionErrorText`): a server 403 becomes "You don't have access to do this."
  (`NO_ACCESS`) shown where the action started; the session goes on. Other errors show their
  `ApiError` message.
- No document data is rendered with `dangerouslySetInnerHTML` (checked app-wide by
  `noDangerousHtml.test.ts`).

### Decisions

- **One `:slug` route for both kinds**, so links from the menu don't need to know the kind; the page
  reads C2 and branches.
- **Announcements travel in router state**, because the live region of the page that started the
  action is unmounted by the navigation.

## Files

| File                                             | Spec                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/pages/content-types/ContentTypesPage.tsx`   | Default export: the C1 overview grouped into single and collection types.                  |
| `src/pages/content-types/ContentTypePage.tsx`    | Default export: loads C2 and renders the single-type editor or the collection list. |
| `src/pages/content-types/ContentTypeLoadState.tsx` | Exports `ContentTypeLoadState`, `BackLink`. Shared load, error, not-found states. |
| `src/pages/content-types/paths.ts`               | Exports `listPath`, `documentPath`, `announcementOf`, `AnnounceState`.            |
| `src/pages/content-types/actionError.ts`         | Exports `actionErrorText`, `NO_ACCESS`.                                           |

## Testing

- `ContentTypesPage.test.tsx`, `ContentTypePage.test.tsx`, `paths.test.ts`, `actionError.test.ts`
  in `src/pages/content-types/`.
- `e2e/content-permissions.spec.ts`: scoped and global grants, the `/403` redirect, the overview
  grouping.
- `e2e/a11y.spec.ts` covers the overview and type pages in both themes and widths.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/content-types` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/content-permissions.spec.ts`.

## Related

- [Content data](./content-data.md)
- [Documents list](./documents-list.md), [Single-type editor](./single-type-editor.md), [Document editor](./document-editor.md)
- [Routing and guards](./routing-and-guards.md), [App shell](./app-shell.md)
