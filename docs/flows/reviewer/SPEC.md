---
flow: reviewer
replaces: D2, D2a, §14 Q6
summary: Self-service read-only reviewer sessions, the owner toggle and deploy switch, the reviewer session log
---

# Reviewer: spec

Part of the [project spec](../../../SPEC.md). Flow `reviewer`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

When the deploy switch `REVIEWER_FEATURE_ENABLED` and the owner's toggle are both on, a visitor (for example a recruiter) can start a 24-hour read-only reviewer session after a human check, and read published content through the `reviewer` role's field profile. The owner sees the reviewer session log in cms-admin (`/reviewer`). While the switch is off every reviewer route answers `404 REVIEWER_FEATURE_OFF`. Reviewer mode is removed from apps/web by D21. The full decisions are D2 and D2a in Decisions below.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) row "Reviewer". Values (reviewer session): [canonical-values.md](../../global/reference/canonical-values.md).

## Requirements

D2, D2a (Decisions below). New requirements of this flow go here with ids `RV-<n>`.

## Acceptance

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 3, 20.

## Decisions

**D2 Reviewer isolation (C2, C3).** Reviewers are **read-only**: published content only, through the `reviewer` role's field profile, which the Owner edits like any role and which starts with every sensitive field masked. Mechanism (amended 2026-10-27, user, ADR 0011 Q-RV7; `guest` added 2026-10-27, user decision): a field with `sensitive: true` in its definition is not covered by a wildcard `*` content grant of `public`, `guest` or `reviewer`, so it stays masked for anonymous visitors, signed-in guests and reviewers until the Owner adds a type-specific row granting it. Never drafts. No reviewer data in content tables (no `reviewerSessionId` column). Reviewer write sandboxes are v2 and must use a separate PG schema.

**D2a Reviewer feature switch (added 2026-10-28, user request, ADR 0014).** All reviewer features are off until the user turns them back on. cms-api reads `REVIEWER_FEATURE_ENABLED` at start (runtime env, default `false`, only `true` enables). While off: `GET /reviewer/status`, `POST /reviewer/sessions`, `GET /reviewer/sessions`, `PUT /reviewer/settings` answer `404 REVIEWER_FEATURE_OFF` before any Turnstile call or DB read; `AccessSessionService` answers 401 for any reviewer-role account (no reviewer token works on REST, GraphQL or cms-admin); the reviewer cleanup job does not start. The web `/status` page answers 404 unless `WEB_STATUS_PAGE_ENABLED=true` (runtime env, default `false`). Reviewer access is open only when the switch is on, the owner toggle `reviewer.enabled` is on, and Turnstile plus `OTP_PEPPER` are configured; the toggle keeps its value while the switch is off. Off: owner turns the toggle off first (revokes live sessions), then keys set to `false` and pods restart; on is the reverse (`docs/deployments/devops-runbook.md`). Dev, demo and smoke stacks set both keys to `true` (Q-RVOFF1). *Amended 2026-10-31 (user Q7, ADR 0017, D21):* reviewer mode is removed from apps/web (no "Reviewer access" entry, no reviewer session in the web session); `/status` and `WEB_STATUS_PAGE_ENABLED` are removed (health card moves to the homepage, pending Q-BFF2); the switch now covers cms-api and cms-admin only, the scope feature reviewer-toggle (paused) keeps.

| # | Question | Recommendation |
|---|---|---|
| Q6 | Should reviewers see anything beyond published content in v1 (e.g. read-only admin UI tour)? | Read-only admin UI with masked data, no drafts |

## Out of scope

Reviewer write sandbox (v2, separate PG schema, D2).

## Open questions

None.
