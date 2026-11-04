---
flow: owner-setup
summary: One-time creation of the single owner: setup page with the setup token, or the owner:bootstrap CLI; smoke seed CLI
---

# Owner setup: spec

Part of the [project spec](../../../SPEC.md). Flow `owner-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

The owner (rank 100) is created exactly once: by the one-time setup page of cms-admin with the setup token while no owner exists, or by the `owner:bootstrap` CLI. The setup route closes once an owner exists. Test stacks create other accounts with the `seed:account` CLI. The full decision is D1 in [RULE.md](RULE.md); the design is [docs/modules/owner-setup.md](../../modules/owner-setup.md) and ADR 0005.

Endpoints: [api-contract.md](../../global/api-contract.md) row "Owner setup (D1)".

## Requirements

D1 ([RULE.md](RULE.md)) and the D17 bullets on `OWNER_SETUP_TOKEN` and `ALLOW_ACCOUNT_SEED`. New requirements of this flow go here with ids `OS-<n>`.

## Acceptance

Global success criterion of this flow ([success-criteria.md](../../global/success-criteria.md)): 1.

## Decisions

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
