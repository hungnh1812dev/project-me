# Summary - shared-human-check

## Overview
One Turnstile human check for every public form. A form-commons kit loads Turnstile once per page and gives each form a token. cms-api verifies the token on the six public auth routes and holds the only secret. cms-admin (login, 2FA, owner setup, forgotten password) and the web sign-in dialog send the token; web no longer holds a Turnstile secret, its hostname or `NEXT_PUBLIC_ADMIN_URL`, and has no link to cms-admin. `module-auth.openCms` is dropped with a destructive migration (approved).

## Sub-features
- Turnstile kit `@abyss/form-commons/human-check`: `configureTurnstile`, `useTurnstile`, `TurnstileSlot`, `resetTurnstile`.
- cms-api `human-check` module: verifier, guard, production config guards; the six public auth routes require the token.
- Stacks, seeds, build args and deploy docs send and configure the human check.
- cms-admin: Turnstile site key required; login, 2FA, owner setup and forgotten password send the token.
- web: sign-in on the kit, BFF forwards the token, no cms-admin references.
- Drop `module-auth.openCms` (migration 0019).

## Structure
- `packages/form-commons`: `src/human-check` (kit), dist entry.
- `apps/cms-api`: `human-check` module, auth routes, content migration 0019, config.
- `apps/cms-admin`: Turnstile wiring, CSP, login, setup and reset screens.
- `apps/web`: sign-in dialog, BFF routes, env, turbo build env.
- `apps/e2e`: specs send the human check token; web Open CMS link checks dropped.
- `docs/`: ADR 0027 (local, git-ignored), deploy docs, env reference, patch notes, module docs.
- `scripts/`, `docker-compose.smoke.yml`, `.github/`: stacks, seeds, smoke, CI build args.

## Commits
Range 14a1b7ec..e79e2a6e (head e79e2a6e).

## Major issues
None.
