# RBAC and ABAC

The client decides what to show from the signed-in user's role. RBAC is a set of pure functions over
the flat permission slugs in `me.role.permissions`; ABAC is a typed policy table that `can()`
evaluates against the user and the resource. Hooks, `<Can>`, `checkAccess` and `guard` are thin
wrappers. These checks are **client-side defense in depth only**: the backend enforces every rule
again, and a server 403 is still shown as "no access".

## Feature

### Permission rules (RBAC)

Slugs are `resource:action[:scope]`. `hasPermission(granted, required)` mirrors the backend's
`PermissionsGuard`:

| Rule                                                            | Example                                             |
| --------------------------------------------------------------- | --------------------------------------------------- |
| An exact match passes                                           | `media:read` ⇒ `media:read`                         |
| `<res>:manager` satisfies `<res>:read` (and only `read`)        | `media:manager` ⇒ `media:read`                      |
| Global `document:<action>` satisfies `document:<action>:<slug>` | `document:update` ⇒ `document:update:blog`          |
| A scoped grant never satisfies the global slug                  | `document:read:blog` ⇏ `document:read`              |
| Malformed slugs are never granted                               | `''`, `media`, `:read`, `document:read:`, `a:b:c:d` |

Other helpers: `hasAllPermissions` (empty list passes), `hasAnyPermission` (empty list fails),
`hasRole(role, slug | slug[])`, `hasMinLevel(role, n)` (null role is level 0), and
`ROLE_LEVEL = { ADMIN: 50, SUPER_ADMIN: 100 }` (named floors only; roles are dynamic, never hardcode
a role list). `checkPermissions(granted, required, { mode, contentTypeSlug })` returns a `Decision`;
with `contentTypeSlug`, global `document:<action>` slugs are scoped (`scopeToContentType`).

### Policy table (ABAC)

`can(actor, action, subject, attrs?)` returns `Decision { allowed, reason }` (the type comes from
`@repo/ui/lib/decision`). **Deny by default**: an unknown subject or action (including inherited keys
like `toString`) is denied. The actor is `{ userId, level, permissions }` from `toActor(user)`. The
permission is checked first, then the conditions.

| Subject                            | Action                                           | Rule                                                                                                            |
| ---------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `document`                         | `read`, `create`, `update`, `delete`             | `document:<action>`, or `document:<action>:<contentTypeSlug>` when given                                        |
| `document`                         | `publish`, `unpublish`                           | As above, and denied when `draftToPublish === false`                                                            |
| `content_type`                     | `read`                                           | `content_type:read`                                                                                             |
| `content_type`                     | `configure`                                      | `content_type:manager`                                                                                          |
| `user`                             | `read`                                           | `user:read`                                                                                                     |
| `user`                             | `update`                                         | Own record allowed. Otherwise `user:manager` and `actor.level > targetLevel`                                    |
| `user`                             | `delete`                                         | `user:manager`, not self, `actor.level > targetLevel`                                                           |
| `user`                             | `assign_role`                                    | `user:role_manager`, not self, `actor.level > targetLevel`, `newRoleLevel < actor.level`                        |
| `role`                             | `read`                                           | `role:read`                                                                                                     |
| `role`                             | `create`                                         | `role:manager`                                                                                                  |
| `role`                             | `update`                                         | `role:manager`; denied on a default role when `fields` includes `name` or `level`                               |
| `role`                             | `delete`                                         | `role:manager`; denied on a default role                                                                        |
| `permission`, `api_token`, `media` | `read`                                           | `<res>:read`                                                                                                    |
| `permission`, `api_token`, `media` | `create`, `update`, `delete`, `revoke`, `upload` | `<res>:manager`                                                                                                 |

An unknown `targetLevel` or `newRoleLevel` fails the condition. Denial reasons:
`Requires the "<slug>" permission.`, `Requires one of the "<a>", "<b>" permissions.`,
`This content type does not use draft and publish.`,
`Requires a higher role level than the target user.`, `You cannot delete your own account.`,
`You cannot change your own role.`, `The new role level must be lower than your own.`,
`A default role cannot be deleted.`, `The name and level of a default role cannot be changed.`,
`Unknown subject "<s>".` / `Unknown action "<a>" on "<s>".`

### Hooks and `<Can>`

| Hook                                                                 | Returns    |
| -------------------------------------------------------------------- | ---------- |
| `usePermission(required \| required[], { mode?, contentTypeSlug? })` | `boolean`  |
| `usePermissionDecision(required \| required[], options?)`            | `Decision` |
| `useCan(action, subject, attrs?)`                                    | `Decision` |
| `useRoleLevel()`                                                     | `number`   |

All re-render when the user's role or permissions change. `useCan` memoizes on `attrs` identity, so
pass a memoized object when a stable result matters.

`<Can>` takes a policy (`I`, `a`, `with`) or a `permission` (+ `mode`, `contentTypeSlug`). It
renders `children` when allowed and `fallback` (default `null`) when denied. A render-function child
is always called with the decision, so a page can render a disabled control with the reason.

### Route checks and mutation guard

- `checkAccess({ permission, mode, contentTypeSlug, minLevel, can })` runs every given check in that
  order; the first denial wins. `RequireAccess` uses it (see
  [Routing and guards](./routing-and-guards.md)).
- `guard(decision)`: every mutation hook calls it first. A denied decision throws
  `ApiError { status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: reason }`, so no request is sent
  and no cache entry changes. Shared by the content and settings features (moved here from
  `features/content/access.ts` in Phase 4).

### Adding a policy

1. Add the subject or action to `policies`: `requires('<slug>')`, `resourcePolicies('<res>')`, or a
   function `(actor, attrs) => Decision` that calls `check(actor, slug)` first.
2. Add any new attribute to `PolicyAttrs`, commented with the subject that reads it.
3. Add table-driven cases to `can.test.ts`, including every denial reason.
4. Update the policy table above. The engine, hooks and `<Can>` don't change.

### Decisions

- **Permission first, then conditions**, so a user without the permission never learns the
  condition.
- **Unknown attribute values deny**, so a caller that forgets an attribute gets the safe answer.
- **`a:b:c:d` is malformed**: slugs have at most three parts.
- **`contentTypeSlug` only scopes `document:<action>`**; other resources have no per-type grants.
- **`useRoleLevel` lives in `useCan.ts`**, next to the other ABAC hook.

## Files

| File                                          | Spec                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/features/auth/permissions/permissions.ts`| Exports `hasPermission`, `hasAllPermissions`, `hasAnyPermission`, `hasRole`, `hasMinLevel`, `ROLE_LEVEL`. Pure RBAC. |
| `src/features/auth/permissions/policies.ts`   | Exports `policies`, `Actor`, `PolicyAttrs`, `Policy`. The ABAC table.                          |
| `src/features/auth/permissions/can.ts`        | Exports `can`, `toActor`, `checkPermissions`, `scopeToContentType`, `PermissionMode`, `PermissionOptions`. Deny-by-default engine. |
| `src/features/auth/permissions/access.ts`     | Exports `checkAccess`, `AccessRequirements`. Combined route check for `RequireAccess`.         |
| `src/features/auth/permissions/guard.ts`      | Exports `guard`. Turns a denied decision into a client 403 before any request.                 |
| `src/features/auth/hooks/usePermission.ts`    | Exports `usePermission`, `usePermissionDecision`.                                              |
| `src/features/auth/hooks/useCan.ts`           | Exports `useCan`, `useRoleLevel`.                                                              |
| `src/features/auth/components/Can.tsx`        | Default export `Can`, `CanProps`. Declarative gate with fallback or render function.          |

## Testing

- `permissions/permissions.test.ts`, `can.test.ts` (table-driven, every reason), `access.test.ts`,
  `guard.test.ts`: plain unit tests, 100% of this folder.
- `hooks/usePermission.test.ts`, `useCan.test.ts`, `components/Can.test.tsx`: use
  `renderHookWithProviders` / `renderWithProviders` with
  `auth: { user: makeMeUser({ role: makeRole({ permissions, level }) }) }` and dispatch `userLoaded`
  inside `act` to check re-renders.
- Run: `pnpm --filter cms-admin exec vitest run src/features/auth/permissions src/features/auth/hooks src/features/auth/components/Can.test.tsx`.

## Related

- [Auth session](./auth-session.md) (`selectActor`, `selectPermissions`)
- [Routing and guards](./routing-and-guards.md) (`RequireAccess`)
- [Content data](./content-data.md) and [Settings foundation](./settings-foundation.md) (policy use, `guard`)
