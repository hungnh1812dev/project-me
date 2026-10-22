# Owner setup (one-time setup page)

Status: design, 2026-10-22 (planner, DESIGN owner-setup). Decision record: [ADR 0005](../adr/0005-one-time-owner-setup-route.md). Spec: `SPEC.md` §1, D1, D15, D17, §9, §12-1. Tasks: OS1-OS4 in `tasks/todo.md` ("Ad-hoc: Owner setup").

## Why

The user does not want to create the owner with `kubectl exec` or a one-shot Job on k3s. Like Strapi's first-run admin, the admin console offers a setup page while no owner exists. Unlike Strapi, the page is not open to whoever arrives first: it needs a setup token that only the operator has (a value in the cms-api k8s Secret).

## Rules (the contract)

1. **Open only while all hold:** `OWNER_SETUP_TOKEN` is set, and no live owner exists (`accounts.role_slug = 'owner' AND deleted_at IS NULL`). Otherwise the setup is **closed**.
2. **Closed means gone:** `POST /setup/owner` answers `404 NOT_FOUND` (the same body as an unknown route), with or without a token. `GET /setup/status` answers `{ "open": false }`.
3. **One owner, one code path:** the route and the `owner:bootstrap` CLI both call `bootstrapOwner()` (advisory lock, owner-exists check, email-taken check, system role check, Argon2id). The partial unique index `accounts_single_owner_uq` stays the last line of defence. A request that loses a race to another request or to the CLI gets the closed answer (404).
4. **The token gates everything else:** the route checks the token before it parses the body or hashes a password, so a wrong token costs no Argon2 time and reveals no validation rules.
5. **No session from setup:** a successful setup returns `201 { email }` and no tokens or cookies. The owner then signs in on the normal login page (normal throttles, `auth.login_succeeded` audit, then 2FA setup).
6. **Every attempt is audited** (D15), with no token, password or email value in metadata beyond what existing rows already allow.

## API (under `/api/v1`, cms-api `identity` module)

| Route               | Auth                | Body                                            | Answers                                                                                                                          |
| ------------------- | ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /setup/status` | none                | none                                            | `200 { open: boolean }`; `Cache-Control: no-store`                                                                               |
| `POST /setup/owner` | setup token in body | `{ setupToken, email, displayName?, password }` | `201 { email }` · `401 SETUP_TOKEN_INVALID` · `400` field errors · `409 OWNER_EMAIL_TAKEN` · `404 NOT_FOUND` when closed · `429` |

Order of checks in `POST /setup/owner`:

1. Throttle (`SETUP_SUBMIT` policy, below).
2. Closed check: token unset, or the in-process `closed` latch is set, or an owner exists (cheap `SELECT` of the owner row) -> 404.
3. `setupToken` is a string of at most `SETUP_TOKEN_MAX_LENGTH` (256) characters; anything else (missing, wrong type, too long) is treated as a wrong token -> 401. Compare: SHA-256 of the submitted value and of the configured value, then `crypto.timingSafeEqual` on the two digests (equal length, no early exit).
4. Body schema (Zod, the same email and password rules as `parseOwnerInput`: email normalised to lower case, password 12-128 characters, display name optional, defaults to the local part) -> 400 with field names only.
5. `bootstrapOwner(prisma, input, { channel: 'setup_page', meta })` in one transaction with the audit row. `OWNER_EXISTS` -> set the latch, answer 404. `EMAIL_TAKEN` -> 409 `OWNER_EMAIL_TAKEN` (only reachable with a valid token; existing accounts are never promoted). `ROLE_MISSING` -> 503 (`SERVICE_UNAVAILABLE`, migrations not run).
6. On success, set the latch and answer 201.

`GET /setup/status` returns `open = tokenConfigured && !latch && !ownerExists`. It needs no token: the admin console must know whether to show the setup page. It reveals only "this instance has no owner yet and expects a setup", which the operator causes on purpose and which lasts minutes.

New error codes in `ERROR_CODES`: `SETUP_TOKEN_INVALID`, `OWNER_EMAIL_TAKEN`. Route constants: `API_ROUTES.SETUP = { ROOT: 'setup', STATUS: 'status', OWNER: 'owner' }`.

### In-process latch

Once the service sees an owner (at boot, on any status or submit call, or after its own success) it sets `closed = true` in memory and stops querying. There is no HTTP route that deletes or demotes the owner (D6: nobody outranks the owner), so the latch can only be wrong if an operator deletes the owner row in SQL; a restart then re-reads the database. With more than one replica the latch is per process, which is harmless because the DB check and the advisory lock still decide (single replica in v1 anyway, §0-2).

## Setup token

- Env key `OWNER_SETUP_TOKEN`, cms-api only, optional. Lives in the cms-api k8s Secret (SOPS file in the deploy repo, `docs/deployment/k3s-secrets-sops.md`). Never a build arg, never in cms-admin or web.
- Generate: `openssl rand -base64 32` (32 random bytes). With `NODE_ENV=production` and the key set, Zod rejects a value shorter than `MIN_SECRET_BYTES` (32 bytes), like the other secrets (D17). It is not in `SECRET_ENV_KEYS` (those are required); it gets its own optional-secret check. The boot summary prints `[redacted]` when set, `unset` otherwise.
- Sent only in the JSON body. The admin console never reads it from the URL (no `?token=`, so it is not in browser history, Traefik access logs or `Referer`). The API never logs request bodies; the setup controller adds nothing to logs beyond the audit row.
- **Close and rotate:**
  - The setup closes itself the moment the owner exists (rules 1-2), whatever the token.
  - After setup the operator removes `OWNER_SETUP_TOKEN` from the Secret and restarts the deployment (documented step). Until then, cms-api logs one warning at boot and after a successful setup: `OWNER_SETUP_TOKEN is set but an owner exists; remove it from the secret.` (no value in the message).
  - Rotate before use (token leaked, or the setup is postponed): put a new value in the Secret and restart; the old value stops working at once because the env is read at boot.
  - If the owner row is ever removed by hand in SQL, the setup reopens only if a token is still configured. Removing the token after setup is what keeps it shut; the boot warning is the reminder.

## Rate limits (new `RATE_LIMIT_POLICIES` entries, in-memory like the others)

| Policy         | Rule name         | Key              | Limit        |
| -------------- | ----------------- | ---------------- | ------------ |
| `SETUP_SUBMIT` | `setup-submit:ip` | IP (D7 resolver) | 5 per 15 min |
| `SETUP_STATUS` | `setup-status:ip` | IP               | 30 per min   |

The token has 256 bits, so the submit limit is not what stops guessing; it bounds noise in the audit log and Argon2 work from a holder of a valid token. The submit limit is overridable for the smoke stack the same way as the login limits only if smoke needs it (it should not: smoke submits a handful of times).

## Audit (D15)

New actions in `AUDIT_ACTIONS`:

- `owner.created`: actor = the new owner account, metadata `{ channel: 'setup_page' | 'cli' }`. Written in the same transaction as the insert. The CLI path gets it too (actor type system for the CLI, as `owner:reset-2fa` does), so both ways of creating the owner leave a row.
- `owner.setup_rejected`: anonymous actor, client IP as on other anonymous rows, metadata `{ reason: 'bad_token' | 'closed' }`. Written standalone (`recordStandalone`). `closed` is recorded only for submits that carry a non-empty token field; a submit to a closed route with no token field gets 404 and no row, so scanners do not fill the log.

No row ever holds the token, the password or (for rejected attempts) the email.

## Admin console (cms-admin `features/auth`)

- New public route `APP_ROUTES.SETUP = '/setup'`, outside `ProtectedRoute`, with `AuthPageLayout` like the login and reset pages.
- `setup.api.ts`: `getSetupStatus()` and `createOwner(body)`; TanStack Query key `['setup', 'status']`, `staleTime: 0`.
- **Login page:** reads the status. When `open`, it shows an info notice above the form: "This console has no owner yet." with a primary link-button "Set up the owner account" to `/setup`. The login form stays usable. When the status call fails, the login page shows nothing extra (setup is never the default).
- **Setup page** (`OwnerSetupPage.tsx`):
  - On load: status `open: false` -> `Navigate` to `/login` (replace). Loading -> the existing `SessionLoading`.
  - Short intro: "Create the one owner account. You need the setup token from the cms-api secret (`OWNER_SETUP_TOKEN`)."
  - Fields (form-commons `Field` / `TextInput`): Setup token (password type, `autocomplete="off"`, no reveal by default), Email, Display name (optional, hint: defaults to the part before @), Password (hint: at least 12 characters), Repeat password (client-side match check only; not sent).
  - Submit button "Create owner account" (primary, `loading` while pending).
  - Errors: 401 -> error on the token field "This setup token is not valid."; 400 -> field errors from `details`; 409 -> email field "An account with this email already exists."; 404 -> navigate to `/login` with the notice "Setup is already complete. Sign in."; 429 -> form alert "Too many attempts. Wait a few minutes and try again."; other -> generic form alert.
  - Success: clear the form (token and passwords leave memory), invalidate `['setup','status']`, navigate to `/login` with the notice "Owner account created. Sign in, then turn on two-factor in Security settings." (existing `login-notice` mechanism) and the email prefilled.
- The page never puts the token in the URL, local storage or the Redux store; it lives in form state only.
- Visual direction: the project `ui-direction` skill (soft enterprise tone, primary button for the one main action).

## Interaction with `owner:bootstrap`

- The CLI stays as the fallback (no token needed; shell access is its own proof). It works whether or not `OWNER_SETUP_TOKEN` is set, and closes the setup page (an owner exists).
- Both paths share `bootstrapOwner()`, the advisory lock and the single-owner index, so a page submit and a CLI run at the same moment produce exactly one owner; the loser gets 404 (page) or `owner.exists` (CLI).
- `owner:reset-2fa` is unchanged and remains CLI-only (break-glass; no HTTP route).

## Code changes (for OS1 / OS2)

- `bootstrapOwner(prisma, input, options?)`: new optional `options` `{ channel, audit }` so the `owner.created` row is written inside its transaction. The CLI passes `channel: 'cli'`. Existing behaviour and error codes stay.
- New in `apps/cms-api/src/modules/identity`: `owner-setup.controller.ts`, `owner-setup.service.ts` (latch, token compare, error mapping), `owner-setup.requests.ts` (Zod DTO), `setup-token.ts` (hash + timing-safe compare, pure, unit-tested). Constants in `identity.constants.ts` (`SETUP_TOKEN_MAX_LENGTH`, setup channels), route constants in `api.constants.ts`, policies in `limits.constants.ts`, env in `env.schema.ts` / `app-config.ts` / `.env.example`.
- No DB schema change: there is no "setup completed" table; the owner row is the state.

## Not in scope

- Auto sign-in after setup, an owner email pinned by env, setup for any role other than owner, a web (`apps/web`) entry point, a setup wizard for content or settings.
