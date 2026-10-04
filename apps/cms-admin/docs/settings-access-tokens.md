# Settings access tokens

The Access tokens page at `/admin/settings/access-tokens` (Phase 4.5): lists API tokens, creates
them with a permission set and an expiry, revokes (rotates) and deletes them, and shows each new
secret exactly once. For administrators wiring other services to the CMS API.

## Feature

- **List (T1).** `useAccessTokens` loads the tokens (only with `api_token:read`). One captioned
  table in a labelled, focusable scroll region: name, a permission-count toggle opening the slugs
  grouped by resource, expiry, created and updated dates. Expiry is "Never" for `expiresAt: null`,
  the date, or an outlined "Expired" badge plus the date once passed (compared with the mount time).
  Search covers name. Server order, one page at a time. `getAccessTokens` drops any `token` field a
  T1 response might carry, so no list secret is ever cached or rendered.
- **Policy.** `useCan('create' | 'revoke' | 'delete', 'api_token')`, all `api_token:manager`
  ("Revoke <name>", "Delete <name>").
- **Create (T2).** `TokenFormDialog` (wide modal, Enter submits): Name (`validateTokenName`, ≤ 100),
  an Expires `Select` of the six `EXPIRES_IN_OPTIONS` (default `1m`, "1 month", D6 unchecked) and the
  PermissionTree. With no permission it warns "A token with no permissions can't call any protected
  endpoint." but allows saving. A 400 shows the server message.
- **Revoke (T3) and delete (T4).** `RevokeTokenDialog` confirms `Revoke token "<name>"?` ("The
  current secret stops working immediately. A new secret will be shown once.") and sends `{}`; the
  record keeps its name, permissions and expiry. `DeleteTokenDialog` confirms `Delete token
  "<name>"?`. Errors stay in the dialog.
- **Feedback.** `Token "<name>" deleted.` goes straight to the `LiveRegion`; `… created.` and
  `… revoked. Its new secret was shown once.` are announced when the reveal closes, because the modal
  hides the page's live region while open.

### Secret handling (AC-30, AC-33, AC-34)

- T2 and T3 resolve the `AccessTokenSecret` to the caller only: no `setQueryData`, `gcTime: 0`, so
  the secret leaves the mutation cache as soon as the caller runs `reset()`.
- The dialog reads the result once, hands `{ name, secret }` (`RevealedSecret`) to the page and runs
  `mutation.reset()`. The secret then lives only in the page's `reveal` state; nothing writes it to
  Redux, web storage, the URL or the console.
- `SecretReveal` opens while `secret` is set: an `alertdialog` "Copy your token now", "You won't be
  able to see it again.", a read-only monospace input that selects itself on focus, Copy and Done.
  Copy uses `navigator.clipboard.writeText`: success announces "Copied." and relabels the button for
  2 s; failure announces "Couldn't copy. Select the token and copy it manually." and selects the
  text. Escape and outside clicks are ignored; only Done closes it, and focus returns to New token
  or Revoke (`finalFocus`).

### Decisions

- **The secret never enters a cache.** Both React Query caches are checked after `reset()` by a unit
  test.
- **Only Done closes the reveal**, so a stray Escape can't lose the only copy of a secret.
- **`1m` reads as one month (D6)** until the smoke confirms it; if it means a minute, relabel it.

## Files

| File                                                  | Spec                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `src/pages/settings/AccessTokensPage.tsx`             | Default export: table, paging, actions, the `reveal` state.          |
| `src/pages/settings/access-tokens/TokenFormDialog.tsx`| Exports `TokenFormDialog`, `RevealedSecret`: T2 form, hands the secret on once. |
| `src/pages/settings/access-tokens/RevokeTokenDialog.tsx` | Exports `RevokeTokenDialog`: confirmed T3, hands the new secret on. |
| `src/pages/settings/access-tokens/DeleteTokenDialog.tsx` | Exports `DeleteTokenDialog`: confirmed T4.                        |
| `src/features/settings/api/accessTokensApi.ts`        | Exports `getAccessTokens` (strips secrets), `createAccessToken`, `revokeAccessToken`, `deleteAccessToken`, `CreateAccessTokenInput`. |
| `src/features/settings/hooks/useAccessTokens.ts`      | Exports `useAccessTokens`, `useCreateAccessToken`, `useRevokeAccessToken`, `useDeleteAccessToken`. `gcTime: 0` on the secret mutations. |

## Testing

- `AccessTokensPage.test.tsx`, `api/accessTokensApi.test.ts`, `hooks/useAccessTokens.test.ts`
  (secret absent from both caches after `reset()`).
- `e2e/settings-access-tokens.spec.ts` (grants clipboard permissions to read the copied secret, and
  checks DOM, inputs, web storage and URL no longer hold it). The mock's T2 answers 400 for an empty
  name, unknown `expiresIn` or unknown slug, stores `expiresAt` from `expiresIn` (`1m` as 30 days)
  and returns a fresh `cms_live_…` secret; T3 returns a new secret each time; T3 and T4 404 for an
  unknown id.
- Run: `pnpm --filter cms-admin exec vitest run src/pages/settings/AccessTokensPage.test.tsx src/features/settings/hooks/useAccessTokens.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/settings-access-tokens.spec.ts`.

## Related

- [Settings foundation](./settings-foundation.md), [Settings permission tree](./settings-permission-tree.md)
- [Design system](./design-system.md) (`SecretReveal`), [Roadmap](./roadmap.md) (D6 gap)
