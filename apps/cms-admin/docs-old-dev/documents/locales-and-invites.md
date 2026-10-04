# Locales (orphaned) & Invites (removed)

`src/pages/admin/settings/InternationalizePage.tsx`, `src/components/locale/LocaleSelector.tsx`, `src/hooks/{useLocales,useLocalesMutations}.ts` — the locale catalog UI, kept as **source-only, unreachable dead code** per an explicit product decision: this backend (`abyssoftime-cms-api`) has no locale/i18n module at all. There is no invite flow anymore — it was removed entirely, not hidden (see below).

## Locales — hidden, not deleted

The `/admin/settings/internationalize` route and the `locales:manager` Sidebar item have been removed from `router.tsx`/`Sidebar.tsx` (see [app-shell.md](./app-shell.md), [navigation-shell.md](./navigation-shell.md)) — there is no way to reach `InternationalizePage` through the UI. The files themselves — `InternationalizePage.tsx`, `LocaleSelector.tsx`, `useLocales.ts`, `useLocalesMutations.ts`, and the `Locale` type in `types/cms.ts` — were deliberately **left in place, untouched**, so a future backend that does add locale support has something to re-wire rather than rebuild from scratch. `bun run build` passes with these files present and unreferenced.

`ContentTypePanel` and `CollectionListPage` (see [content-type.md](./content-type.md), [documents.md](./documents.md)) no longer import `LocaleSelector`/`useLocales` at all — the locale-switcher UI, the "discard unsaved changes on locale switch" dialog, and every `locale` query param/query-key segment were stripped from both, not just hidden behind a flag.

**Known-stale artifact**: `useLocales.ts`/`useLocalesMutations.ts` call `/api/locales` directly against the `api` axios instance, whose `baseURL` is already `.../api/v1` (see [app-shell.md](./app-shell.md)) — that resolves to `/api/v1/api/locales`, which doesn't match this API's actual `/api/v1/locales`-style convention even if it were reachable. This predates the contract rewrite and was never fixed, since the code is orphaned and unreachable through the UI; harmless as long as it stays that way.

## Invites — removed entirely

Unlike locales, invites are **not** an orphaned-source situation — this is the one explicit exception to "keep the source, just hide the UI." There is no invite-based onboarding in `abyssoftime-cms-api` (no `/invites` endpoint, no `/auth/invite/:token`); onboarding is open self-registration + OTP verification only (see [auth.md](./auth.md)). Accordingly:

- `hooks/useInvites.ts` and `pages/auth/InviteAcceptPage.tsx` have been **deleted**.
- The `/invite/:token` route no longer exists in `router.tsx`.
- The invite-creation dialog and "Pending Invites" table that used to render inline inside [access-control.md](./access-control.md)'s `UsersPage` have been stripped out.

If a future backend contract adds invite-based onboarding, this would need to be rebuilt from scratch — there's no dead code left to resurrect, unlike the locale files above.
