# Access administration: rules

Part of the [project spec](../../../SPEC.md). Flow `access-admin`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Manage an account, assign a role or edit a role's permissions only when target rank < actor rank; no "created by me" exception; system roles' slug and rank never change; only one account holds `owner` (D6, criterion 7).
2. Validate permission conditions against the whitelisted DSL (`eq`, `ne`, `in`; `$actor.id`, `$actor.roleRank`) when the permission is saved ([data-model.md](../../global/reference/data-model.md) §8.3).
3. A role or permission change takes effect on the next request (D9 `pv`, criterion 11).
4. Audit role, permission, account and token changes (D15).
5. Custom role ranks stay within 11–39 ([canonical-values.md](../../global/reference/canonical-values.md)).

## Must never

1. Add self-registration (Q2, criterion 2).

## Also follows

- [global/RULES.md](../../global/RULES.md): boundaries (never trust client-supplied permissions).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads and writes (D3, D4), API tokens (D5), sessions (D9), code style (policy checks live in `access`).
- [security-audit](../security-audit/RULES.md): audit rows (D15).
