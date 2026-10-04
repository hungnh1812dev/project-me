# Profile

The signed-in user's own page at `/admin/profile`: identity, role and permissions, inline name
editing (Phase 4.7) and Log out. For every user, whatever their role.

## Feature

- **View.** Name, username, email, verified state; role name, slug and level or "No role assigned";
  the permission list in monospace (or "No permissions"); **Log out** (the `logout` thunk; the guard
  then lands on `/login`). The page refetches the user with `useCurrentUserQuery()`; if that fails it
  keeps showing the session user with a `role="alert"` notice.
- **Edit name (AC-39).** **Edit name** swaps the Name row for an inline form: Name (`Field`, label
  for screen readers only, required, prefilled, focused) with Save and Cancel. `validateProfileName`
  runs on submit, then on every change: required once trimmed ("Enter your name."), ≤ 100. Cancel
  sends nothing and returns focus to Edit name.
- **Save (U2, AC-40).** `useUpdateProfile` calls `updateUserName(me.documentId, name)`:
  `PUT /users/<id>` with exactly `{ name }` (trimmed). U2 needs only the bearer for your own record,
  so there is no policy check; signed out, the hook rejects with a client 403. On success it merges
  the name into `['auth', 'me']` (or the session user), dispatches `userLoaded` so the header updates
  without a reload, and invalidates `users`. The page closes the form, announces "Name updated." and
  focuses Edit name. A failure shows the server message with `role="alert"` and keeps the value.
- **No password (AC-41, D8).** No password, email or username control; `PUT /users/:id` never
  receives `password`.

### Decisions

- **Refetch through `cmsApi`, not `authApi.me`.** `authApi.me` skips the 401 refresh on purpose;
  the profile is the first page-level data call and the one the expiry e2e flows go through.
- **Name only (D8):** the backend stores `PUT /users/:id` passwords unhashed, so the admin offers no
  password change (see [Roadmap](./roadmap.md)).

## Files

| File                                            | Spec                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/pages/profile/ProfilePage.tsx`             | Default export: profile card, permissions, Edit name, Log out.                 |
| `src/pages/profile/EditNameForm.tsx`            | Exports `EditNameForm`, `EditNameFormProps`: inline name form.                 |
| `src/features/settings/hooks/useUpdateProfile.ts` | Exports `useUpdateProfile`, `UpdateProfileVariables`. U2, cache and session update. |

## Testing

- `src/pages/profile/ProfilePage.test.tsx`, `src/features/settings/hooks/useUpdateProfile.test.ts`.
- `e2e/profile.spec.ts`. The mock's U2 records bodies in `settings.userUpdates`, answers 404 for an
  unknown user, 403 for another user without `user:manager`, 400 for any `password` key or a name
  outside 1–100, and otherwise renames the `mockApi` user (so `/auth/me` follows).
- Run: `pnpm --filter cms-admin exec vitest run src/pages/profile src/features/settings/hooks/useUpdateProfile.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/profile.spec.ts`.

## Related

- [Auth session](./auth-session.md) (`useCurrentUserQuery`, `userLoaded`, `logout`)
- [Settings users](./settings-users.md) (`usersApi`), [Settings foundation](./settings-foundation.md)
- [Routing and guards](./routing-and-guards.md)
