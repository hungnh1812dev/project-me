# Security audit: rules

Part of the [project spec](../../../SPEC.md). Flow `security-audit`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Write every event of the D15 list in the same transaction as the change; always on, even when activity tracking is `none` (D15, criterion 18).
2. Store field names only in metadata, never values (D15).
3. `security-audit` imports from `access` core with `import type` only ([architecture.md](../../global/architecture.md)).

## Must never

1. Store tokens, passwords, codes, setup tokens or presigned URLs in a row (D15, D20, [boundaries](../../global/boundaries.md)).

## Ask first

- Adding, removing or renaming an audit action (a change to D15).

## Global decisions this flow follows

D15.
