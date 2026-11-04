# Owner setup: rules

Part of the [project spec](../../../SPEC.md). Flow `owner-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Create the owner only through `bootstrapOwner` (route or CLI): one transaction with `pg_advisory_xact_lock`, refused when an owner exists or the email is taken (D1).
2. Check the setup token before body validation or password hashing (D1).
3. Answer 404 while the route is closed (no token configured, or an owner exists) (D1).
4. Issue no session on success (D1, Q-OS1).
5. Audit `owner.created` and `owner.setup_rejected`; never store the token, password or email of a rejected attempt (D15).
6. `OWNER_SETUP_TOKEN` is at least 32 bytes in production; `ALLOW_ACCOUNT_SEED` is never an app setting (D17).

## Must never

1. Promote an existing account to owner, or allow a second live owner (D1, D6).
2. Take the setup token from the URL (D1).
3. Let `seed:account` create `owner`, `reviewer` or custom-role accounts (D1).

## Global decisions this flow follows

D6, D8 (password rules), D15, D17.

## Decisions owned by this flow

**D1 Owner bootstrap (C1).** No "first verified user becomes owner". The owner is created exactly once, by two paths sharing `bootstrapOwner`: one transaction with `pg_advisory_xact_lock`; refuses if an owner exists or the email is taken; never promotes an existing account. A partial unique index `ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL` enforces one owner. No self-registration endpoints in v1. Amended 2026-10-22 (user decision, ADR 0005, design `docs/modules/owner-setup.md`):

- **Setup route (primary on k3s):** `POST /setup/owner` `{ setupToken, email, displayName?, password }`, open only while `OWNER_SETUP_TOKEN` is configured **and** no live owner exists, else `404`. Token checked first (SHA-256 digests, `timingSafeEqual`), before body validation or password hashing; wrong → `401 SETUP_TOKEN_INVALID`. Success → `201 { email }`, no session (sign in via `/auth/login`). Throttled per IP. The admin console shows the setup page only while `GET /setup/status` says `open`, and never takes the token from the URL.
- **CLI (fallback):** `owner:bootstrap`: `OWNER_EMAIL` + interactive password (or `--password-stdin`); works with or without a setup token.
- **Closing:** the route closes once an owner exists; the operator then removes `OWNER_SETUP_TOKEN` from the Secret. While the token is set and an owner exists, cms-api logs a warning (no value).
- **Smoke seed CLI (test stacks only; amended 2026-10-23, user decision, audit AUD-AU5-03):** `seed:account`, an identity CLI (not an HTTP route), creates active smoke / e2e test accounts. Role allowlist `admin`, `guest`; `owner`, `reviewer` and custom roles always refused. Refuses a taken email; never updates or promotes an account. Password from stdin only. Under `NODE_ENV=production` it refuses unless `ALLOW_ACCOUNT_SEED=smoke` is passed on that one invocation (never in deployed config, D17). Each created account writes `account.seeded` (D15).
