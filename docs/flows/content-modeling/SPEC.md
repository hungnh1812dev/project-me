---
flow: content-modeling
replaces: D10
summary: Content type JSON schemas to generated SQL migrations in the content schema, the registry and the GraphQL SDL
---

# Content modeling: spec

Part of the [project spec](../../../SPEC.md). Flow `content-modeling`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

A developer adds or changes a content type as a JSON schema in `apps/cms-api/content/schemas/`, generates the SQL migration and the GraphQL SDL, reviews and commits them, and the deploy applies them with `deploy:migrate`. At runtime the content registry resolves every slug before any SQL. The full decision is D10 in Decisions below; the table shapes are in [data-model.md](../../global/reference/data-model.md) §8.2.

Commands: [stack-and-commands.md](../../global/reference/stack-and-commands.md) (`content:generate`, `content:migrate`).

## Requirements

D10 (Decisions below) and §8.2 of [data-model.md](../../global/reference/data-model.md). New requirements of this flow go here with ids `CM-<n>`.

### Field metadata and component names (feature `cv-page-schema`, ADR 0019, user 2026-11-05)

The schema format of `apps/cms-api/content/schemas/cv-page.json` as changed on 2026-11-05 is the target format: cms-api and cms-admin support it, it is not reverted.

- **CM-1 Text types.** `text` is short text (one line). `string` is long plain text (several lines). Both store in a `text` column, filter as condition kind `string` and mask as `"***"`, so switching a field between them is a comment-only migration (no DDL). There is no alias: an existing schema field that holds a short value is changed from `string` to `text`.
- **CM-2 `name` is the API key.** A field's `name` is its key in stored trees, REST and GraphQL responses, its GraphQL field name and its permission field path (`experiences.company`), and the source of its column name (snake_case). Nothing else changes these.
- **CM-3 `component` value.** Every `type: "component"` field has a `component` value (a missing one is `schema.invalid`); any other field with one is `schema.invalid`. Its snake_case form follows the identifier rules (`identifier.invalid`, `identifier.reserved`, path `fields[i].component`). Two sibling component fields with the same value collide (`identifier.collision`). A component field's `name` is not a table or column segment (CM-4), so it may be a Postgres reserved word (`references`); only its `component` value and every non-component field name are checked against that list. The `identifier.invalid` rule, the engine-owned names and the sibling collision still apply to it.
- **CM-4 Component table names.** A component table is named `<root table>__<component lv1>[__<lv2>[__<lv3>]]` from the `component` values of the path, never from the field names: field `skills` with `component: "skill"` in `cv-page` is table `cv_page__skill`. Index, constraint and foreign key names keep their suffixes and follow the table name. Depth (3) and length (63 bytes) limits are unchanged.
- **CM-5 Table renames keep data.** When a component table's name changes while its field path (the dotted API names from the root, e.g. `experiences.roles.projects`) stays the same, `content:generate` writes a rename (table, primary key, parent foreign key, parent index, media foreign keys), parent before child, then the usual column diff. A rename is not destructive. When both the `name` and the `component` value of a field change in one migration there is no rename: the table is dropped and created (destructive, D10).
- **CM-6 Old snapshots.** When `snapshot.json` is read, a component field with no `component` value gets `component = name` (only there; source schemas never get this fallback), so the existing tables pair with their new names. The next written snapshot carries `component` everywhere. Existing component tables (`resume`, `header`, `cv_page`) are moved to the new names by the generated migration.
- **CM-7 GraphQL component type names** follow the component path in PascalCase: `CvPage_Experience_Role_Project`. GraphQL field names do not change. The printed SDL is committed (D18).
- **CM-8 `displayName`** (optional, on every field, components included) is the admin label: 1-60 code points, no control characters, no leading or trailing space (else `display_name.invalid`, path `fields[i].displayName`). It is metadata only (comment-only migration). `GET /content-types` field views carry it only when the schema sets it.
- **CM-9 `width`** (optional, on non-component fields only; on a component field: `schema.invalid`) takes `1/3`, `1/2` or `full` ([canonical-values.md](../../global/reference/canonical-values.md) "Field widths"); any other value (`""`, `50%`) is `schema.invalid`. It is metadata only. `GET /content-types` field views always carry the resolved `width` (cms-api applies the default `full`).
- **CM-10 Schemas moved to the format.** `cv-page.json` uses `text`, `component` values, `width` as fractions (`50%` becomes `1/2`) and `repositoryLink` (the uncommitted `responsitoryLink` is a typo; no committed migration ever created that column, so no data moves). `resume.json`, `header.json`, `cv-contact.json` and `profile.json` change every short `string` field to `text` and give each component field a `component` value (Q-CPS4). One generated migration (`0006`) and the printed SDL hold the change; its destructive parts in `cv_page` need `--allow-destructive` and the data-migration note (Q-CPS3).

## Acceptance

Global success criterion of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 16.

## Decisions

**D10 Content engine.** One engine for all content types: JSON schema → validated definition → generated SQL migration in PG schema `content`, applied by a migration command/Job, never at request time. Prisma owns only `public`, so Prisma migrate never sees content tables or proposes a drift reset. Adding a schema = generate → review the migration → deploy; nothing happens "automatically on file drop". Destructive changes (drop or rename a field) need an explicit `--allow-destructive` flag and a written data-migration note.

Q1 (Kysely for content queries) is global: [DECISIONS.md](../../global/DECISIONS.md).

**Field metadata and component names.** CM-1..CM-10: `docs/adr/0019-content-field-metadata-and-component-names.md` (accepted 2026-11-05, user). The cms-admin side (labels, inputs, widths) is CE-1..CE-3 in [content-editing](../content-editing/SPEC.md).

## Out of scope

Group 2 owner-private runtime DDL ([out of scope](../../../SPEC.md)).

## Open questions

For the user (ADR 0019 "Open"; the generated migration, task CPS-3, waits for them):

- **Q-CPS1** `cv-page.json` uses `"type": "number"` for `teamSize`, a type the engine does not have. Recommended: `integer` (the type `teamSize` had, as in `resume.json`; no new type). Trade-off: a new `number` type (alias of `integer` or `decimal`) adds a registry entry, a cms-admin input and a second word for one thing.
- **Q-CPS3** The new `cv-page.json` drops `cv_page.company`, `cv_page__experience__role.projects` (text) and the table `cv_page__project` (projects move under roles). Recommended: accept the drop with `--allow-destructive` and a note "cv-page data in these columns is not carried over" (apps/web reads `resume`, not `cv-page`; cv-page holds test data). Trade-off: any cv-page rows there are lost; keeping them needs a hand-written copy step outside the generator (ADR 0019 option B, rejected).
- **Q-CPS4** `component` values for `resume` and `header`. Recommended: the singular of each name: `resume` `skill`, `experience`, `role`, `project`, `education`, `language`, `referee`; `header` `nav`, `sub_navigation` (`subNavigation`), `author`. Tables become `resume__experience__role__project`, `header__nav__sub_navigation`, ... (renamed with their data, CM-5). Trade-off: keeping `component = name` keeps today's table names and needs no rename, but mixes plural and singular names across types.
