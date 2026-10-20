# @abyss/e2e

Playwright end-to-end tests that run against a running Abyss stack (Chromium).
This is not part of `pnpm test`: root `test` filters it out, because it needs a stack.

## Run against the smoke stack

```bash
pnpm --filter @abyss/e2e browsers:install   # once: Chromium into node_modules
SMOKE_E2E=1 pnpm smoke
```

`scripts/smoke.sh` builds the production images, runs `db:migrate` and
`owner:bootstrap`, then runs `pnpm --filter @abyss/e2e test` with the `E2E_*`
values below. It sets them from the stack, including the generated owner
password and the Mailpit URL (`mail.<SMOKE_DOMAIN>`, the SMTP sink the stack
sends OTP emails to). Then it tears the stack down.

The 2FA spec uses its own account (`e2e-2fa@<SMOKE_DOMAIN>`, seeded by
`scripts/smoke.sh` as an active admin with a generated password), because
the owner already spends 4 of the 5 logins per email per 15 minutes (smoke +
owner specs). It reads the setup key from the dialog and computes codes with
`otplib`; since cms-api rejects a reused time step, it waits for the next
30 s step between codes, so it runs for up to about a minute.

Specs run in one worker: `password-reset.spec.ts` changes the owner password
(and puts it back at the end), so it must not overlap other specs. Codes are
read from Mailpit's API through a browser tab (Chromium resolves
`*.localhost` itself).

## Run against another stack

Set the keys from [`.env.example`](.env.example) in the shell, then
`pnpm --filter @abyss/e2e test` (or `pnpm e2e` at the root).
`src/env.ts` is the only reader of `process.env`.

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

| Spec                           | Flow                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/admin-auth.spec.ts`     | Owner signs in; cookie attributes; no token in JS storage; reload keeps the session (silent refresh); sign out; reload shows login                                                       |
| `tests/admin-tabs.spec.ts`     | Two tabs in one context reload at once (racing silent refreshes, T11a): both stay signed in, every refresh is 200, later refreshes still work                                            |
| `tests/password-reset.spec.ts` | Owner resets the password with an emailed code (Mailpit), signs in with it, then puts the old password back                                                                              |
| `tests/two-factor.spec.ts`     | 2FA account: TOTP setup from the manual key, login through the challenge dialog, TOTP off, email codes on (warning shown), login with the emailed code, change password ends the session |
