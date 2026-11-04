# Two-factor setup: rules

Part of the [project spec](../../../SPEC.md). Flow `two-factor-setup`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Turning on 2FA needs the current password plus a valid first code; removing needs password and code (D8, [api-contract.md](../../global/api-contract.md)).
2. TOTP remembers the last used time step: no replay (D8).
3. The TOTP secret is encrypted with AES-256-GCM using `TOTP_ENC_KEY` and a key id for rotation (D8).
4. Email codes use OTP purpose `LOGIN_2FA_EMAIL` and the OTP limits of [canonical-values.md](../../global/canonical-values.md) (D8).
5. Every 2FA change writes an audit row (D15).
6. Email-code 2FA shows a warning and the page recommends TOTP (Q3).

## Must never

1. Store or return a TOTP secret unencrypted outside the setup answer, or log a code ([boundaries](../../global/boundaries.md)).

## Global decisions this flow follows

D8, D9, D15.
