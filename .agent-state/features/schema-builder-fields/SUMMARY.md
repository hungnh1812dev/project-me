# Schema builder fields
Done: 2026-11-18 · Commits: 89224a91..7f2eb08f · Apps / packages: cms-api, form-commons, cms-admin, e2e (qc), docs

## Overview
The schema builder offers more field types: one Number field (unsigned integer, integer, big integer, float, double, decimal), a Datetime picker (date, date and time, time), an Enum field with owner-typed options, and a Text input group (single line, multi-line) with a Text editor. Field properties open in a popup; every inputable type except media and component takes an optional default value. The JSON input shows line numbers on a dark background.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Number, Datetime picker, Enum | New field types and keys (`unsigned`, `options`), document checks, document inputs | SBF-1..SBF-6, SBF-e2e |
| Field properties popup | Properties in a popup with type variant and option controls; dark JSON surface with line numbers | SBF-3, SBF-6 |
| Text input, Text editor | One Text input group (single line, multi-line); rich text relabelled Text editor | SBF-9 |
| Default values | Optional `default` key, checked on write, prefilled for new documents and component entries | SBF-7, SBF-8, SBF-10, SBF-e2e-B |
| Enum option errors | Option errors shown next to the option in the popup | DR1 |

## Structure
- `apps/cms-api/`: `src/modules/content-engine/domain/` (field-types registry, value parsers, constants, definition rules, specs); `documents/domain/ValueValidator.rules.ts`; `content-types/` (service, field view and specs); `graphql/` (scalars `BigInt` and `Time`, schema builder rules); `content/schema.graphql`; `test/integration/` (`ContentFieldTypes.integration.spec.ts` new).
- `packages/form-commons/`: `src/components/ui/CodeTextarea.tsx` and test new; date-picker (`DatePicker`, `TimePicker`), json-input, text-area-input; `styles/` (tokens, theme); `index.ts`, `PublicApi.snapshot.ts`; `README.md`.
- `apps/cms-admin/src/`: `features/content/` (`FieldValueInput.tsx` and test new; `Document.form`, `Field.registry`, `FieldTree.rules`, `FieldValues.rules`, `DynamicFormRenderer`); `features/content-types/`; `views/schema-builder/` (`FieldPropertiesDialog.tsx` and test new; palette, row, canvas, reducer, JSON rules, import dialog, page and their specs); `views/Views.registry.ts`; `components/Modal.tsx`; `configs/locales/en/` (text and `copy.snapshot.json`).
- `apps/e2e/tests/`: `ContentDefaults.e2e.spec.ts` new; `SchemaBuilder` and `SchemaBuilderValidateApi` specs changed.
- `docs/`: `flows/` (content-editing, content-modeling, schema-builder SPEC); `global/reference/` (api-contract, canonical-values); `modules/` (MODULES index, content-schema, cms-admin, cms-api, form-commons, graphql).
- `CHANGELOG.md`.

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| SBF-B-qc#2 Schema builder page did not preload the content screen text (high, qc) | The properties popup renders FieldValueInput, which reads the content screen text; the schema builder route did not preload it, so the first popup open suspended the whole page. | Owners saw the page flash "Loading the page", React logged use() suspend errors, and the popup mounted late so 6 e2e specs failed. | Views.registry.ts listed only 'schemaBuilder' in textScreens for the schema builder route. | Added 'content' to that route's textScreens, with a registry test. |
