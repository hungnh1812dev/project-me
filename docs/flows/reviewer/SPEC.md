---
flow: reviewer
summary: Self-service read-only reviewer sessions, the owner toggle and deploy switch, the reviewer session log
---

# Reviewer: spec

Part of the [project spec](../../../SPEC.md). Flow `reviewer`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

When the deploy switch `REVIEWER_FEATURE_ENABLED` and the owner's toggle are both on, a visitor (for example a recruiter) can start a 24-hour read-only reviewer session after a human check, and read published content through the `reviewer` role's field profile. The owner sees the reviewer session log in cms-admin (`/reviewer`). While the switch is off every reviewer route answers `404 REVIEWER_FEATURE_OFF`. Reviewer mode is removed from apps/web by D21. The full decisions are D2 and D2a in [RULE.md](RULE.md).

Endpoints: [api-contract.md](../../global/api-contract.md) row "Reviewer". Values (reviewer session): [canonical-values.md](../../global/canonical-values.md).

## Requirements

D2, D2a ([RULE.md](RULE.md)). New requirements of this flow go here with ids `RV-<n>`.

## Acceptance

Global success criteria of this flow ([success-criteria.md](../../global/success-criteria.md)): 3, 20.

## Decisions

| # | Question | Recommendation |
|---|---|---|
| Q6 | Should reviewers see anything beyond published content in v1 (e.g. read-only admin UI tour)? | Read-only admin UI with masked data, no drafts |

## Out of scope

Reviewer write sandbox (v2, separate PG schema, D2).

## Open questions

None.

## Change log

- 2026-10-27 Masking mechanism for sensitive fields (D2, ADR 0011).
- 2026-10-28 Reviewer feature switch (D2a, ADR 0014).
- 2026-10-31 Reviewer mode removed from apps/web (D21, ADR 0017).
- 2026-11-04 Flow folder created from the old SPEC.
