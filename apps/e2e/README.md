# @abyss/e2e

Playwright end-to-end tests that run against a running Abyss stack (Chromium).
This is not part of `pnpm test`: root `test` filters it out, because it needs a stack.

## Run against the smoke stack

```bash
pnpm --filter @abyss/e2e browsers:install   # once: Chromium into node_modules
SMOKE_E2E=1 pnpm smoke
```

`scripts/smoke.sh` builds the production images, runs `db:migrate`, and
creates the owner through `POST /setup/owner`, then runs `pnpm --filter @abyss/e2e test` with the `E2E_*`
values below. It sets them from the stack, including the generated owner
password and the Mailpit URL (`mail.<SMOKE_DOMAIN>`, the SMTP sink the stack
sends OTP emails to). Then it tears the stack down.

The web session spec signs in with two seeded read-only (`guest` role)
accounts, `e2e-reader@` and `e2e-reader-2fa@<SMOKE_DOMAIN>` (the second has
email 2FA on), passed as `E2E_READER_*` and `E2E_READER_2FA_*`.

The 2FA spec uses its own account (`e2e-2fa@<SMOKE_DOMAIN>`, seeded by
`scripts/smoke.sh` as an active admin with a generated password), because
the owner already spends 4 of the 5 logins per email per 15 minutes (smoke +
owner specs). It reads the setup key from the dialog and computes codes with
`otplib`; since cms-api rejects a reused time step, it waits for the next
30 s step between codes, so it runs for up to about a minute.

Specs run in one worker: `PasswordReset.e2e.spec.ts` changes the owner password
(and puts it back at the end), so it must not overlap other specs. Codes are
read from Mailpit's API through a browser tab (Chromium resolves
`*.localhost` itself).

## Run single specs against a kept stack

A full smoke run rebuilds every image. To iterate on a few specs, keep the
stack once and run specs against it:

```sh
SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke             # once: build, seed, full suite
pnpm e2e:spec tests/ReviewerSession.e2e.spec.ts            # seconds, no rebuild
pnpm e2e:spec tests/ReviewerSession.e2e.spec.ts -g "starts" # one test
docker compose -p abyss-smoke down -v           # when done
```

`SMOKE_KEEP=1` writes the generated `E2E_*` values to `.smoke/e2e-vars.sh`
(gitignored, mode 600); `pnpm e2e:spec` reads it and checks the stack still
answers. The kept stack keeps its data and rate-limit counters between runs.
`SMOKE_NO_BUILD=1` reuses the last built images when only tests changed.

## Run single specs against the dev stack (tier 2)

No image build: `pnpm dev:stack` starts Postgres and Mailpit from ready images
(`docker-compose.dev.yml`, compose project `abyss-dev`) and runs cms-api,
cms-admin and web in dev mode on the host. It migrates, seeds the owner and the
e2e accounts (same helpers as the smoke stack) and writes `.dev-stack/e2e-vars.sh`.
Start-up is about 25-35 s.

```sh
pnpm dev:stack                                       # once
E2E_STACK=dev pnpm e2e:spec tests/AdminAuth.e2e.spec.ts # seconds
pnpm dev:stack:stop                                  # apps stopped, containers and volumes removed
```

- `E2E_STACK=dev|smoke` picks the stack; without it the one whose vars file
  exists is used, and with both present `e2e:spec` asks for `E2E_STACK`.
- Env comes only from the git-ignored `.localEnv.agent` (created with generated
  dev-only values; key names in [`.env.example`](.env.example)). Logs: `.dev-stack/*.log`.
- Admin `http://admin.domain.localhost:5173`, web `http://domain.localhost:5174`
  (`/api` proxied to cms-api on 3100), Mailpit `http://mail.domain.localhost:8125`.
  It never touches `abyss-smoke` and can run next to it.
- Tier 3 only: CORS/cookie flags, headers and Traefik routing differ from
  production here; use the smoke stack for those.

## Run against the CI stack

e2e runs locally only; CI does not run it.

## Run against another stack

Set the keys from [`.env.example`](.env.example) in the shell, then
`pnpm --filter @abyss/e2e test` (or `pnpm e2e` at the root).
`src/E2e.env.ts` is the only reader of `process.env`. `pnpm --filter @abyss/e2e
test:unit` checks (no stack needed) that `.env.example`, `E2E_VARS` in
`scripts/lib/stack-seed.sh` and `E2e.env.ts` list the same `E2E_*` names, and
that every file name under `src/` and `tests/` follows the naming rule.

## Module rules

- `src/AppContracts.contract.ts` is the only file that imports from an app's `src`
  (copy, routes, constants); specs import those names from it. Lint enforces it.
- `src/SmokeDatabase.client.ts` is the only file that runs `docker exec` / SQL (smoke
  database from `E2E_DB_*`); it refuses an API host that does not end in
  `.localhost`.

## Secure cookies over http://\*.localhost

The refresh cookie is `__Secure-abyss_rt` (`Secure`, `HttpOnly`,
`SameSite=Strict`, `Path=/api/v1/auth`). Chromium treats `localhost` and
`*.localhost` as secure contexts, so it stores and sends `Secure` /
`__Secure-` cookies over plain http there. It also resolves `*.localhost` to
loopback without a hosts entry. The smoke stack (`admin.domain.localhost:8080` ->
`domain.localhost:8080`) therefore works with production cookie attributes
unchanged. `admin.domain.localhost` and `domain.localhost` share the site
`domain.localhost`, so `SameSite=Strict` still sends the cookie on the admin's
XHR to the API. On any other plain-http host, the browser drops the cookie.

## Browsers

`PLAYWRIGHT_BROWSERS_PATH=0` is set in the scripts, so browsers install under
`node_modules` (no global cache).

## Tests

| Spec                                | Flow                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/AccessAdmin.e2e.spec.ts`     | Accounts and roles admin: invite dialog validation and role list, duplicate email, invitation email (Mailpit) to set-password, disable then sign-in refused, role matrix toggle / discard / save / reload, field picker, conditions errors, admin read-only own role and rank-limited actions. One owner login for the owner block. |
| `tests/AdminAuth.e2e.spec.ts`       | Owner signs in; cookie attributes; no token in JS storage; reload keeps the session (silent refresh); sign out; reload shows login                                                                                                                                                                                                  |
| `tests/AdminTabs.e2e.spec.ts`       | Two tabs in one context reload at once (racing silent refreshes): both stay signed in, every refresh is 200, later refreshes still work                                                                                                                                                                                             |
| `tests/PasswordReset.e2e.spec.ts`   | Owner resets the password with an emailed code (Mailpit), signs in with it, then puts the old password back                                                                                                                                                                                                                         |
| `tests/TwoFactor.e2e.spec.ts`       | 2FA account: TOTP setup from the manual key, login through the challenge dialog, TOTP off, email codes on (warning shown), login with the emailed code, change password ends the session                                                                                                                                            |
| `tests/ApiTokens.e2e.spec.ts`       | API tokens page: list columns, create form validation, raw token shown once then only its prefix, edit sends only changes, revoke, raw token refused on `/api-tokens`, list never returns it, admin sees own tokens only                                                                                                            |
| `tests/ContentForm.e2e.spec.ts`     | Dynamic document form on `cv-page`: every field type, validation, create and edit draft, richtext toolbar and keyboard, component reorder keeps uids, masked fields read-only, server 400 / 409 / load failure, console clean                                                                                                       |
| `tests/ContentConflict.e2e.spec.ts` | Conflict merge modal: keep mine, per-item cases, concurrent save refreshes the diff, keyboard and closing, masked fields never shown or sent                                                                                                                                                                                        |
| `tests/ContentPresence.e2e.spec.ts` | Presence banner (D16): one empty beat per period, two sessions see each other, leaving stops the beats, new document sends none                                                                                                                                                                                                     |
| `tests/ContentBulk.e2e.spec.ts`     | Collection list and bulk actions on `profile`: import (invalid, partial, all-or-nothing), select 5 then publish, unpublish failures, stale list conflict, delete asks first, focus return, role without content permissions                                                                                                         |
| `tests/MediaLibrary.e2e.spec.ts`    | Media library: upload, unsupported type, alt text limit and save, in-use delete message, delete                                                                                                                                                                                                                                     |
| `tests/MediaAttach.e2e.spec.ts`     | Media field in a document: pick, replace, remove, attached file cannot be deleted, upload in the field attaches (POST stubbed)                                                                                                                                                                                                      |
| `tests/ReviewerSession.e2e.spec.ts` | Reviewer access: web dialog, Turnstile states, memory-only token, published-only reads and refused writes, one session per connection, owner log and switch-off                                                                                                                                                                     |
| `tests/WebSession.e2e.spec.ts`      | Web sign-in: dialog validation, generic wrong-password message, reader session shared with the admin, owner refused, email-code step. Self-contained: own seeded accounts, no state from other specs                                                                                                                                |
| `tests/EdgeRouting.e2e.spec.ts`     | SPEC §12-2 and §12-17 through Traefik: login with a trailing slash is never redirected, `/auth/register` is 404                                                                                                                                                                                                                     |

Every SPEC §12 criterion and the test that proves it:
[`docs/modules/success-criteria.md`](../../docs/modules/success-criteria.md).
In CI (`CI` set) the config adds the `github` reporter and retries once.
