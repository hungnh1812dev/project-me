# Component item collapse
Done: 2026-11-27 · Commits: 9fc36356..c3ca4e91 · Apps / packages: cms-api, cms-admin, e2e, docs

## Overview
Repeatable component items in the document form collapse behind a header toggle. The header shows text built from two chosen item fields (title and subtitle), set in the schema builder. A refused value opens the items that hold it.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Item title keys | Schema, API views, schema builder and validate API carry `titleField` / `subtitleField` on repeatable components | CIC-1 to CIC-5 |
| Refusal path | Refused `DOCUMENT_INVALID` responses name the input path, never a value | CIC-6 |
| Item header text | Header text from title and subtitle, with fallbacks; masked values count as empty | CIC-7 |
| Collapsible items | Items collapse behind a header toggle; open state survives saves; refused values open their item | CIC-8, CIC-9, CIC-11 |
| e2e | Specs for the schema keys, the validate API, collapsed items, the header and refused values in collapsed items | CIC-10, CIC-12 |

## Structure
- apps/cms-api: `src/modules/content-engine/domain/` (DefinitionSchema, field-types registry and entity, validator and SQL rules and specs), `src/modules/content-types/domain/` (ContentTypeView rules and specs), `src/modules/documents/domain/` (ValueValidator rules and spec), `test/integration/` (ContentTypes, ContentTypesValidate, DocumentsWrite)
- apps/cms-admin: `src/features/content/` (ComponentList, ItemHeader rules, ItemOpenState context, FieldTree rules, Content errors and constants, DynamicFormRenderer tests), `src/features/content-types/ContentTypes.api.ts`, `src/views/document-edit/` (DocumentEditPage and open-items test), `src/views/schema-builder/` (ItemTitleSelects, FieldPropertiesDialog, FieldTypes registry, SchemaJson and SchemaTree rules and tests), `src/configs/locales/en/` (Content, SchemaBuilder, copy snapshot)
- apps/e2e: `tests/` (ComponentItemCollapse, SchemaBuilder, SchemaBuilderValidateApi, ContentSingleType specs), `src/Locators.fixture.ts`
- docs: `docs/modules/` (content-schema, cms-admin content, content-types, document-edit, schema-builder; cms-api content-engine, content-types, documents)

## Major issues
None

## Commits
9fc36356..c3ca4e91 (see `git log 9fc36356..c3ca4e91`); last commit c3ca4e91 adds the feature-check e2e spec `ComponentItemTitleFlow.e2e.spec.ts`
