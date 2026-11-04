# Content editing: rules

Part of the [project spec](../../../SPEC.md). Flow `content-editing`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Apply field-level reads when the query is built: no `read` → 403; unreadable columns never selected; filter, sort or search on them → `400 FIELD_NOT_READABLE` (D3).
2. Route every payload carrying record data (list, detail, 409 conflict, bulk conflicts, audit metadata view, error details) through the one serializer (D3, [boundaries](../../global/boundaries.md)).
3. Take writable fields from policy per request; drop a resent mask silently; any other non-writable or unknown key → 400; ignore client-sent `_maskedFields` (D4).
4. Check `version` on save and `expectedVersion` on publish; at most one draft and one published row per `document_id` (D11).
5. Sanitize richtext on the server when written (D13).
6. Keep the bulk limits: 50 records per request, 200 component rows per record, 1 MB body; bulk only on collections ([canonical-values.md](../../global/canonical-values.md)).
7. Services take an explicit `ActorContext` ([code-style.md](../../global/code-style.md)).

## Must never

1. Build SQL with interpolated identifiers or slugs; parameterized SQL only ([boundaries](../../global/boundaries.md)).
2. Put a raw value of an unreadable field in any answer, the 409 body included (D3, criterion 4).

## Global decisions this flow follows

D3, D4, D5, D9, D13, D15.

## Decisions owned by this flow

**D11 Draft/publish integrity.** Partial unique indexes allow at most one draft and one published row per `document_id`. Publish takes the draft's `expectedVersion`. Components carry a stable `component_uid` (UUID) for diff/merge matching.

**D16 Presence.** Needs `update` on the document. Returns only `{ accountId, displayName, state, lastSeenAt }`. In-memory store (single replica, documented).
