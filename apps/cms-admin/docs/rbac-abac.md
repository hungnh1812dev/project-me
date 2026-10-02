# RBAC and ABAC

The client decides what to show from the signed-in user's role. RBAC is a set of pure functions over the flat permission slugs in `me.role.permissions`. ABAC is a typed policy table that `can()` evaluates against the user and the resource. Hooks and the `<Can>` component are thin wrappers over memoized selectors.

These checks are **client-side defense in depth only**. The backend enforces every rule again, and a server 403 is still surfaced as "no access".

Source: `src/features/auth/permissions/{permissions.ts,policies.ts,can.ts}`, `src/features/auth/hooks/{usePermission.ts,useCan.ts}`, `src/features/auth/components/Can.tsx`, `src/features/auth/store/selectors.ts`.

## Permission rules (RBAC)

Slugs are `resource:action[:scope]`. `hasPermission(granted, required)` mirrors the backend's `PermissionsGuard`:

| Rule                                                            | Example                                             |
| --------------------------------------------------------------- | --------------------------------------------------- |
| An exact match passes                                           | `media:read` ⇒ `media:read`                         |
| `<res>:manager` satisfies `<res>:read` (and only `read`)        | `media:manager` ⇒ `media:read`                      |
| Global `document:<action>` satisfies `document:<action>:<slug>` | `document:update` ⇒ `document:update:blog`          |
| A scoped grant never satisfies the global slug                  | `document:read:blog` ⇏ `document:read`              |
| Malformed slugs are never granted                               | `''`, `media`, `:read`, `document:read:`, `a:b:c:d` |

Other helpers (`permissions.ts`):

- `hasAllPermissions(granted, required[])`: every slug. An empty list passes.
- `hasAnyPermission(granted, required[])`: one slug. An empty list fails.
- `hasRole(role, slug | slug[])`: the role's slug matches. A null role has no slug.
- `hasMinLevel(role, n)`: `role.level >= n`. A null role is level 0.
- `ROLE_LEVEL = { ADMIN: 50, SUPER_ADMIN: 100 }`: named floors only. Roles are dynamic, so never hardcode a role list.

`checkPermissions(granted, required, { mode, contentTypeSlug })` (`can.ts`) returns a `Decision` for one or more slugs. With `contentTypeSlug`, global `document:<action>` slugs are scoped to `document:<action>:<slug>`; other slugs are unchanged.

## Policy table (ABAC)

`can(actor, action, subject, attrs?)` returns `{ allowed: boolean; reason: string | null }`. It is **deny by default**: an unknown subject or action (including inherited object keys such as `toString`) is denied. The actor is `{ userId, level, permissions }`, built by `toActor(user)` (no user or no role: level 0, no permissions).

The permission is always checked first, then the conditions, in the order below.

| Subject                            | Action                                           | Rule                                                                                                            |
| ---------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `document`                         | `read`, `create`, `update`, `delete`             | `document:<action>`, or `document:<action>:<contentTypeSlug>` when `contentTypeSlug` is given                   |
| `document`                         | `publish`, `unpublish`                           | As above, and denied when `draftToPublish === false`                                                            |
| `content_type`                     | `read`                                           | `content_type:read`                                                                                             |
| `content_type`                     | `configure`                                      | `content_type:manager`                                                                                          |
| `user`                             | `read`                                           | `user:read`                                                                                                     |
| `user`                             | `update`                                         | Own record (`targetUserId === actor.userId`): allowed. Otherwise `user:manager` and `actor.level > targetLevel` |
| `user`                             | `delete`                                         | `user:manager`, not self, `actor.level > targetLevel`                                                           |
| `user`                             | `assign_role`                                    | `user:role_manager`, not self, `actor.level > targetLevel`, `newRoleLevel < actor.level`                        |
| `role`                             | `read`                                           | `role:read`                                                                                                     |
| `role`                             | `create`                                         | `role:manager`                                                                                                  |
| `role`                             | `update`                                         | `role:manager`; denied on a default role (`isDefault`) when `fields` includes `name` or `level`                 |
| `role`                             | `delete`                                         | `role:manager`; denied on a default role                                                                        |
| `permission`, `api_token`, `media` | `read`                                           | `<res>:read`                                                                                                    |
| `permission`, `api_token`, `media` | `create`, `update`, `delete`, `revoke`, `upload` | `<res>:manager`                                                                                                 |

An unknown `targetLevel` or `newRoleLevel` counts as a failed condition (deny).

Denial reasons:

| Reason                                                      | When                                           |
| ----------------------------------------------------------- | ---------------------------------------------- |
| `Requires the "<slug>" permission.`                         | The first missing slug                         |
| `Requires one of the "<a>", "<b>" permissions.`             | `checkPermissions` in `any` mode               |
| `This content type does not use draft and publish.`         | publish/unpublish with `draftToPublish: false` |
| `Requires a higher role level than the target user.`        | user update/delete/assign_role                 |
| `You cannot delete your own account.`                       | user delete on self                            |
| `You cannot change your own role.`                          | user assign_role on self                       |
| `The new role level must be lower than your own.`           | user assign_role                               |
| `A default role cannot be deleted.`                         | role delete                                    |
| `The name and level of a default role cannot be changed.`   | role update                                    |
| `Unknown subject "<s>".` / `Unknown action "<a>" on "<s>".` | deny by default                                |

## Selectors and hooks

Selectors (`store/selectors.ts`, memoized): `selectPermissions`, `selectRoleLevel` (0 without a role), `selectActor` (recomputed only when the user changes).

| Hook                                                                 | Returns    |
| -------------------------------------------------------------------- | ---------- |
| `usePermission(required \| required[], { mode?, contentTypeSlug? })` | `boolean`  |
| `usePermissionDecision(required \| required[], options?)`            | `Decision` |
| `useCan(action, subject, attrs?)`                                    | `Decision` |
| `useRoleLevel()`                                                     | `number`   |

All of them re-render when the user's permissions or role change (for example after `userLoaded` or a sign-out). `useCan` memoizes on `attrs` identity, so pass a memoized object when a stable result matters.

```tsx
const canEditBlog = usePermission('document:update', { contentTypeSlug: 'blog' });
const canSeeAdmin = usePermission(['user:read', 'role:read'], { mode: 'any' });
const { allowed, reason } = useCan('delete', 'user', { targetUserId, targetLevel });
const isAdmin = useRoleLevel() >= ROLE_LEVEL.ADMIN;
```

## `<Can>`

Pass either a policy (`I`, `a`, `with`) or a `permission` (with optional `mode` and `contentTypeSlug`). It renders `children` when allowed and `fallback` (default `null`) when denied. A render-function child is always called with the decision and `fallback` is ignored, so a page can render a disabled control with the reason.

```tsx
<Can I="upload" a="media" fallback={<p>No access</p>}>
  <UploadButton />
</Can>

<Can permission={['role:read', 'user:read']} mode="any">
  <SettingsLink />
</Can>

<Can I="delete" a="role" with={{ isDefault: role.isDefault }}>
  {({ allowed, reason }) => (
    <button type="button" disabled={!allowed} title={reason ?? undefined}>
      Delete
    </button>
  )}
</Can>
```

## Adding a policy

1. Add the subject (or action) to `policies` in `permissions/policies.ts`. Use `requires('<slug>')` for a plain permission check, `resourcePolicies('<res>')` for the read/manager pattern, or a function `(actor, attrs) => Decision` that calls `check(actor, slug)` first and then the conditions.
2. Add any new attribute to `PolicyAttrs`, with a comment naming the subject that reads it.
3. Add table-driven cases to `permissions/can.test.ts`, including every denial reason. The coverage gate for `src/features/**/*.ts` is 85%; this folder is at 100%.
4. Update the policy table above. The engine (`can`), hooks and `<Can>` do not change.

## Testing

- `permissions.test.ts` and `can.test.ts` are plain unit tests (no store).
- Hook and `<Can>` tests use `renderHookWithProviders` / `renderWithProviders` with `auth: { user: makeMeUser({ role: makeRole({ permissions, level }) }) }`, and dispatch `userLoaded` inside `act` to check re-renders.

## Decisions

- **Permission first, then conditions.** A denial names the missing slug before any attribute rule, so a user without the permission never learns about the condition.
- **Unknown attribute values deny.** A missing `targetLevel` or `newRoleLevel` fails the level checks, so a caller that forgets an attribute gets the safe answer.
- **`a:b:c:d` is malformed.** Slugs have at most three parts (`resource:action:scope`).
- **`contentTypeSlug` only scopes `document:<action>`.** Other resources have no per-type grants.
- **`useRoleLevel` lives in `useCan.ts`**, next to the other ABAC hook, to keep the file list of the plan.
