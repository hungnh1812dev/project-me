# Schema builder
Done: 2026-11-12 · Commits: 9e686fb0..88d765f9 · Apps / packages: cms-api, cms-admin, web, e2e, docs

## Overview
The owner designs a content type in cms-admin at `/schema-builder`: import the repo schema JSON, edit fields on a canvas with a palette, a property panel and drag and drop, see a live check from cms-api on every pause, and export the JSON once it validates clean. Nothing is stored; others see a forbidden card. The sign-in and status page text types became the module types `module-sign-in` and `module-page-status`.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| Validate endpoint | Owner-only `POST /content-types/validate` checks a candidate definition against the registered types; no-store, 120/min, 413 over 100 KB | SCB-1, SCB-2 |
| Builder page | Validate client with 400 ms debounce, editor tree model and field type registry, JSON import (500-field cap, depth guard) and export, shell leave guard with a shared `ConfirmDialog` | SCB-3..SCB-7 |
| Canvas editing | Canvas rows and component boxes, palette, property panel with errors per control, move, duplicate, delete, depth limit 3 | SCB-8, SCB-10 |
| Drag and drop | One `@dnd-kit` context over canvas and palette, pointer and keyboard sensors, screen-reader announcements | SCB-9 |
| Module text types | `module-sign-in` and `module-page-status` replace the old types (migration `0011` drops the old tables, D10); web reads them through aliases | SCB-11, SCB-12 |
| Tests | cms-api and cms-admin unit tests, e2e `SchemaBuilder` and `SchemaBuilderValidateApi` specs | SCB-e2e1, SCB-e2e2 |

## Structure
- `apps/cms-api`: `modules/content-types/application/DefinitionValidation.service.ts` and the validate route, content-engine validator rules, `content/schemas/module-sign-in.json`, `module-page-status.json`, `content/migrations/0011_content.sql`
- `apps/cms-admin`: `views/schema-builder/` (new), `features/content-types/` (validate client, `useDefinitionValidation`), `components/ConfirmDialog.tsx`, `components/layouts/LeaveGuard.tsx`, `configs/locales/en/SchemaBuilder.ts`; adds `@dnd-kit`
- `apps/web`: site shell and status page queries read the module types through aliases
- `apps/e2e`: `tests/SchemaBuilder.e2e.spec.ts`, `tests/SchemaBuilderValidateApi.e2e.spec.ts`, nav and toast spec updates
- `docs/flows/schema-builder/` (new), `docs/modules/` content-types and content-engine docs, `docs/global/DECISIONS.md` (D24), canonical values

## Major issues
| Issue | Problem | Impact | Root cause | Fix |
|---|---|---|---|---|
| feature-qc#1 (high, qc) | Importing 400 nested components blanked the admin app ("Maximum call stack size exceeded") | An owner lost the tab and the work in it | The import capped only the field count, so recursive rendering ran on any depth | `parseSchemaJson` refuses nesting deeper than `MAX_IMPORT_DEPTH` with a `tooDeep` message (ae3eff86) |
| SCB-A-qc#1 (high, qc) | Route snapshot and registry slug list missed the new route and schemas | cms-api integration suite red (2 fails) | Snapshot tests not updated with the new files | Route added to `EXPECTED_ROUTES`, four slugs to the expected list |
