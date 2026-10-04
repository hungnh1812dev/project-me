# App shell

The layout around every signed-in `/admin` page: a skip link, a side menu built from the user's
permissions and the content types, a sticky header with breadcrumbs and the account menu, the only
`<main>`, and a footer. Also the centred `AuthLayout` card used by the public pages and `/403`.

## Feature

### Layout

```text
RequireAuth ─▶ AppShell (layout route) ─▶ <Outlet/> (the page)

┌──────────── SkipLink (first Tab stop, visible on focus) ─────────────┐
│ AppSidebar      │ AppHeader: Toggle menu │ Breadcrumbs │ Account menu │
│  Content        ├──────────────────────────────────────────────────── │
│   Single types  │ <main id="main-content" tabIndex={-1}>              │
│   Collection    │   page content (each page renders a <section>)      │
│  Settings       ├──────────────────────────────────────────────────── │
│                 │ AppFooter: hungnhdev CMS · v<version> · © <year>    │
└─────────────────┴─────────────────────────────────────────────────────┘
```

- `AppShell` fills `min-h-dvh`, so mobile toolbars never hide the header or footer.
- The account menu (`UserMenu`) shows initials (and the name from `md`), then name, email, role,
  **Profile**, the **Theme** radio group (Light, Dark, System) and **Log out**.
- **Skip link** moves focus to `<main>` without changing the URL.
- **Title and focus:** `usePageTitleAndFocus` sets `document.title` to `<page h1> · CMS Admin`
  (`formatPageTitle`) and, after a client-side navigation, focuses the new `<h1>` (or `<main>`). The
  first load leaves focus alone, so the skip link stays the first Tab stop.
- **`AuthLayout`** (public pages and `/403`): a centred card at most 400px wide (full width below
  640px) with the "hungnhdev CMS" mark and the page `<h1>`; it owns their `<main>`.

### Navigation model

`buildNavModel(actor, contentTypes)` is pure and returns `{ content, settings }`:

- **Content:** the types whose documents the actor may read (`filterReadableContentTypes`), sorted
  by name, split into `single` and `collection`, linking to `/admin/content-types/<slug>` (encoded).
- **Settings:** the `SETTINGS_LINKS` that pass `hasPermission(actor.permissions, link.permission)`.

`useNavModel()` adds `contentStatus` from `useContentTypes`: `hidden` (no `content_type:read` or a
403), `loading` (three skeleton rows), `error` ("Couldn't load content types." with Retry), `ready`.
The menu follows permission and list changes without a reload. Menu gating is defense in depth only:
every route keeps its `RequireAccess`. The active link has `aria-current="page"`.

| Key             | Label         | Path                            | Permission        |
| --------------- | ------------- | ------------------------------- | ----------------- |
| `users`         | Users         | `/admin/settings/users`         | `user:read`       |
| `roles`         | Roles         | `/admin/settings/roles`         | `role:read`       |
| `permissions`   | Permissions   | `/admin/settings/permissions`   | `permission:read` |
| `access-tokens` | Access tokens | `/admin/settings/access-tokens` | `api_token:read`  |
| `media`         | Media library | `/admin/settings/media`         | `media:read`      |

### Breadcrumbs

`buildBreadcrumbs(pathname, { contentTypeName, entryLabel })` is pure; the last crumb is the current
page and not a link.

| Path                         | Trail                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `/admin`                     | Home                                                                    |
| `/admin/profile`             | Home › Profile                                                          |
| `/admin/content-types`       | Home › Content types                                                    |
| `/admin/content-types/:slug` | Home › Content types › _content-type name_ (the slug until known)       |
| `…/:slug/new`                | Home › Content types › _content-type name_ › New entry                  |
| `…/:slug/:documentId`        | Home › Content types › _content-type name_ › _entry label_              |
| `/admin/settings/<key>`      | Home › Settings (text) › _link label_                                   |
| `/admin/dev/ui-kit`          | Home › UI kit                                                           |
| anything else                | Home › _last segment in Title Case_                                     |

`useBreadcrumbs()` reads names only from the React Query cache (type detail, then the list; on a
document page `contentKeys.detail` named with `entryLabel`). It subscribes but never fetches; until
the document is cached the crumb shows its documentId. Long labels truncate; below `md` the middle
crumbs collapse into "More breadcrumbs".

### Responsive behaviour

| Width           | Side menu                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| ≥ 1024px (`lg`) | Docked, 16rem. "Toggle menu" or Ctrl/Cmd+B collapses it to a 3rem icon rail with tooltips. The state persists. |
| < 1024px        | A modal off-canvas Sheet (18rem, `aria-modal`). Navigating closes it; Escape closes and returns focus.          |

No horizontal page scroll down to 375px; controls are 44px tall below `lg`.

### Storage keys

All web-storage access in the app goes through `readStorage`/`writeStorage` (try/catch, in-memory
fallback after a failed write).

| Key                               | Value                       | Owner                                          |
| --------------------------------- | --------------------------- | ---------------------------------------------- |
| `cms-admin:theme`                 | `light`, `dark` or `system` | [Theme](./theme.md)                            |
| `cms-admin:sidebar:open`          | `true` or `false`           | `AppShell` (`SIDEBAR_OPEN_KEY`)                |
| `cms-admin:sidebar:group:<group>` | `true` or `false`           | `AppSidebar` (`sidebarGroupKey()`)             |

### Decisions

- **Pure model, thin hooks.** Nav and breadcrumbs are pure functions so every rule is unit-tested
  without rendering.
- **Breadcrumbs never fetch**, so the header adds no requests; the page that owns the data fills the
  cache.
- **The shell owns the only `<main>`**; pages render a `<section>`.

## Files

| File                                             | Spec                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/features/shell/components/AppShell.tsx`     | Default export `AppShell`: layout route, sidebar provider with persisted open state.   |
| `src/features/shell/components/AppSidebar.tsx`   | Default export `AppSidebar`: Content and Settings groups, content status states.      |
| `src/features/shell/components/AppHeader.tsx`    | Default export `AppHeader`: menu toggle, breadcrumbs, account menu.                   |
| `src/features/shell/components/AppFooter.tsx`    | Default export `AppFooter`: product name, version, year.                              |
| `src/features/shell/components/Breadcrumbs.tsx`  | Default export `Breadcrumbs`: renders the trail, collapses below `md`.                |
| `src/features/shell/components/SkipLink.tsx`     | Default export `SkipLink`: "Skip to content".                                         |
| `src/features/shell/components/UserMenu.tsx`     | Default export `UserMenu`: identity, Profile, Theme, Log out.                         |
| `src/features/shell/hooks/useNavModel.ts`        | Exports `useNavModel`, `ContentStatus`, `NavModelState`.                              |
| `src/features/shell/hooks/useBreadcrumbs.ts`     | Exports `useBreadcrumbs`: cache-only names for the trail.                             |
| `src/features/shell/hooks/usePageTitleAndFocus.ts` | Exports `usePageTitleAndFocus`, `formatPageTitle`.                                  |
| `src/features/shell/navigation.ts`               | Exports `buildNavModel`, `NavLinkItem`, `NavModel`. Pure menu model.                  |
| `src/features/shell/breadcrumbs.ts`              | Exports `buildBreadcrumbs`, `contentTypeSlugOf`, `contentDocumentIdOf`, `NEW_ENTRY`, `Crumb`, `BreadcrumbContext`. Pure trail. |
| `src/features/shell/settingsLinks.ts`            | Exports `SETTINGS_LINKS`, `SettingsLink`. The five settings entries and permissions.  |
| `src/features/shell/sidebarState.ts`             | Exports `SIDEBAR_OPEN_KEY`, `sidebarGroupKey`, `readFlag`, `writeFlag`.              |
| `src/features/shell/storage.ts`                  | Exports `readStorage`, `writeStorage`. Safe web-storage access for the whole app.     |
| `src/features/shell/initials.ts`                 | Exports `getInitials`.                                                                 |
| `src/layouts/AuthLayout.tsx`                     | Default export `AuthLayout`: centred card for public pages and `/403`.                |

## Testing

- Unit: `navigation.test.ts`, `breadcrumbs.test.ts`, `storage.test.ts`, `sidebarState.test.ts`,
  `initials.test.ts`, `hooks/useBreadcrumbs.test.tsx`, `hooks/usePageTitleAndFocus.test.tsx`, and
  component tests for `AppShell`, `AppSidebar`, `UserMenu`, `Breadcrumbs`; `src/layouts/AuthLayout.test.tsx`.
- E2E: `e2e/shell.spec.ts` (skip link, title and focus, menus per role, collapse persistence, theme
  switch, mobile drawer, no horizontal scroll, breadcrumbs), `e2e/pages.spec.ts` (home, profile and
  content-type page cards), `e2e/auth-layout.spec.ts`. Entry trails and titles are checked in
  `e2e/documents-detail.spec.ts`.
- Accessibility: `e2e/a11y.spec.ts` covers `/login`, `/register`, `/forgot-password`, `/403`,
  `/admin`, `/admin/profile` and the shell's keyboard walk (skip link, menu, header, main; visible
  focus; no trap).
- Run: `pnpm --filter cms-admin exec vitest run src/features/shell src/layouts` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/shell.spec.ts`.

## Related

- [Routing and guards](./routing-and-guards.md)
- [Theme](./theme.md), [Design system](./design-system.md)
- [Content data](./content-data.md) (`useContentTypes`, `contentKeys`), [Schema form](./schema-form.md) (`entryLabel`)
- [RBAC and ABAC](./rbac-abac.md)
