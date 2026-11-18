# cms-admin navigation: side menu

Status: implemented (2026-10-26). Q-SM1..Q-SM4 decided as recommended (user, 2026-10-25).

## What changes

The header bar with inline nav links (`apps/cms-admin/src/app/AppShell.tsx`) is replaced by a left side menu. The user's groups:

| Section (heading) | Items                                                                                                                      | Source of items                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Content           | sub-heading "Single types": one link per single content type; sub-heading "Collection types": one link per collection type | the content-types catalog (`getContentTypes`, already filtered by the caller's permissions), split by `kind` (`single` / `collection`) |
| Utilities         | Media library                                                                                                              | static nav item of the `media` feature                                                                                                 |
| System settings   | Users (route `/accounts`), Roles (and permissions, see Q-SM2), API tokens, Reviewers                                       | static nav items of `access` and `reviewer`                                                                                            |

The signed-in user block sits at the bottom of the menu: display name, the personal Security settings link (hidden for reviewers, as today) and Sign out (Q-SM3).

A section or sub-heading with no visible item is not rendered (today both content schemas are collections, so "Single types" is hidden until a single type exists).

## Layout and behaviour

- Desktop (`md` and up): fixed side menu on the left, full height, with the app name at the top; the page (`<main>`) scrolls on its own. The reviewer banner stays above the page content.
- Below `md`: a top bar with the app name and a "Menu" button (`aria-expanded`, `aria-controls`) that opens the same menu in a kit `Dialog` sheet from the left; Esc and the close button close it; choosing a link closes it.
- Groups and icons (admin-ui-refresh, UIS-2): Content, Utilities and System settings are three groups, each heading with a `lucide-react` icon and a divider between groups. Single types and Collection types are sub-groups with their own icon; their items sit indented on a guide line. Every `NAV_SECTIONS` entry and sub-section carries an `icon` (a new section = one entry with label and icon, plus one copy label). Items stay text links.
- Sub-groups collapse with a button (`aria-expanded`, `aria-controls`, named by the group label), open by default. The open state is `{ [sectionId]: boolean }` in `localStorage` under `NAV_GROUP_OPEN_STORAGE_KEY` (`NavSections.constants.ts`), read and written by `components/layouts/useNavGroupOpenState.ts`; a storage error falls back to open. The active link uses `NavLink` active state with `aria-current="page"`, a muted primary tint and a left accent, from semantic tokens only. Section headings are small, muted, not links.
- Content menu items are labelled with the content type's `displayName` (never the slug; the path keeps the slug); the link carries a `title` with the full name and long names wrap (DPN-3).
- The landmark stays `<nav aria-label={COMMON_TEXT.access.nav.label}>` so existing e2e locators keep working; the user block is a second landmark (`COMMON_TEXT.session.mainNav`), as today.
- Loading: while the caller's permissions or the content-types catalog load, the menu shows skeleton rows of the same height; on a catalog error the Content section shows one line with a Retry button. Static sections render as soon as permissions are ready.
- Width, spacing and colors come from Tailwind theme / kit tokens; no raw values.

## Empty menu and landing route

Added by planner DESIGN reviewer-empty-sidebar (2026-11-10, feature `admin-ui-premium-saas`, task APS-20), after the CAPSB-19 walk as a `guest` account showed a sticky sidebar with no item; re-scoped by REPLAN APS-20 the same day after the user's decision (Welcome panel, no API change, reviewer out of scope).

- **Rule.** Every menu item needs `read` on its subject (`caller.can(subject, 'read')`); a page the caller cannot read has no item. The menu is empty when caller access is ready, no data-backed source (`NavSource.hooks`) is loading or failed, and no item is visible after filtering. Then `SideMenu` shows the Welcome panel in place of the `<nav>`: a heading (`NAV_COPY.welcomeTitle`, "Welcome to the system") and one line (`NAV_COPY.welcomeText`, "Contact the administrator to be granted access."), with no link or control, and no nav landmark. While anything loads, the skeleton rows show; a failed source keeps its retry row; neither shows the panel.
- **Why a panel, not a hidden sidebar or a Home item.** The user chose a default Welcome sidebar so a caller without rights learns why the menu is empty and whom to ask. A Home item would repeat the app-name link for every role; hiding the frame left the caller with no explanation.
- **Owner.** `components/layouts/SideMenu.tsx` decides emptiness from the same `useMenuState` the menu renders and draws the panel. The sidebar (`AppShell.tsx`) and the mobile sheet (`MobileMenu.tsx`) render `SideMenu`, so both show it without change; the Menu button stays. Copy in `configs/locales/en/Common.ts` `NAV_COPY`.
- **Landing route.** Every signed-in role lands on `APP_ROUTES.HOME` (`/`, the status home, the shell's index view); the app-name link goes there.
- **Extension path.** A new item or section makes the menu non-empty by itself; nothing in the rule changes. Another text for the panel is one copy key.
- **Known gap (open, no API change).** Visible items are filtered by `useCallerAccess` (`docs/modules/cms-admin/access.md`), which reads the caller's rows from `GET /roles`. A role without `roles:read` (reviewer, guest, editor by default) gets a refusal, so `can()` allows nothing: it sees the Welcome panel although cms-api lets it read content (and media for reviewer and editor), and write hints such as Create stay hidden for editors. User 2026-11-10: the fix through a `grants` list on `/auth/me` (feature caller-access) is dropped as a security risk; the reviewer role is analysed in detail later. cms-api still decides every request (global RULES "Boundaries").

## Module ownership

- `lib/feature-definition.tsx` (shared, feature-free) owns the nav contract. Additive changes:
  - `FeatureNavItem` gains `section: NavSectionId`.
  - `Feature` gains optional `useNavItems?: () => NavItemsState` (`{ items, isLoading, hasFailed, retry }`) for items that depend on data; the menu shows its loading and error rows under `DATA_BACKED_SECTION_ID`. Static items stay in `navItems`.
- `lib/NavSections.constants.ts` (new, feature-free) owns the section list `NAV_SECTIONS` (id, label from `COMMON_TEXT`, order, optional sub-sections). Ids: `singleTypes`, `collectionTypes`, `utilities`, `systemSettings`; `singleTypes` and `collectionTypes` are sub-sections of `content`.
- `features/content` owns the content-type links (`useContentNavItems`, exposed through `contentFeature.useNavItems`), because it owns the `/content/:slug` routes; it reads the catalog through the `content-types` facade (allowed by the tier order).
- `features/access`, `features/media`, `features/reviewer` only add `section` to their existing nav items.
- `app/` owns the layout: `AppShell.tsx` (frame), `SideMenu.tsx` (renders sections from `NAV_SECTIONS` plus every feature's items, filtered by `caller.can`), `MobileMenu.tsx` (sheet). `app/` is the composition root, so it may import features.
- Copy: `configs/locales/en/Common.ts` (`COMMON_TEXT`) gains the section labels and `users`, `mediaLibrary`, `menu`, `closeMenu`.

## Extension path

- New page in an existing section: one nav item with `section` in the feature's `feature.ts`.
- New section: one entry in `NAV_SECTIONS` plus one copy label.
- New content type: nothing (it appears from the catalog under its kind).

## Decisions (all as recommended)

- **Q-SM1: where a single-type link goes.** Recommended: `/content/:slug`; for a `single` type the page opens the one document's edit form, or the create form when none exists (planned change in `features/content`; today the list page shows a "not a collection" notice). Alternative: the link goes to the list page and keeps the notice (no behaviour change, but the link is a dead end).
- **Q-SM2: "permissions" and "users".** There is no separate permissions page; a role's permissions open from the Roles list (`/roles/:roleId`). Recommended: one item "Roles and permissions" (route `/roles`), and the "Accounts" label becomes "Users" (copy only, route `/accounts` unchanged). Alternative: keep "Roles" and "Accounts" labels as they are.
- **Q-SM3: personal settings and sign-out.** Recommended: in the user block at the bottom of the menu (they are about the signed-in person, not the system). Alternative: Security settings as the first item under System settings.
- **Q-SM4: collapsible menu on desktop.** Recommended: no collapse in v1 (text-only menu, no icon set needed). Alternative: a collapse toggle to a narrow rail (needs an icon per item and a remembered preference).
