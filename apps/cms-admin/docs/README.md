# CMS Admin docs

The admin single-page app (React, Vite) for managing content types, documents, users, roles, permissions, access tokens and media of the hungnhdev CMS.

| Module | Scope |
| ------ | ----- |
| [Testing and config](./testing-and-config.md) | Test scripts, coverage gates, MSW and Playwright setup, shared test helpers, alias, env vars, dev proxy |
| [CSP and headers](./csp-and-headers.md) | Content-Security-Policy builder, Referrer-Policy, nginx image, image URL allowlist |
| [API client](./api-client.md) | `cmsApi`, bearer only to the API origin, single-flight 401 refresh, `ApiError` |
| [Auth session](./auth-session.md) | Redux auth state, RTK Query auth API, bootstrap, login, logout, expiry, QueryClient |
| [RBAC and ABAC](./rbac-abac.md) | Permission rules, policy table, hooks, `<Can>`, `checkAccess`, `guard` |
| [Routing and guards](./routing-and-guards.md) | Route table, `RequireAuth`, `RequireAccess`, login, home and 403 pages, e2e auth mock |
| [Onboarding and recovery](./onboarding-and-recovery.md) | First-run redirect, register, verify OTP, forgot and reset password |
| [Profile](./profile.md) | Own profile, inline name editing, log out |
| [Design system](./design-system.md) | Styling stack, tokens and palette, `@repo/ui` usage, global CSS, UI kit page |
| [Theme](./theme.md) | Light, dark and system theme, pre-paint script, `ThemeProvider` |
| [App shell](./app-shell.md) | Shell layout, nav model, breadcrumbs, responsive menu, storage keys, `AuthLayout` |
| [Content data](./content-data.md) | Content-type and document hooks, list query, `contentKeys`, invalidation, per-slug ABAC, content test doubles |
| [Content-type pages](./content-type-pages.md) | Content-type overview, `:slug` dispatch, shared load states, paths and action errors |
| [Documents list](./documents-list.md) | Collection list: URL state, known-column check, filters, columns, pagination, row and bulk actions |
| [Single-type editor](./single-type-editor.md) | Load, save, publish and unpublish a single type |
| [Document editor](./document-editor.md) | Create and detail pages, editor header, unsaved-changes guard, gating |
| [Schema form](./schema-form.md) | Schema-driven react-hook-form form, field controls, richtext, media field and picker |
| [Settings foundation](./settings-foundation.md) | Settings contract, `settingsKeys`, policy use, list blocks, pagination, validation, settings test doubles |
| [Settings users](./settings-users.md) | Users list, change role, delete user |
| [Settings roles](./settings-roles.md) | Roles CRUD, default-role rules, own-role refresh |
| [Settings permissions](./settings-permissions.md) | Permission catalog CRUD, 409 conflict state, row-based paging |
| [Settings access tokens](./settings-access-tokens.md) | Token create, revoke and delete, one-time secret handling |
| [Settings media](./settings-media.md) | Media grid, upload flow, delete, `MediaThumbnail` |
| [Settings permission tree](./settings-permission-tree.md) | `PermissionTree` picker shared by the role and token forms |
| [Roadmap](./roadmap.md) | Big phases and status, deferred questions, known gaps, open security findings |
