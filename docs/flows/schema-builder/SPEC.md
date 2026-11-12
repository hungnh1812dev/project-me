---
flow: schema-builder
summary: Owner-only cms-admin page that builds or edits a content type schema by drag and drop, checks it live against the cms-api validator and exports the JSON file
---

# Schema builder: spec

Part of the [project spec](../../../SPEC.md). Flow `schema-builder`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

The owner opens the schema builder in cms-admin, starts a new content type or imports an existing schema file, builds the field tree by dragging field types from a palette onto a canvas (components nest up to 3 levels), sets each field's keys in a property panel, and sees the cms-api validator's errors while editing. The result is copied or downloaded as the schema JSON file. Nothing is written to the server: the developer puts the file into `apps/cms-api/content/schemas/` and continues with the [content-modeling](../content-modeling/FLOW.md) flow (`content:generate`, review, commit). The full decision is D24 in Decisions below; the schema format is [content-schema.md](../../modules/content-schema.md).

## Requirements

Ids `SB-<n>`. Values (debounce, throttle) are in [canonical-values.md](../../global/reference/canonical-values.md) "Schema builder".

### Page and access

- **SB-1 Route and menu.** Page `/schema-builder`, titled "Schema builder", one item in the side menu's System settings group. The item and the page are shown to the owner only; any other role does not see the item, and opening the route shows the app's forbidden state (Q-SB3).
- **SB-2 Start.** The page starts empty with two actions: "New content type" (a definition with an empty `slug` and `displayName`, `kind` `collection`, `draftAndPublish` `true`, no fields) and "Import JSON" (SB-3). Starting again over unsaved work asks for confirmation first (SB-12).
- **SB-3 Import.** The owner picks a `.json` file or pastes JSON text. Text that is not JSON, or JSON that is not an object with a `fields` array (at every component level), is refused with one message naming the problem, and the current work stays. Anything else loads, even with validation errors, which then show as usual (SB-8). Keys the builder has no control for are kept as they are and exported unchanged (the validator reports unknown ones as `schema.invalid`). Importing is how an existing content type is updated (Q-SB2).

### Building

- **SB-4 Palette.** One palette item per field type of the schema format ([content-schema.md](../../modules/content-schema.md) "Field types": `text`, `string`, `richtext`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `json`, `media`, `component`), each with a label and an icon. The palette is one registry in cms-admin: a new field type is one entry.
- **SB-5 Canvas.** The canvas shows the field tree in order: each field as a row with its name, type and markers (required, sensitive, repeatable, width); each component as a box holding its own fields. With a pointer or the keyboard (`@dnd-kit` keyboard sensor, announcements for screen readers), the owner can:
  - drop a palette item at any position of the root or of a component's field list;
  - reorder a field within its list, and move a field (with its subtree) into or out of a component;
  - for each of these also use a non-drag control: "Add field" per list (opens the palette as a menu), "Move up", "Move down", and "Move to" (a list of the valid target lists);
  - duplicate a field (its copy gets a free name, SB-6) and delete a field; deleting a component that holds fields asks for confirmation.
- **SB-6 New field.** A dropped field gets a name free at its level (`field1`, `field2`, ...; a component also gets the same `component` value) and is selected, so the property panel opens on it.
- **SB-7 Depth.** Components nest at most 3 levels ([canonical-values.md](../../global/reference/canonical-values.md) "Component depth"): a drop or move that would place a component (or a subtree holding one) deeper than level 3 is not offered (no drop target, not in "Move to"), so the canvas never holds a deeper tree.
- **SB-8 Property panel.** For the type: `slug`, `displayName`, `kind`, `draftAndPublish`. For the selected field: `name`, `displayName`, `type`, `required`, `sensitive`; on a non-component field `width` (`1/3`, `1/2`, `full`, or unset); on a component `component` and `repeatable`. Changing a field's `type` to or from `component` is refused while the field would lose children; otherwise it drops the keys the new type does not allow (`width` on a component; `component`, `repeatable`, `fields` on a non-component). The panel shows next to each control the errors whose path points at that key.

### Validation

- **SB-9 Live validation by cms-api.** After each change, once the tree has not changed for the debounce time, cms-admin sends the whole definition to `POST /api/v1/content-types/validate` (D24) and shows the result: an error count, the list of errors (rule, message, path rendered as `fields[5].fields[2].name`), and on the canvas a marker on every field an error path points to. Choosing an error in the list selects that field. cms-admin never re-implements the validator's rules (D24); only the depth limit (SB-7) and the key set per type (SB-8) are kept by the editor itself.
- **SB-10 Validate endpoint.** `POST /api/v1/content-types/validate`, body `{ "definition": <object>, "mode": "create" | "update" }`, answers `200 { "valid": boolean, "errors": [{ "path", "rule", "message" }] }` in the shape of [content-schema.md](../../modules/content-schema.md) "Validation rules". It runs the content-engine validator on the definition together with every registered definition (as `content:generate` validates the whole schema folder), leaving out, in `update` mode, the registered definition with the same slug; it returns only the errors whose path lies in the submitted definition, so a slug or generated name that clashes with another type is reported. It reads nothing but the in-memory registry, writes nothing, and writes no audit entry. Owner only as a hard rule (`requireOwnerActor`, as D20), `no-store`, throttled per actor; a body over the global JSON limit is 413, a body that is not `{ definition: object, mode }` is 400.
- **SB-11 States.** While a check runs, the result of the previous tree stays visible and is marked as checking; a failed call (network, 5xx, 429) shows "Validation unavailable" with a retry, never a stale "valid".

### Export

- **SB-12 Export.** "Copy JSON" (clipboard) and "Download" (`<slug>.json`) are enabled only when the last validation was of the current tree and found no error (Q-SB4); otherwise the reason is shown next to them. The JSON has 2-space indentation and a final newline, keys in the order of [content-schema.md](../../modules/content-schema.md) (type: `slug`, `displayName`, `kind`, `draftAndPublish`, `fields`; field: `name`, `displayName`, `type`, `component`, `repeatable`, `required`, `sensitive`, `width`, `fields`; kept unknown keys last). An optional key is written when it is set to a non-default value or when the imported file held it. Importing a valid file and exporting it unchanged gives the same JSON value. The repository's pre-commit formatter brings the file to the repo's layout (Q9).
- **SB-13 Unsaved work.** The work lives in the page's memory only (Q-SB5). Leaving the page, signing out from it or starting again (SB-2) while the tree changed since the last export or import asks for confirmation; closing or reloading the tab triggers the browser's leave prompt.
- **SB-14 Next step shown.** After an export, the page shows the next steps of the content-modeling flow: save the file under `apps/cms-api/content/schemas/`, run `content:generate`, review the migration (destructive changes need `--allow-destructive` and a note, D10), commit. It does not show or predict the SQL.

## Acceptance

No global success criterion is owned by this flow; its acceptance lives in the checkpoint checklists of its tasks.

## Decisions

**D24 Schema builder (user 2026-11-12).** cms-admin gets an owner-only page that builds a content type schema by drag and drop and exports the JSON file (option B, export only): it never writes a schema, a migration or the registry on the server, and the developer still runs `content:generate` by hand (D10 unchanged). It both creates new content types and updates existing ones (by importing their file). The cms-api content-engine validator stays the one owner of the definition rules: cms-admin checks through `POST /content-types/validate` (SB-10), served by the content-types module with the validator content-engine exports. Drag and drop uses `@dnd-kit/core` and `@dnd-kit/sortable`, a dependency of cms-admin only (no other app or package).

## Out of scope

- Writing the schema file, the migration or the registry from the browser; running `content:generate` or `content:migrate` (D24, D10).
- Showing the generated SQL, table names or a destructive-change preview: `content:generate` stays the authority (SB-14).
- Loading a schema from the deployed registry (Q-SB2); autosave or drafts kept across reloads (Q-SB5).
- Reusable components shared between types (not in the schema format).

## Answered questions

Answered by the user 2026-11-12: each as recommended, which SB-1..SB-14 follow.

- **Q-SB1 Where live validation runs.** Recommended: the cms-api endpoint of SB-10 (one validator, also sees clashes with registered types; costs a round trip per pause, an owner-only route with a security review). Alternative: move the definition schema, validator and naming rules out of cms-api into a new shared package used by both apps (checks offline and per keystroke; costs moving about 600 lines of the content-engine domain, a new package build in both Dockerfiles, and no check against registered types).
- **Q-SB2 Source of an existing type for update.** Recommended: import the repo's JSON file (file pick or paste), since the file the developer edits is the one `content:generate` reads. Alternative: a "load registered type" list fed by a new owner-only endpoint returning the stored definition (no file needed; but it is the deployed version, which may be older than the repo file, and it is one more route).
- **Q-SB3 Who may use the page.** Recommended: owner only, like backups (schema work is a developer task). Alternative: owner and admin (a role grant to define; the page writes nothing, so the risk is low, but the validate endpoint then needs a permission instead of the hard owner rule).
- **Q-SB4 Export with errors.** Recommended: blocked until the current tree is valid (an exported file always passes `content:generate` validation). Alternative: allowed with a warning (work can be saved while cms-api is unreachable or a fix is unclear; the file may then fail `content:generate`).
- **Q-SB5 Keeping unsaved work.** Recommended: memory only plus leave confirmations (SB-13). Alternative: autosave to `localStorage` (survives a reload; one more stored state to clear on sign-out, and a stale draft may come back over a newer file).
