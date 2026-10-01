# CMS Admin docs

Feature docs for `apps/cms-admin`. Each small phase adds or updates one page here.

| Page                                                    | What it covers                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Testing and config](./testing-and-config.md)           | Test scripts, coverage gates, MSW and Playwright conventions, env vars, dev proxy     |
| [API client](./api-client.md)                           | `cmsApi`, bearer interceptor, single-flight 401 refresh, `ApiError` shape             |
| [Auth session](./auth-session.md)                       | Redux auth state, RTK Query auth API, bootstrap, login, logout, expiry, QueryClient   |
| [RBAC and ABAC](./rbac-abac.md)                         | Permission rules, ABAC policy table, `usePermission`/`useCan`/`useRoleLevel`, `<Can>` |
| [Routing and guards](./routing-and-guards.md)           | Route table, `RequireAuth`/`RequireAccess`, login/profile/403 pages, e2e `mockApi`    |
| [Onboarding and recovery](./onboarding-and-recovery.md) | First-run redirect, register, verify OTP, forgot and reset password                   |

The legacy app's docs are in [`../docs-old-dev/`](../docs-old-dev/) (reference only).
