---
flow: content-editing
replaces: D11, D16
summary: List, create and edit documents with version conflicts and merge, publish and unpublish, bulk actions, presence
---

# Content editing: spec

Part of the [project spec](../../../SPEC.md). Flow `content-editing`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

## Behaviour

Editors list a collection (filter, sort, page), create and edit documents in the dynamic form, save drafts with a version check (a stale version gets `409` with a masked diff and the merge dialog), publish and unpublish, run bulk actions on collections, and see who else is editing (presence). Every read and write goes through the field-level rules (D3, D4). Single types open their one document directly.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) rows "Documents", "Bulk", "Presence". Values (bulk limits, presence timing): [canonical-values.md](../../global/reference/canonical-values.md).

## Requirements

D3, D4, D11, D13, D16 and the document rows of the API contract. New requirements of this flow go here with ids `CE-<n>`.

## Acceptance

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 4, 5, 12, 14.

## Decisions

**D11 Draft/publish integrity.** Partial unique indexes allow at most one draft and one published row per `document_id`. Publish takes the draft's `expectedVersion`. Components carry a stable `component_uid` (UUID) for diff/merge matching.

**D16 Presence.** Needs `update` on the document. Returns only `{ accountId, displayName, state, lastSeenAt }`. In-memory store (single replica, documented).

Q10 (offset pagination) is global: [DECISIONS.md](../../global/DECISIONS.md).

## Out of scope

Reviewer write sandbox ([out of scope](../../../SPEC.md)).

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D11, D16, §9 documents).
