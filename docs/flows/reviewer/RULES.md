# Reviewer: rules

Part of the [project spec](../../../SPEC.md). Flow `reviewer`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Reviewers are read-only: published content only, through the `reviewer` role's field profile; drafts → 403, writes → 403 (D2, criterion 3).
2. A field with `sensitive: true` is not covered by a wildcard `*` grant of `public`, `guest` or `reviewer` (D2).
3. While `REVIEWER_FEATURE_ENABLED` is not `true`, every reviewer route answers `404 REVIEWER_FEATURE_OFF` before any Turnstile call or DB read, and reviewer tokens get 401 (D2a, criterion 20).
4. Keep the reviewer session limits: 24 h, 1 session per IP per 10 min, at most 200 active ([canonical-values.md](../../global/reference/canonical-values.md)).
5. Audit the reviewer toggle (D15).

## Must never

1. Store reviewer data in content tables (D2).
2. Build a reviewer write sandbox in v1 (D2, [out of scope](../../../SPEC.md)).

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads (D3).
- [apps/web/RULES.md](../../apps/web/RULES.md): no reviewer mode on web (D21).
