# Two-factor setup: rules

Part of the [project spec](../../../SPEC.md). Flow `two-factor-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Turning on 2FA needs the current password plus a valid first code; removing it needs the password and a code (D8, [api-contract.md](../../global/reference/api-contract.md)).
2. Email codes use the OTP purpose `LOGIN_2FA_EMAIL` (D8).
3. Every 2FA change writes an audit row (D15).
4. Email-code 2FA shows a warning, and the page recommends TOTP (Q3).

## Must never

1. Return the TOTP secret anywhere but the setup answer.

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): credentials and one-time codes (D8: TOTP replay, secret encryption).
- [security-audit](../security-audit/RULES.md): audit rows (D15).
