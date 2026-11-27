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
- **CE-2 Inputs.** A `text` field is a single-line input; a `string` field is a multi-line text area (CM-1). `integer`, `biginteger`, `decimal`, `float` and `double` fields are number inputs, an `integer` with `unsigned` takes no value below 0, and a `biginteger` value goes to the API as a digit string, never through a JS number; a `time` field is a time picker (`HH:MM`); an `enumeration` field is a select of its `options` in their order, plus an empty choice when the field is not required; a stored value no longer in `options` is shown as it is, marked as not allowed, until another is picked ([content-schema.md](../../modules/content-schema.md) "Type-specific keys"; Q-SBF4, Q-SBF9 in [schema-builder](../schema-builder/SPEC.md)). A `json` field is the code text area of CE-4.
- **CE-3 Widths.** Each field level of the form is a 6-column grid: `width` `1/3` spans 2 columns, `1/2` spans 3, `full` spans 6, and fields wrap to the next row on their own. The form uses the resolved `width` from `GET /content-types` and applies no default of its own. Below the `sm` breakpoint every field takes the full row. A component group always takes the full row.
- **CE-4 Code text area.** JSON text is edited in one shared input of form-commons: a monospace text area on a dark code surface (theme tokens, Q-SBF6) with a gutter showing one line number per text line, kept in step when the text scrolls; lines do not wrap (the area scrolls sideways), so each number stays beside its line. The document editor's `json` fields (CE-2) and the schema builder's import paste box (SB-3) use it.

### Default values in the form (feature `schema-builder-fields` phase 2, user 2026-11-18, Q-TID4)

- **CE-5 Defaults.** A new document's form starts with each field's `default` from `GET /content-types` (CM-11 in [content-modeling](../content-modeling/SPEC.md)), at the root and in each component entry the form starts with; a component entry the editor adds starts with its fields' defaults. A field without a default starts empty, as today. Opening a stored document never fills a default into an empty field, and a default is a starting value only: the editor may clear or change it before saving (a cleared `required` field is refused as usual). The API stores what it is sent and applies no default (Q-TID4).

### Collapsible items of repeatable components (feature `component-item-collapse`, user 2026-11-26)

- **CE-6 Collapsed items.** Each item of a repeatable component in the cms-admin document form (at every nesting level, create and edit pages) can be collapsed and expanded from its header; a collapsed item shows only its header, the header keeps the item's remove and move controls. Opening the create or edit page shows every item of every repeatable component collapsed, the items the form starts with included (CE-5). An item the editor adds opens expanded. The open or closed state lives in the page only: it follows its item when the item moves, stays through a save, a version-conflict merge and a refetch on the same page, and is not stored; reopening or reloading the page collapses every item again. When a save is refused for a field inside a collapsed item, that item (and each collapsed item that holds it) opens, so the error shows; cms-admin finds it from the refused input path the API sends with its `DOCUMENT_INVALID` answer (`details.path`, [api-contract.md](../../global/reference/api-contract.md)), never from the message text. When the form itself refuses a value before sending (a number or JSON value it cannot read), nothing is sent: every collapsed item that holds a refused field, at any level, opens, and focus moves to the first refused field in page order, whose error shows next to it, as for a refused field outside any item. Values in a collapsed item stay in the form and are saved as usual. A non-repeatable component is not collapsible (unchanged). The toggle is a button with `aria-expanded` and the item body's id in `aria-controls`, usable by keyboard.
- **CE-7 Item header.** The header text of an item is `{position}: {title}` with `position` its 1-based place in the list, where `{title}` is the item's `titleField` value (CM-14 in [content-modeling](../content-modeling/SPEC.md)) followed by ` - {subtitle value}` when `subtitleField` is set and its value is not empty. A value is shown as its one-line text (the first line of a `string`, the stored text of the others), trimmed; a long header is cut with an ellipsis on one line and its full text is the accessible name of the toggle. It follows the form values as the editor types. A value that is empty, absent, masked for the actor (`MASKED_VALUE`, D3) or one the form cannot read (letters in a number field) counts as empty, so a masked value never appears in a header. When the title value is empty, the subtitle value (if any) stands alone after `{position}: `; when both are empty or the component sets no `titleField`, the header is today's item title (`{label} {position}`, e.g. `Experiences 2`). All header text is cms-admin copy.

## Acceptance

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 4, 5, 12, 14.

## Decisions

**D11 Draft/publish integrity.** Partial unique indexes allow at most one draft and one published row per `document_id`. Publish takes the draft's `expectedVersion`. Components carry a stable `component_uid` (UUID) for diff/merge matching.

**D16 Presence.** Needs `update` on the document. Returns only `{ accountId, displayName, state, lastSeenAt }`. In-memory store (single replica, documented).

Q10 (offset pagination) is global: [DECISIONS.md](../../global/DECISIONS.md).

## Out of scope

Reviewer write sandbox ([out of scope](../../../SPEC.md)).

An "expand all" or "collapse all" control, collapse state kept across reloads or per user, collapsing a non-repeatable component, and an item title made from a field of a nested component or from more than two fields (CE-6, CE-7, CM-14).

## Open questions

None.
