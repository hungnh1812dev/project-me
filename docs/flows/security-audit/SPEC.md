---
flow: security-audit
summary: The always-on security audit log: which events are written, how, and who reads it
---

# Security audit: spec

Part of the [project spec](../../../SPEC.md). Flow `security-audit`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

Every security event (logins, 2FA, passwords, roles, permissions, accounts, tokens, reviewer toggle, media delete, owner setup, seed accounts, re-authentication and backup links) writes an `audit_logs` row in the same transaction as the change. The owner reads the log with `GET /audit-logs`. Activity tracking of content edits is separate and pluggable (`none | database`). The decision is D15 in [security.md](../../global/security.md); the table is `audit_logs` in [data-model.md](../../global/data-model.md).

## Requirements

D15. A new security event is added to the D15 list (an ask-first change) and to this flow's `RULE.md`. New requirements of this flow go here with ids `SA-<n>`.

## Acceptance

Global success criterion of this flow ([success-criteria.md](../../global/success-criteria.md)): 18.

## Decisions

None owned by this flow yet.

## Out of scope

None recorded.

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D15).
