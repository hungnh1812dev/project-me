# Navigation Shell

`src/components/sidebar/*`, `src/pages/admin/layout/*`, `src/pages/admin/AdminPage.tsx`, `src/hooks/useBreadcrumbs.ts` — the persistent chrome around every `/admin/*` page: collapsible sidebar, top bar with breadcrumbs, and the sticky per-page action bar panels render into.

## Layout composition

`AdminLayout` (`pages/admin/layout/AdminLayout.tsx`) is the element `router.tsx` mounts at `/admin` inside `ProtectedRoute` (see [auth.md](./auth.md)). It wraps everything in `SidebarProvider`, renders `SidebarShell` + a column of `TopBar` + `<Outlet />` (the matched child route). Panel content scrolls independently of the sidebar (`overflow-y-auto` on `<main>`, `overflow-hidden` on the outer flex row).

## Sidebar (`components/sidebar/`)

- **`SidebarContext`** — `collapsed` (persisted to `localStorage["sidebar-collapsed"]`), `isMobile` (media query `max-width: 1023px`, live-updated via `matchMedia` change listener), `mobileOpen`/`setMobileOpen`. All `localStorage` reads/writes are wrapped in try/catch (private-browsing / quota failures degrade to in-memory-only state, not a crash).
- **`SidebarShell`** — on mobile, renders `Sidebar` inside a fixed off-canvas panel with a click-to-dismiss backdrop (`data-testid="sidebar-backdrop"`), gated by `mobileOpen`; on desktop, renders `Sidebar` directly (always visible, width-animated between `w-16`/`w-64` on collapse).
- **`Sidebar`** — two nav sections:
  - **Content Manager** — pulled live from `useContentTypes()` (see [content-type.md](./content-type.md)), split into "Single Types"/"Collection Types" `SidebarSubGroup`s. No permission gate — every authenticated user sees every content type link (permission enforcement for document access happens API-side).
  - **Settings** — each link is individually gated by `hasPermission(slug)` against `AuthContext`'s `permissions` array (`media:read`, `user:read`, `api_token:manager`, `role:manager`, `permission:manager` — no more `locales:manager`, since the locale nav entry was removed, see [locales-and-invites.md](./locales-and-invites.md)). A permission's absence **omits the link from the render tree entirely**, not just disables it — this is a UI-convenience layer only; the route-level `minLevel` checks in `router.tsx` (see [app-shell.md](./app-shell.md)) are the actual enforcement boundary, and the two gates use different vocabularies (fine-grained permission slugs here vs. coarse role-level floors there) that must be kept in sync by hand when either changes.
  - Footer: display name (from `AuthContext`, hidden when collapsed), logout button, `SidebarCollapseToggle` (desktop only — hidden on mobile since the off-canvas panel has its own dismiss-by-backdrop interaction).
- **`SidebarGroup`** — collapsible section wrapper; open/closed state persisted per-group to `localStorage["sidebar-group-<storageKey>"]`.
- **`SidebarItem`** — thin `NavLink` wrapper; on mobile, clicking a link also closes the off-canvas panel (`setMobileOpen(false)`).

## Top bar & breadcrumbs

- **`TopBar`** (`pages/admin/layout/TopBar.tsx`) — renders `useBreadcrumbs()` output plus a hamburger button (mobile only, opens the sidebar).
- **`useBreadcrumbs`** (`hooks/useBreadcrumbs.ts`) — derives a 1–3 item breadcrumb trail purely from `pathname` (no data fetching). Recognizes `content-type/<kind>/<slug>` (labels the third segment via `slugToTitle`, a naive kebab/snake-to-Title-Case transform — it does **not** look up the content type's real display `name`) and `settings/<page>` (labeled via a hardcoded `SETTINGS_LABELS` map that only covers `media`/`users`/`access-tokens`/`roles` — `permissions` falls through to the raw path segment as the label, a gap worth fixing next time this file is touched).
- **`StickyActionBar`** (`pages/admin/layout/StickyActionBar.tsx`) — the sticky header used by every content-detail/list page: title, optional status badge (draft/modified/published), optional breadcrumb row, optional right-aligned action slot (`renderActions`). Consumed via `ContentTypeLayout`/`ContentDetailLayout` (see [content-type.md](./content-type.md)) rather than directly by most pages.

## `AdminPage` (`pages/admin/AdminPage.tsx`)

The `/admin` index route — a static "Welcome to the admin panel" placeholder, no data fetching. No dashboard/summary content exists yet.
