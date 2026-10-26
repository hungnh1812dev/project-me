# cms-admin navigation: side menu

Status: implemented SM1-SM3 (2026-10-26); Q-SM1..Q-SM4 decided as recommended (user, 2026-10-25). Tasks SM1-SM4 in `tasks/todo.md`.

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
- Text links, no decorative icons (ui-direction §4). The active link uses `NavLink` active state with `aria-current="page"`, a muted primary tint and a left accent, from semantic tokens only. Section headings are small, muted, not links.
- The landmark stays `<nav aria-label={COPY.access.nav.label}>` so existing e2e locators keep working; the user block is a second landmark (`COPY.session.mainNav`), as today.
- Loading: while the caller's permissions or the content-types catalog load, the menu shows skeleton rows of the same height; on a catalog error the Content section shows one line with a Retry button. Static sections render as soon as permissions are ready.
- Width, spacing and colors come from Tailwind theme / kit tokens; no raw values.

## Module ownership

- `lib/feature-definition.tsx` (shared, feature-free) owns the nav contract. Additive changes:
  - `FeatureNavItem` gains `section: NavSectionId`.
  - `Feature` gains optional `useNavItems?: () => NavItemsState` (`{ items, isLoading, hasFailed, retry }`) for items that depend on data; the menu shows its loading and error rows under `DATA_BACKED_SECTION_ID`. Static items stay in `navItems`.
- `lib/nav-sections.ts` (new, feature-free) owns the section list `NAV_SECTIONS` (id, label from `COPY`, order, optional sub-sections). Ids: `singleTypes`, `collectionTypes`, `utilities`, `systemSettings`; `singleTypes` and `collectionTypes` are sub-sections of `content`.
- `features/content` owns the content-type links (`useContentNavItems`, exposed through `contentFeature.useNavItems`), because it owns the `/content/:slug` routes; it reads the catalog through the `content-types` facade (allowed by the tier order).
- `features/access`, `features/media`, `features/reviewer` only add `section` to their existing nav items.
- `app/` owns the layout: `AppShell.tsx` (frame), `SideMenu.tsx` (renders sections from `NAV_SECTIONS` plus every feature's items, filtered by `caller.can`), `MobileMenu.tsx` (sheet). `app/` is the composition root, so it may import features.
- Copy: `config/copy/common.copy.ts` `NAV_COPY` gains the section labels and `users`, `mediaLibrary`, `menu`, `closeMenu`.

## Extension path

- New page in an existing section: one nav item with `section` in the feature's `feature.ts`.
- New section: one entry in `NAV_SECTIONS` plus one copy label.
- New content type: nothing (it appears from the catalog under its kind).

## Open questions

- **Q-SM1: where a single-type link goes.** Recommended: `/content/:slug`; for a `single` type the page opens the one document's edit form, or the create form when none exists (planned change in `features/content`; today the list page shows a "not a collection" notice). Alternative: the link goes to the list page and keeps the notice (no behaviour change, but the link is a dead end).
- **Q-SM2: "permissions" and "users".** There is no separate permissions page; a role's permissions open from the Roles list (`/roles/:roleId`). Recommended: one item "Roles and permissions" (route `/roles`), and the "Accounts" label becomes "Users" (copy only, route `/accounts` unchanged). Alternative: keep "Roles" and "Accounts" labels as they are.
- **Q-SM3: personal settings and sign-out.** Recommended: in the user block at the bottom of the menu (they are about the signed-in person, not the system). Alternative: Security settings as the first item under System settings.
- **Q-SM4: collapsible menu on desktop.** Recommended: no collapse in v1 (text-only menu, no icon set needed). Alternative: a collapse toggle to a narrow rail (needs an icon per item and a remembered preference).
