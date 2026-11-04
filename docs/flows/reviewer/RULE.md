# Reviewer: rules

Part of the [project spec](../../../SPEC.md). Flow `reviewer`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Reviewers are read-only: published content only, through the `reviewer` role's field profile; drafts → 403, writes → 403 (D2, criterion 3).
2. A field with `sensitive: true` is not covered by a wildcard `*` grant of `public`, `guest` or `reviewer` (D2).
3. While `REVIEWER_FEATURE_ENABLED` is not `true`, every reviewer route answers `404 REVIEWER_FEATURE_OFF` before any Turnstile call or DB read, and reviewer tokens get 401 (D2a, criterion 20).
4. Keep the reviewer session limits: 24 h, 1 session per IP per 10 min, at most 200 active ([canonical-values.md](../../global/canonical-values.md)).
5. Audit the reviewer toggle (D15).

## Must never

1. Store reviewer data in content tables (D2).
2. Add a reviewer entry to apps/web (D21).
3. Build a reviewer write sandbox in v1 (D2, [out of scope](../../../SPEC.md)).

## Global decisions this flow follows

D3, D7, D15, D21.

## Decisions owned by this flow

**D2 Reviewer isolation (C2, C3).** Reviewers are **read-only**: published content only, through the `reviewer` role's field profile, which the Owner edits like any role and which starts with every sensitive field masked. Mechanism (amended 2026-10-27, user, ADR 0011 Q-RV7; `guest` added 2026-10-27, user decision): a field with `sensitive: true` in its definition is not covered by a wildcard `*` content grant of `public`, `guest` or `reviewer`, so it stays masked for anonymous visitors, signed-in guests and reviewers until the Owner adds a type-specific row granting it. Never drafts. No reviewer data in content tables (no `reviewerSessionId` column). Reviewer write sandboxes are v2 and must use a separate PG schema.

**D2a Reviewer feature switch (added 2026-10-28, user request, ADR 0014).** All reviewer features are off until the user turns them back on. cms-api reads `REVIEWER_FEATURE_ENABLED` at start (runtime env, default `false`, only `true` enables). While off: `GET /reviewer/status`, `POST /reviewer/sessions`, `GET /reviewer/sessions`, `PUT /reviewer/settings` answer `404 REVIEWER_FEATURE_OFF` before any Turnstile call or DB read; `AccessSessionService` answers 401 for any reviewer-role account (no reviewer token works on REST, GraphQL or cms-admin); the reviewer cleanup job does not start. The web `/status` page answers 404 unless `WEB_STATUS_PAGE_ENABLED=true` (runtime env, default `false`). Reviewer access is open only when the switch is on, the owner toggle `reviewer.enabled` is on, and Turnstile plus `OTP_PEPPER` are configured; the toggle keeps its value while the switch is off. Off: owner turns the toggle off first (revokes live sessions), then keys set to `false` and pods restart; on is the reverse (`docs/deployment/devops-runbook.md`). Dev, demo and smoke stacks set both keys to `true` (Q-RVOFF1). _Amended 2026-10-31 (user Q7, ADR 0017, D21):_ reviewer mode is removed from apps/web (no "Reviewer access" entry, no reviewer session in the web session); `/status` and `WEB_STATUS_PAGE_ENABLED` are removed (health card moves to the homepage, pending Q-BFF2); the switch now covers cms-api and cms-admin only, the scope feature reviewer-toggle (paused) keeps.
