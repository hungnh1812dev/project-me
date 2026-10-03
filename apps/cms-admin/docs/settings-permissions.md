# Settings permissions

The Permissions page at `/admin/settings/permissions` (Phase 4.3, paging in Phase 6): the permission
catalog grouped by resource, with create, edit and delete, and a clear conflict state when a
permission is still in use. For administrators extending what roles and tokens can grant.

## Feature

- **List (P1).** `usePermissions` loads the catalog (only with `permission:read`), grouped by
  resource (the slug before the first `:`) into native `<details>` sections, open by default, each
  with a count badge ("document 6 permissions") and its own captioned table in a labelled, focusable
  scroll region. Rows: slug in monospace, name, description. Search covers all three; the group
  counts follow the search.
- **Paging (D7).** Pages run over the matching permission rows sorted by slug (`sortBySlug`), not
  over groups. `groupByResource(pageRows, allMatches)` shows only groups with rows on the current
  page; a split group appears on each page and its badge keeps the full match count.
- **Policy.** `useCan('create' | 'update' | 'delete', 'permission')` gates New permission and each
  row's "Edit <slug>" and "Delete <slug>"; all need `permission:manager`. The empty state repeats New
  permission.
- **Create and edit.** `PermissionFormDialog` (modal, native form, Enter submits): Slug
  (`PERMISSION_SLUG_PATTERN`, "resource:action, lowercase. It can't be changed later."), Name (≤ 100)
  and Description (≤ 500 with the `Textarea` counter). Create shows "Creating a permission grants
  nothing by itself…". A P2 409 shows "A permission with this slug already exists." on Slug; other
  errors as an alert. On edit the slug is read-only, focus starts on Name, and `permissionChanges`
  sends P3 only the changed fields (no change just closes).
- **Delete.** `DeletePermissionDialog` confirms "Delete <slug>?". On P4 409,
  `parsePermissionConflict` reads `{ roleCount, accessTokenCount }`: "This permission is still used
  by 2 roles and 1 access token. Remove it from them first." (pluralized, zero counts left out);
  without usable counts it falls back to the server message. The dialog switches to "<slug> is still
  in use", links to Roles and Access tokens (each only when readable; following one closes the
  dialog) and offers only Close (`hideConfirm`).
- **Feedback.** `Permission "<slug>" created.`, `… updated.`, `… deleted.` in the `LiveRegion`.

### Decisions

- **Page by row, not by group (D7)**, so page sizes stay predictable when one resource is large.
- **Conflicts explain the fix**, with links, rather than a bare 409 message.

## Files

| File                                                     | Spec                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/pages/settings/PermissionsPage.tsx`                 | Default export: grouped catalog, search, paging, actions.           |
| `src/pages/settings/permissions/PermissionFormDialog.tsx`| Exports `PermissionFormDialog`: create and edit.                    |
| `src/pages/settings/permissions/DeletePermissionDialog.tsx` | Exports `DeletePermissionDialog`: confirmed P4 with the conflict state. |
| `src/features/settings/api/permissionsApi.ts`            | Exports `getPermissions`, `createPermission`, `updatePermission`, `deletePermission` and input types (P1–P4). |
| `src/features/settings/hooks/usePermissions.ts`          | Exports `usePermissions`, `useCreatePermission`, `useUpdatePermission`, `useDeletePermission`, `UpdatePermissionVariables`. |
| `src/features/settings/conflict.ts`                      | Exports `parsePermissionConflict`, `PermissionConflictSummary`. 409 body → sentence or server message. |
| `src/features/settings/permissionGroups.ts`              | Exports `sortBySlug`, `groupByResource`, `ResourceGroup`. Row-based paging into groups. |

## Testing

- `PermissionsPage.test.tsx`, `permissions/DeletePermissionDialog.test.tsx`,
  `api/permissionsApi.test.ts`, `hooks/usePermissions.test.ts`, `conflict.test.ts`,
  `permissionGroups.test.ts`.
- `e2e/settings-permissions.spec.ts`. The mock's P2 answers 400 for a bad slug or missing fields and
  409 for a known slug; P3 and P4 404 for an unknown id; P4 409
  `{ message, roleCount, accessTokenCount }` counted from the stored roles and tokens.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/settings/PermissionsPage.test.tsx src/pages/settings/permissions src/features/settings/conflict.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-permissions.spec.ts`.

## Related

- [Settings foundation](./settings-foundation.md), [Settings permission tree](./settings-permission-tree.md)
- [Settings roles](./settings-roles.md), [Settings access tokens](./settings-access-tokens.md)
