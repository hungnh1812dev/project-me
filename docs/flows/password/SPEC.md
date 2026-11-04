---
flow: password
summary: Invitation acceptance (set password), forgot and reset password, signed-in password change
---

# Password: spec

Part of the [project spec](../../../SPEC.md). Flow `password`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

- **Set password (invitation):** an invited account receives a one-time code by email and sets its first password (`POST /auth/password/set`, OTP purpose `INVITE_SET_PASSWORD`).
- **Forgot and reset:** `POST /auth/password/request-otp` always answers 202, also for unknown emails; `POST /auth/password/reset` takes the code (purpose `RESET_PASSWORD`) and the new password, plus a TOTP code when TOTP is on (D8).
- **Change (signed in):** `POST /auth/password/change` on `/settings/password`; it ends every session after success ([change-password module doc](../../modules/cms-admin/change-password.md)).
- A change or reset bumps `token_version`, so old access tokens fail on the next request (D9).

Endpoints: [api-contract.md](../../global/api-contract.md) row "Password". Values (OTP): [canonical-values.md](../../global/canonical-values.md).

## Requirements

The requirements of this flow are global decisions: D8 (Argon2id, minimum 12 characters, OTP storage and purposes, no enumeration, TOTP on reset), D9 (`token_version` bump) and D15 (password changes audited). New requirements of this flow go here with ids `PW-<n>`.

## Acceptance

Global success criteria of this flow ([success-criteria.md](../../global/success-criteria.md)): 9 (OTP attempts, issue limit, no enumeration), 10 (old access tokens fail after a reset).

## Decisions

None owned by this flow yet.

## Out of scope

Public self-registration (Q2, [access-admin](../access-admin/SPEC.md)).

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D8, D9, §9 "Password").
