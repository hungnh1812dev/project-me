# Password: rules

Part of the [project spec](../../../SPEC.md). Flow `password`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. One-time codes of this flow use the purposes `INVITE_SET_PASSWORD` and `RESET_PASSWORD` (D8).
2. `POST /auth/password/request-otp` always answers 202 ([api-contract.md](../../global/reference/api-contract.md)).
3. A reset also needs a TOTP code when TOTP is on (D8).
4. A signed-in password change ends every session after success ([change-password module doc](../../modules/cms-admin/change-password.md)).
5. Every password change writes an audit row (D15).

## Must never

1. Add a self-registration route (Q2, criterion 2).

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): credentials and one-time codes (D8), sessions and revocation (D9).
- [security-audit](../security-audit/RULES.md): audit rows (D15).
