# Password: rules

Part of the [project spec](../../../SPEC.md). Flow `password`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Hash passwords with Argon2id; minimum 12 characters (D8).
2. Store one-time codes as HMAC-SHA256 with `OTP_PEPPER`, bound to `(account, purpose)`; purposes `INVITE_SET_PASSWORD` and `RESET_PASSWORD` here (D8).
3. Keep the OTP limits of [canonical-values.md](../../global/canonical-values.md): 6 digits, TTL 300 s, 5 attempts per code, at most 5 issued per account per hour, single use (criterion 9).
4. Answer unknown emails exactly like known ones; `request-otp` always 202 (D8, [api-contract.md](../../global/api-contract.md)).
5. Ask for a TOTP code on reset when TOTP is on (D8).
6. Bump `token_version` on every password change or reset, so old access tokens fail on the next request (D9, criterion 10).
7. Audit every password change (D15).

## Must never

1. Log OTPs, tokens or passwords ([boundaries](../../global/boundaries.md)).
2. Add a self-registration route (Q2, criterion 2).

## Global decisions this flow follows

D7 (rate limits by IP and account/email), D8, D9, D15.
