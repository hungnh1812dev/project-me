---
flow: security-audit
replaces: D15
summary: The always-on security audit log: which events are written, how, and who reads it
---

# Security audit: spec

Part of the [project spec](../../../SPEC.md). Flow `security-audit`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

## Behaviour

Every security event (logins, 2FA, passwords, roles, permissions, accounts, tokens, reviewer toggle, media delete, owner setup, seed accounts, re-authentication and backup links) writes an `audit_logs` row in the same transaction as the change. The owner reads the log with `GET /audit-logs`. Activity tracking of content edits is separate and pluggable (`none | database`). The decision is D15 (Decisions below); the table is `audit_logs` in [data-model.md](../../global/reference/data-model.md).

## Requirements

D15. A new security event is added to the D15 list (an ask-first change) and to this flow's `RULES.md`. New requirements of this flow go here with ids `SA-<n>`.

## Acceptance

Global success criterion of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 18.

## Decisions

**D15 Audit.** `SecurityAuditService` is always on and writes in the same transaction for: login success and failure, 2FA changes, password changes, role, permission and account changes, token create and revoke, reviewer toggle, media delete, owner creation (`owner.created`, channel `setup_page` or `cli`), rejected owner-setup attempts (`owner.setup_rejected`, no token, password or email stored), smoke-seed accounts (`account.seeded`, channel `cli_seed`, metadata = role slug and channel only; D1). Activity tracking (content edits) stays pluggable (`none | database`). Audit metadata stores field names only, never values.


## Out of scope

None recorded.

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D15).
