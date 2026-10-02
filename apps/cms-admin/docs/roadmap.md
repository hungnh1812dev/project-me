# CMS Admin roadmap

The CMS Admin re-implementation ships in big phases. Each big phase gets its own spec, plan and tasks, and starts only after the previous one is merged. This page carries the roadmap and the open questions forward once the working spec is removed.

## Big phases

| #   | Big phase                  | Status    | Outline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Core Auth                  | DONE      | Axios API client with token refresh, RTK store + RTK Query auth API, session bootstrap, RBAC/ABAC engine + hooks + `<Can>` guard, protected routing, minimal login/profile/onboarding pages, React Query provider, and test tooling. See the [docs index](./README.md).                                                                                                                                                                                                                                                                                                                                                                 |
| 2   | Core Content-Type          | IN REVIEW | React Query data layer on the shared axios client. Content-type list and schema (`GET /content-types`, `GET /content-types/:slug`, `PATCH …/list-fields`). Single-type get/save/publish/unpublish. Collection-type list (start/size/orderBy/sortDir/search/`filters[field][$op]`), get, create, update, delete, duplicate, publish, unpublish, bulk create and bulk delete. Typed query-key factory, cache invalidation, and ABAC checks per content-type slug. Logic only, with no styled UI. Built: see [Content data](./content-data.md). Stays IN REVIEW until the manual smoke against :8080 runs (see _Known gaps from Phase 2_). |
| 3   | Base UI layout             | DONE      | Tailwind v4 + shadcn/ui (Base UI) design system with slate and indigo tokens, Light/Dark/System theme, and the base inputs (Button, Input, Textarea, JsonInput, Switch, `Field`) with a dev-only UI kit. App shell: header (breadcrumbs, account menu with theme and logout), collapsible side menu (content types grouped Single/Collection, settings links gated by permission), footer, and a mobile off-canvas menu. Auth pages and `/admin` pages restyled. axe checks in both themes. See [Design system](./design-system.md) and [App shell](./app-shell.md).                                                                    |
| 4   | Settings UI                | IN REVIEW | Users (role assignment by level hierarchy, delete), Roles (CRUD, permission tree, default-role rules), Permissions (CRUD, 409 conflict counts), Access Tokens (create/revoke with one-time secret reveal, delete), Media library (upload PNG/JPEG, delete). Profile name editing. All gated by RBAC/ABAC, with axe and keyboard checks. Built: see [Settings](./settings.md). Stays IN REVIEW until the manual smoke against :8080 runs (see _Known gaps from Phase 4_).                                                                                                                                                                |
| 5   | Document (content-type) UI | PENDING   | Use the **ui-ux-pro-max** skill. Schema-driven forms (text, richtext, number, boolean, media, json, and repeatable components), single-type editor, collection list view (pagination, search, filters, column chooser), detail and create pages, publish/unpublish/duplicate/bulk actions, and per-action permission gating.                                                                                                                                                                                                                                                                                                            |
| 6   | Internationalization       | PENDING   | Outline only. The scope must be settled before the phase starts (see _Deferred questions_).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Deferred questions

Resolve each one before the named phase starts.

1. **Phase 6:** does "internationalization" mean translating the admin UI (for example with `react-i18next` and a language switcher), localized content, or both? The backend currently has **no** locale support (no `locale` parameter and no locales module), so localized content would need backend work first.
2. **Phase 3 (closed):** which styling stack should the design system use, and should it be shared through `@repo/ui`? **Decision:** Tailwind CSS v4 + shadcn/ui in the Base UI flavour + `lucide-react`, vendored app-locally in `apps/cms-admin/src/components/ui`. `@repo/ui` stays empty until a second app needs the primitives. See [Design system](./design-system.md#styling-decision).
3. **Deployment (any phase):** should the `cms-admin` Dockerfile take a `VITE_API_URL` build arg, and should the config repo pass it? Prod builds need it, because nginx does not proxy `/api`.

## Known gaps carried over from Phase 1

- `PUT /users/:id` stores passwords unhashed on the backend, so the admin offers no password change until that is fixed.
- The profile page is read-only; profile editing moves to Phase 4 (done: name editing only, see _Known gaps from Phase 4_).
- Cross-tab session sync and health keep-alive pings are not implemented.

## Known gaps from Phase 2

- The manual smoke against the real backend on :8080 has not run: no `super_admin` credentials were available on 2026-10-01. Phase 2 moves to DONE once it runs and its result is recorded in [Content data](./content-data.md).
- The seeded `editor` role has no `content_type:read`, so no schema loads for an editor until that permission is granted. This is a backend seeding gap, not fixed in the admin.

## Known gaps from Phase 3

- The mobile menu drawer has `role="dialog"` but no `aria-modal="true"`. Focus trapping and Escape work and axe reports nothing, but screen readers may still read the page behind it. Add `aria-modal` to the vendored `sheet.tsx`.
- The admin home welcome card has a capped width and is centred, while other cards inside the shell are full width.
- The Phase 3 security audit re-raised SEC-4 below (no Content-Security-Policy). Phase 3 made the page CSP-ready: the theme pre-paint script is the external `public/theme-init.js`, and nothing is inline. The headers still belong in the hosting or proxy config.

## Known gaps from Phase 4

- The manual smoke against the real backend on :8080 has not run: no `super_admin` credentials were available on 2026-10-02 (D9). The settings contract is checked only against the legacy docs and the e2e mocks. Phase 4 moves to DONE once the smoke runs and its result is recorded in [Settings](./settings.md#manual-smoke-against-8080-d9).
- `expiresIn: "1m"` is labelled "1 month" but has not been checked against the backend (D6). The smoke should create a token with it and compare `expiresAt` with the creation time. If `1m` means one minute, relabel it.
- The Roles page adds no client-side level-hierarchy rule for creating, editing or deleting roles (D4). It mirrors the backend contract (level 0 to 100 only), so an actor can create or edit a role above their own level if the backend allows it.
- Media thumbnails load straight from the media host (usually a CDN), not through `/api`. When the Content-Security-Policy from SEC-4 is added, its `img-src` must allow that host, or every thumbnail breaks.
- `PUT /users/:id` still stores passwords unhashed on the backend, so the profile page edits the name only (D8).
- The pure-module 90% branch bar of AC-44 is met (97% or more) but checked by reading the coverage report, not enforced by a per-file threshold.

## Open security findings (LOW, from the Phase 1 audit)

The Phase 1 security audit passed with no CRITICAL, HIGH or MEDIUM findings. These LOW findings were accepted for now:

| ID    | Finding                                                                                                                          | Where                                                                | Suggested fix                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| SEC-1 | A 401 refresh that is still running during logout can store a fresh access token after the session was cleared.                  | `src/core/api/CmsApi.ts`, `src/features/auth/store/sessionThunks.ts` | Drop refresh results that started before the logout (for example, with a session counter). |
| SEC-2 | If the logout request fails, the user is not told, and the refresh cookie stays valid, so the next page load signs them back in. | `src/features/auth/store/sessionThunks.ts`                           | Tell the user when logout fails, or retry it.                                              |
| SEC-3 | The Bearer token is added to every request, whatever its host. Every call uses a relative path today, so nothing leaks yet.      | `src/core/api/CmsApi.ts`                                             | Attach the token only to requests for the API's own origin.                                |
| SEC-4 | No Content-Security-Policy or Referrer-Policy is set. The access token is in JS memory, so any XSS could read it.                | `index.html`, nginx config                                           | Add both headers before Phase 5 starts rendering HTML from the server.                     |
| SEC-5 | The password-reset token stays in the URL and in browser history while the reset page is open.                                   | `src/pages/reset-password/ResetPasswordPage.tsx`                     | Read the token, then remove it from the URL with `history.replaceState`.                   |

## Open security findings (LOW, from the Phase 2 audit)

The Phase 2 security audit passed with no CRITICAL, HIGH or MEDIUM findings. These LOW findings were accepted for now, and both should be fixed before Phase 5 builds user-driven filter screens:

| ID       | Finding                                                                                                                                                                                                              | Where                                                                              | Suggested fix                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P2-SEC-1 | Filter field names and `orderBy` go into the query string unchecked. A field name with brackets (such as `x][$ne`) can add parameters that validation never saw. The placeholder page passes `orderBy` from its URL. | `src/features/content/listQuery.ts`, `src/pages/content-types/ContentTypePage.tsx` | Reject any field name or `orderBy` that is not a plain identifier or known column, with `ERR_CLIENT_VALIDATION`. |
| P2-SEC-2 | `search` and filter values have no length limit, so they can produce very long GET URLs.                                                                                                                             | `src/features/content/listQuery.ts`                                                | Cap them in `validateListParams` (for example, at 256 characters).                                               |
