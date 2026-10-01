# App shell

The layout around every signed-in `/admin` page (Phase 3): a skip link, a side menu, a sticky header with breadcrumbs and the account menu, the only `<main>`, and a footer. The styling and inputs are in [Design system](./design-system.md).

Source: `src/features/shell/` (`components/`, `hooks/`, `navigation.ts`, `breadcrumbs.ts`, `settingsLinks.ts`, `sidebarState.ts`, `storage.ts`, `initials.ts`), `src/hooks/use-mobile.ts`, `src/components/ui/sidebar.tsx`, `src/layouts/AuthLayout.tsx`, `src/pages/settings/`, `src/pages/dev/UiKitPage.tsx`.

## Layout

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

- `AppShell` fills the dynamic viewport height (`min-h-dvh`), so mobile browser toolbars never hide the header or footer. The footer sits at the bottom on short pages.
- The header is sticky. The account menu (`UserMenu`) shows the user's initials (and name from `md` up). It contains the name, email and role, **Profile**, the **Theme** radio group (Light, Dark, System) and **Log out**.
- **Skip link:** "Skip to content" moves focus to `<main>` without changing the URL.
- **Title and focus:** `usePageTitleAndFocus` sets `document.title` to `<page h1> · CMS Admin`. After a client-side navigation it moves focus to the new page's `<h1>`, or to `<main>` when there is none. The first load leaves focus alone, so the skip link stays the first Tab stop.
- `/403` and the public pages (`/login`, `/register`, `/verify-otp`, `/forgot-password`, `/reset-password`) stay outside the shell. They use `AuthLayout`: a centred card at most 400px wide (full width below 640px) with the "hungnhdev CMS" mark and the page `<h1>`, and `AuthLayout` owns their `<main>`.

## Navigation model

`buildNavModel(actor, contentTypes)` in `navigation.ts` is pure and returns `{ content, settings }`:

- **Content:** the content types the actor may read documents of (`filterReadableContentTypes`), sorted by name and split into `single` and `collection`. Each link goes to `/admin/content-types/<slug>` (URL-encoded). `content` is `null` when there is no list to show.
- **Settings:** the `SETTINGS_LINKS` that pass `hasPermission(actor.permissions, link.permission)`, so `<res>:manager` qualifies too.

`useNavModel()` adds `contentStatus` from the content-type list query (`useContentTypes`):

| `contentStatus` | When                                             | The Content section shows                     |
| --------------- | ------------------------------------------------ | --------------------------------------------- |
| `hidden`        | No `content_type:read`, or the list answered 403 | Nothing                                       |
| `loading`       | The list is loading                              | Three skeleton rows ("Loading content types") |
| `error`         | The list failed                                  | "Couldn't load content types." and **Retry**  |
| `ready`         | The list loaded                                  | The Single types and Collection types groups  |

The menu recomputes when the user (and so their permissions) or the cached list changes, so it follows both without a reload. Menu gating is defense in depth only: every route keeps its `RequireAccess`. The active link has `aria-current="page"`.

### Settings links

`src/features/shell/settingsLinks.ts`. Each route is a `SettingsPlaceholderPage` ("Coming in Phase 4.") behind `RequireAccess permission="<permission>"`.

| Key             | Label         | Path                            | Permission        |
| --------------- | ------------- | ------------------------------- | ----------------- |
| `users`         | Users         | `/admin/settings/users`         | `user:read`       |
| `roles`         | Roles         | `/admin/settings/roles`         | `role:read`       |
| `permissions`   | Permissions   | `/admin/settings/permissions`   | `permission:read` |
| `access-tokens` | Access tokens | `/admin/settings/access-tokens` | `api_token:read`  |
| `media`         | Media library | `/admin/settings/media`         | `media:read`      |

The old `/admin/users` path redirects to `/admin/settings/users`.

## Breadcrumbs

`buildBreadcrumbs(pathname, { contentTypeName })` in `breadcrumbs.ts` is pure. The last crumb is the current page and is not a link.

| Path                         | Trail                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `/admin`                     | Home                                                                    |
| `/admin/profile`             | Home › Profile                                                          |
| `/admin/content-types`       | Home › Content types                                                    |
| `/admin/content-types/:slug` | Home › Content types › _content-type name_ (the slug until it is known) |
| `/admin/settings/<key>`      | Home › Settings (text) › _link label_                                   |
| `/admin/dev/ui-kit`          | Home › UI kit                                                           |
| anything else                | Home › _last segment in Title Case_                                     |

`useBreadcrumbs()` reads the content-type name only from the React Query cache (the type detail first, then the list). It subscribes to the cache but never fetches. Below `md` (768px), the middle crumbs collapse into a "More breadcrumbs" menu.

## Responsive behaviour

| Width           | Side menu                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1024px (`lg`) | Docked, 16rem wide. "Toggle menu" (or Ctrl/Cmd+B) collapses it to a 3rem icon rail with tooltips. The state persists.                       |
| < 1024px        | Hidden. "Toggle menu" opens it as a modal off-canvas Sheet (18rem). Navigating closes it. Escape closes it and returns focus to the button. |

The page never scrolls horizontally, down to 375px. Controls are 44px tall below `lg`.

## Storage keys

All access goes through `storage.ts` (`readStorage`, `writeStorage`): try/catch, plus an in-memory fallback after a failed write.

| Key                               | Value                       | Owner                                                     |
| --------------------------------- | --------------------------- | --------------------------------------------------------- |
| `cms-admin:theme`                 | `light`, `dark` or `system` | `theme.ts` and `public/theme-init.js`                     |
| `cms-admin:sidebar:open`          | `true` or `false`           | `AppShell` (desktop expanded or rail), `SIDEBAR_OPEN_KEY` |
| `cms-admin:sidebar:group:<group>` | `true` or `false`           | `AppSidebar` (`content`, `settings`), `sidebarGroupKey()` |

## UI kit route

`/admin/dev/ui-kit` (`UiKitPage`) shows every base input in its default, filled, disabled, invalid and required states, inside the shell. It exists for development, `e2e/inputs.spec.ts` and the axe suite.

- It is registered only when `import.meta.env.DEV` is true, and its page is loaded lazily, so production builds drop it. The router unit test checks the registration, and the release check greps `dist` for `UiKitPage`.
- Run it with `pnpm --filter cms-admin dev` and open `http://localhost:5173/admin/dev/ui-kit` signed in.

## Tests

- Unit: `navigation.test.ts`, `breadcrumbs.test.ts`, `storage` and `sidebarState` tests, and component tests for `AppShell`, `AppSidebar`, `UserMenu` and `Breadcrumbs`.
- E2E: `e2e/shell.spec.ts` (skip link, title and focus, menus per role, collapse persistence, theme switch, mobile drawer, no horizontal scroll, breadcrumbs), `e2e/pages.spec.ts`, `e2e/auth-layout.spec.ts`, `e2e/inputs.spec.ts`.
- Accessibility: `e2e/a11y.spec.ts` runs axe (`wcag2a`, `wcag2aa`, `wcag21aa`) on `/login`, `/register`, `/forgot-password`, `/403`, `/admin`, `/admin/profile`, `/admin/content-types/:slug` and `/admin/dev/ui-kit`, in light and dark mode at 1280px and 375px, and fails on any serious or critical violation. Keyboard walks check the Tab order (skip link, menu, header, main), a visible focus indicator on every stop, and that focus always leaves the page (no trap).
