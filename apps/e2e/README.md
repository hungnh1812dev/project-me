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
password. Then it tears the stack down.

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

| Spec                       | Flow                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tests/admin-auth.spec.ts` | Owner signs in; cookie attributes; no token in JS storage; reload keeps the session (silent refresh); sign out; reload shows login |
