---
flow: content-editing
replaces: D11, D16
summary: List, create and edit documents with version conflicts and merge, publish and unpublish, bulk actions, presence
---

# Content editing: spec

Part of the [project spec](../../../SPEC.md). Flow `content-editing`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

Editors list a collection (filter, sort, page), create and edit documents in the dynamic form, save drafts with a version check (a stale version gets `409` with a masked diff and the merge dialog), publish and unpublish, run bulk actions on collections, and see who else is editing (presence). Every read and write goes through the field-level rules (D3, D4). Single types open their one document directly.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) rows "Documents", "Bulk", "Presence". Values (bulk limits, presence timing): [canonical-values.md](../../global/reference/canonical-values.md).

## Requirements

D3, D4, D11, D13, D16 and the document rows of the API contract. New requirements of this flow go here with ids `CE-<n>`.

### Field labels, inputs and widths in the form (feature `cv-page-schema`, ADR 0019, user 2026-11-05)

The schema side is CM-1..CM-10 in [content-modeling](../content-modeling/SPEC.md).

- **CE-1 Labels.** A field's label in the cms-admin form (fields and component groups) is its `displayName` when the schema sets one, else made from its `name`: split before each capital letter, capitalise each word, join with one space (`skills` -> `Skills`, `techStack` -> `Tech Stack`, `isMain` -> `Is Main`). One function makes every label. Field keys in the form values stay the API `name`.
- **CE-2 Inputs.** A `text` field is a single-line input; a `string` field is a multi-line text area (CM-1).
- **CE-3 Widths.** Each field level of the form is a 6-column grid: `width` `1/3` spans 2 columns, `1/2` spans 3, `full` spans 6, and fields wrap to the next row on their own. The form uses the resolved `width` from `GET /content-types` and applies no default of its own. Below the `sm` breakpoint every field takes the full row. A component group always takes the full row.

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
