# Access administration: rules

Part of the [project spec](../../../SPEC.md). Flow `access-admin`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Manage an account, assign a role or edit a role's permissions only when target rank < actor rank; no "created by me" exception; system roles' slug and rank never change; only one account holds `owner` (D6).
2. API token permissions = token scope ∩ the creator's current permissions, per request; create, update and revoke only from a JWT session; the subset check runs on create and update; admins manage only their own tokens (D5).
3. Store API tokens as SHA-256, show the raw value once; an expired token is revoked and cannot be updated (`409`) (D5).
4. Validate permission conditions against the whitelisted DSL (`eq`, `ne`, `in`; `$actor.id`, `$actor.roleRank`) when the permission is saved ([data-model.md](../../global/data-model.md) §8.3).
5. A role or permission change takes effect on the next request (D9 `pv`, criterion 11).
6. Audit role, permission, account and token changes (D15).
7. Custom role ranks stay within 11–39 ([canonical-values.md](../../global/canonical-values.md)).
8. Put policy checks in `access`, never inline `role === 'x'` ([code-style.md](../../global/code-style.md)).

## Must never

1. Add self-registration (Q2, criterion 2).
2. Trust client-supplied permissions ([boundaries](../../global/boundaries.md)).

## Global decisions this flow follows

D3, D5, D6, D9, D15.
