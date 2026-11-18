# Owner setup: rules

Part of the [project spec](../../../SPEC.md). Flow `owner-setup`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

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

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7), production config (D17).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): credentials (D8).
- [access-admin](../access-admin/RULES.md): role hierarchy (D6).
- [security-audit](../security-audit/RULES.md): audit rows (D15).
