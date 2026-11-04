---
flow: two-factor-setup
summary: Turning on and removing TOTP or email-code two-factor for the signed-in account
---

# Two-factor setup: spec

Part of the [project spec](../../../SPEC.md). Flow `two-factor-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

A signed-in account turns on two-factor with an authenticator app (TOTP) or with email codes, and can remove it, on `/settings/security`. TOTP setup returns a secret to scan (`POST /auth/2fa/totp/setup`); turning on needs the current password plus a valid first code (`POST /auth/2fa/enable`); removing needs the password and a code (`POST /auth/2fa/disable`). Email-code 2FA is allowed with a warning, and TOTP is recommended (Q3). The owner's break-glass reset is the `owner:reset-2fa` CLI of the identity module.

Endpoints: [api-contract.md](../../global/api-contract.md) row "2FA setup". The 2FA step at sign-in is part of [sign-in](../sign-in/SPEC.md).

## Requirements

The requirements of this flow are global decisions: D8 (password plus first code to turn on, TOTP replay protection, encrypted secret, `LOGIN_2FA_EMAIL` purpose) and D15 (2FA changes audited). New requirements of this flow go here with ids `TF-<n>`.

## Acceptance

No global success criterion is owned by this flow; the 2FA login step is covered by [sign-in](../sign-in/SPEC.md).

## Decisions

| # | Question | Recommendation |
|---|---|---|
| Q3 | Allow email-OTP 2FA, or TOTP only? Email-as-2FA means email compromise = account takeover. | Allow it, show a warning, recommend TOTP |

## Out of scope

A trusted device that skips 2FA ([sign-in](../sign-in/SPEC.md) out of scope).

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D8, §9 "2FA setup", Q3).
