# CMS Admin roadmap

The CMS Admin re-implementation ships in big phases. Each big phase gets its own spec, plan and tasks, and starts only after the previous one is merged. This page carries the roadmap and the open questions forward once the working spec is removed.

## Big phases

| #   | Big phase                  | Status  | Outline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Core Auth                  | DONE    | Axios API client with token refresh, RTK store + RTK Query auth API, session bootstrap, RBAC/ABAC engine + hooks + `<Can>` guard, protected routing, minimal login/profile/onboarding pages, React Query provider, and test tooling. See the [docs index](./README.md).                                                                                                                                                                                                                        |
| 2   | Core Content-Type          | PENDING | React Query data layer on the shared axios client. Content-type list and schema (`GET /content-types`, `GET /content-types/:slug`, `PATCH …/list-fields`). Single-type get/save/publish/unpublish. Collection-type list (start/size/orderBy/sortDir/search/`filters[field][$op]`), get, create, update, delete, duplicate, publish, unpublish, bulk create and bulk delete. Typed query-key factory, cache invalidation, and ABAC checks per content-type slug. Logic only, with no styled UI. |
| 3   | Base UI layout             | PENDING | Use the **ui-ux-pro-max** skill. Design tokens and styling choice, then the app shell: header (user menu, logout), collapsible side menu (content types grouped Single/Collection, settings links gated by permission), footer, and a content area with breadcrumbs. Responsive with a mobile off-canvas menu. Restyle the Phase 1 auth pages.                                                                                                                                                 |
| 4   | Settings UI                | PENDING | Use the **ui-ux-pro-max** skill. Users (role assignment by level hierarchy, delete), Roles (CRUD, permission tree, default-role rules), Permissions (CRUD, 409 conflict counts), Access Tokens (create/revoke with one-time secret reveal, delete), Media library (upload PNG/JPEG, delete). Profile editing. All gated by RBAC/ABAC.                                                                                                                                                          |
| 5   | Document (content-type) UI | PENDING | Use the **ui-ux-pro-max** skill. Schema-driven forms (text, richtext, number, boolean, media, json, and repeatable components), single-type editor, collection list view (pagination, search, filters, column chooser), detail and create pages, publish/unpublish/duplicate/bulk actions, and per-action permission gating.                                                                                                                                                                   |
| 6   | Internationalization       | PENDING | Outline only. The scope must be settled before the phase starts (see _Deferred questions_).                                                                                                                                                                                                                                                                                                                                                                                                    |

## Deferred questions

Resolve each one before the named phase starts.

1. **Phase 6:** does "internationalization" mean translating the admin UI (for example with `react-i18next` and a language switcher), localized content, or both? The backend currently has **no** locale support (no `locale` parameter and no locales module), so localized content would need backend work first.
2. **Phase 3:** which styling stack should the design system use: Tailwind + shadcn/ui (Radix or Base UI, as in the legacy app), or another option? Should it be shared through `@repo/ui`?
3. **Deployment (any phase):** should the `cms-admin` Dockerfile take a `VITE_API_URL` build arg, and should the config repo pass it? Prod builds need it, because nginx does not proxy `/api`.

## Known gaps carried over from Phase 1

- `PUT /users/:id` stores passwords unhashed on the backend, so the admin offers no password change until that is fixed.
- The profile page is read-only; profile editing moves to Phase 4.
- Cross-tab session sync and health keep-alive pings are not implemented.
