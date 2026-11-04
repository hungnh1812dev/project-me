---
flow: owner-setup
replaces: D1, §14 Q-OS1..Q-OS4
summary: One-time creation of the single owner: setup page with the setup token, or the owner:bootstrap CLI; smoke seed CLI
---

# Owner setup: spec

Part of the [project spec](../../../SPEC.md). Flow `owner-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

## Behaviour

The owner (rank 100) is created exactly once: by the one-time setup page of cms-admin with the setup token while no owner exists, or by the `owner:bootstrap` CLI. The setup route closes once an owner exists. Test stacks create other accounts with the `seed:account` CLI. The full decision is D1 in Decisions below; the design is [docs/modules/owner-setup.md](../../modules/owner-setup.md) and ADR 0005.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) row "Owner setup (D1)".

## Requirements

D1 (Decisions below) and the D17 bullets on `OWNER_SETUP_TOKEN` and `ALLOW_ACCOUNT_SEED`. New requirements of this flow go here with ids `OS-<n>`.

## Acceptance

Global success criterion of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 1.

## Decisions

**D1 Owner bootstrap (C1).** No "first verified user becomes owner". The owner is created exactly once, by two paths sharing `bootstrapOwner`: one transaction with `pg_advisory_xact_lock`; refuses if an owner exists or the email is taken; never promotes an existing account. A partial unique index `ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL` enforces one owner. No self-registration endpoints in v1. Amended 2026-10-22 (user decision, ADR 0005, design `docs/modules/owner-setup.md`):

- **Setup route (primary on Kubernetes):** `POST /setup/owner` `{ setupToken, email, displayName?, password }`, open only while `OWNER_SETUP_TOKEN` is configured **and** no live owner exists, else `404`. Token checked first (SHA-256 digests, `timingSafeEqual`), before body validation or password hashing; wrong → `401 SETUP_TOKEN_INVALID`. Success → `201 { email }`, no session (sign in via `/auth/login`). Throttled per IP. The admin console shows the setup page only while `GET /setup/status` says `open`, and never takes the token from the URL.
- **CLI (fallback):** `owner:bootstrap`: `OWNER_EMAIL` + interactive password (or `--password-stdin`); works with or without a setup token.
- **Closing:** the route closes once an owner exists; the operator then removes `OWNER_SETUP_TOKEN` from the Secret. While the token is set and an owner exists, cms-api logs a warning (no value).
- **Smoke seed CLI (test stacks only; amended 2026-10-23, user decision, audit AUD-AU5-03):** `seed:account`, an identity CLI (not an HTTP route), creates active smoke / e2e test accounts. Role allowlist `admin`, `guest`; `owner`, `reviewer` and custom roles always refused. Refuses a taken email; never updates or promotes an account. Password from stdin only. Under `NODE_ENV=production` it refuses unless `ALLOW_ACCOUNT_SEED=smoke` is passed on that one invocation (never in deployed config, D17). Each created account writes `account.seeded` (D15).

| # | Question | Recommendation |
|---|---|---|
| Q-OS1 | After a successful setup, sign the owner in at once or send them to the login page? | Login page with the email prefilled and a "turn on two-factor" notice: one path issues sessions (throttles, login audit); costs one extra step |
| Q-OS2 | Should `GET /setup/status` need no token? It tells anyone a fresh instance awaits setup. | Yes, no token: the console must know whether to show the page; the window is short and the submit still needs the token |
| Q-OS3 | Persist a "setup completed" marker so setup never reopens, even if the owner row is deleted in SQL with a token still configured? | No marker (no schema change); rely on the owner row, the boot warning and removing the token after setup |
| Q-OS4 | How does the smoke stack create its owner? | Through the setup route (curl, test token in `scripts/stack/cms-api.env`), then assert `owner:bootstrap` refuses; the CLI's create path stays covered by integration tests |

## Out of scope

Self-registration and promoting an existing account (D1).

## Open questions

None.

## Change log

- 2026-10-22 One-time owner setup route (D1, ADR 0005, Q-OS1..Q-OS4).
- 2026-10-23 Smoke seed CLI (D1).
- 2026-11-04 Flow folder created from the old SPEC.
