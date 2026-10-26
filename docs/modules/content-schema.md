# Content schema format

A content type is defined in one JSON file per type under
`apps/cms-api/content/schemas/<slug>.json`. The content engine turns each file
into tables in the Postgres schema `content` (SPEC §8.2). Before any SQL is
generated, the definition must pass the validator.

| Piece                | File (in `apps/cms-api/src/modules/content-engine/`)                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape (Zod)          | `domain/DefinitionSchema.rules.ts`                                                                                                                                                                                                                                                                                   |
| Rules and errors     | `domain/DefinitionValidator.rules.ts`                                                                                                                                                                                                                                                                                |
| SQL name assembly    | `domain/Naming.rules.ts` (the only place names are built; T06/T07 must use it)                                                                                                                                                                                                                                       |
| Limits, words, codes | `domain/ContentEngine.constants.ts` (pool, pg codes, migration file names and the lock key: `adapters/ContentDatabase.adapter.ts`)                                                                                                                                                                                   |
| Field type behaviour | `domain/field-types/` (`FIELD_TYPE_SPECS`, `fieldTypeOf`: one entry per type, including `coerceValue`; value patterns, `INT4_MAX` and the date/datetime/uuid parsers are exported next to it; `mediaColumnsOf(registry)` lists the media columns by table, column and field name, from the `referencesMedia` marker) |
| Diff → DDL (pure)    | `domain/SqlGenerator.rules.ts`                                                                                                                                                                                                                                                                                       |
| Files, snapshot      | `adapters/MigrationFiles.adapter.ts`                                                                                                                                                                                                                                                                                 |
| Apply + bookkeeping  | `adapters/MigrationRunner.adapter.ts` (Kysely)                                                                                                                                                                                                                                                                       |
| CLIs                 | `cli/ContentGenerate.command.ts`, `cli/ContentMigrate.command.ts`                                                                                                                                                                                                                                                    |

## Top level

```json
{
  "slug": "cv-page",
  "kind": "collection",
  "draftAndPublish": true,
  "fields": [ ... ]
}
```

| Key               | Type                         | Meaning                                                                      |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `slug`            | string, kebab-case           | API name and source of the root table name. `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. |
| `kind`            | `"single"` \| `"collection"` | `single`: one document (e.g. a settings page). `collection`: many documents. |
| `draftAndPublish` | boolean                      | `true`: edits are drafts until published. `false`: every save is live.       |
| `fields`          | array, at least one entry    | Ordered field list. The order is the order of columns and of the admin form. |

Unknown keys are rejected everywhere (top level and fields), so a typo never
passes silently.

## Fields

Every field has a `name` and a `type`. Optional on every field:

| Key         | Type    | Meaning                                                                                                                                                                   |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required`  | boolean | A value must be present on save. Default `false`.                                                                                                                         |
| `sensitive` | boolean | Hint: the field starts masked for low-privilege roles (`public`, `reviewer`). It only seeds field profiles; permissions decide at runtime (SPEC D2, §6). Default `false`. |

### Field types

| `type`      | Stores                                              | Masked value (SPEC §6) |
| ----------- | --------------------------------------------------- | ---------------------- |
| `string`    | short text (one line)                               | `"***"`                |
| `text`      | long plain text                                     | `"***"`                |
| `richtext`  | sanitized HTML (SPEC D13)                           | `"***"`                |
| `integer`   | whole number                                        | `null`                 |
| `decimal`   | exact decimal number                                | `null`                 |
| `boolean`   | true / false                                        | `null`                 |
| `date`      | calendar date, no time                              | `null`                 |
| `datetime`  | point in time (UTC)                                 | `null`                 |
| `json`      | free JSON (e.g. a list of tags)                     | `null`                 |
| `media`     | one file from the media library (`file_library.id`) | `null`                 |
| `component` | nested group of fields in its own table             | `null`                 |

Column types are chosen by the SQL generator; see [Migrations](#migrations).

**Open unions in `GET /content-types`.** The `type` of a field view (a field
type, or a value kind such as `uuid` for system fields) and its
`conditionKind` are open string unions: a new field type or condition kind
adds a value. Clients must handle an unknown value with a fallback, not an
exhaustive switch. New keys on a view are additive; removing or renaming a
key is breaking and fails `content-types.contract.spec.ts`.

`media` holds a single file. For a list of files, use a repeatable component
with a `media` field.

### Components

A component is a field of type `component` with its own `fields`:

```json
{
  "name": "experience",
  "type": "component",
  "repeatable": true,
  "fields": [{ "name": "company", "type": "string" }]
}
```

- `repeatable: true` makes it an ordered list (stored with `order_index`).
  Omitted or `false` means at most one entry.
- Components are defined inline and owned by their parent: there is no
  reuse between types and no link table. Deleting a parent row deletes its
  component rows (`ON DELETE CASCADE`).
- Components nest at most **3 levels** below the root (SPEC §6):
  root → level 1 → level 2 → level 3.

## Naming

Field names are what the API uses as property names. Write them in
camelCase (`teamSize`); snake_case is accepted too. The SQL name is the
snake_case form.

| Object                 | Rule                                              | cv-page example                  |
| ---------------------- | ------------------------------------------------- | -------------------------------- |
| Column                 | field name, each capital becomes `_` + lowercase  | `teamSize` → `team_size`         |
| Root table             | slug with `-` → `_`                               | `cv-page` → `cv_page`            |
| Component table        | parent table + `__` + component field column      | `cv_page__experience__role`      |
| Primary key            | `<table>_pk`                                      | `cv_page_pk`                     |
| Draft / published uniq | `<root>_draft_uq`, `<root>_published_uq`          | `cv_page_published_uq`           |
| Published list index   | `<root>_published_idx`                            | `cv_page_published_idx`          |
| Parent FK / index      | `<component>_parent_fk`, `<component>_parent_idx` | `cv_page__experience_parent_idx` |
| Media FK               | `<table>_<column>_media_fk`                       | `post_cover_image_media_fk`      |

`__` appears only as the path separator, which is why names may not contain
it. Table, index and constraint names share one namespace in the `content`
schema, so all of them are checked together, across every definition.

Engine-owned columns, added by the generator to every table:

- Root: `id`, `document_id`, `version`, `published_at`, `locale`,
  `created_at`, `updated_at`, `created_by`, `updated_by`
- Component: `id`, `component_uid`, `parent_id`, `order_index`

## Validation rules

The validator collects every error (it does not stop at the first one). Each
error has this shape, ready for the admin UI and the CLI:

```json
{
  "path": ["fields", 5, "fields", 2, "name"],
  "rule": "identifier.collision",
  "message": "Field name \"team_size\" and \"teamSize\" both map to \"team_size\" at this level. Rename one of them."
}
```

`formatDefinitionPath(path)` renders the path as `fields[5].fields[2].name`.
When several files are validated together (`validateDefinitions`), the path
starts with the file's index in the list.

| `rule`                     | Rejected when                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.invalid`           | The shape is wrong: missing or unknown key, wrong value type, unknown `type`, a component without `fields`, `fields`/`repeatable` on a non-component, an empty field list.      |
| `identifier.invalid`       | The slug is not kebab-case, or a field's SQL name fails `^[a-z][a-z0-9_]*$`, contains `__` or ends with `_` (so: no capital first letter, digit first, `-`, spaces, non-ASCII). |
| `identifier.reserved`      | A field's SQL name is an engine-owned column (above, plus `status`) or a Postgres reserved word (`order`, `user`, `select`, ...). A slug may not map to a reserved word.        |
| `identifier.too_long`      | A composed table, column, index or constraint name is longer than **63 bytes** (Postgres would silently truncate it). The generator never truncates.                            |
| `identifier.collision`     | Two fields at the same level map to the same SQL name (`teamSize` and `team_size`), or two generated table/index/constraint names are equal in the `content` schema.            |
| `component.depth_exceeded` | A component sits deeper than level 3.                                                                                                                                           |

Length budget: the longest suffix decides. A root table may be at most 49
bytes (`_published_idx` adds 14), a component table at most 52 bytes
(`_parent_idx` adds 11). Shape errors are reported alone; length and
collision checks run only once every name is well formed.

## Worked example: `cv-page`

`apps/cms-api/content/schemas/cv-page.json` (ported from the old ERD; the
old `responsitoryLink` is spelled `repositoryLink`, and the old
`reviewerSessionId` column is gone, SPEC D2):

```json
{
  "slug": "cv-page",
  "kind": "collection",
  "draftAndPublish": true,
  "fields": [
    { "name": "position", "type": "string" },
    { "name": "isMain", "type": "boolean" },
    { "name": "company", "type": "string" },
    { "name": "summary", "type": "richtext" },
    {
      "name": "experience",
      "type": "component",
      "repeatable": true,
      "fields": [
        { "name": "company", "type": "string" },
        { "name": "location", "type": "string" },
        {
          "name": "role",
          "type": "component",
          "repeatable": true,
          "fields": [
            { "name": "position", "type": "string" },
            { "name": "teamSize", "type": "integer" },
            { "name": "techStack", "type": "json" },
            { "name": "responsibilities", "type": "richtext" }
          ]
        }
      ]
    }
  ]
}
```

(Shortened: the real file also has `skill`, `project`, `education`,
`language` and `reference`.) It produces the 8 tables of SPEC §8.2:

```
cv_page                     root: position, is_main, company, summary
cv_page__skill              level, skill
cv_page__experience         company, location
cv_page__experience__role   position, period, team_size, projects, tech_stack, responsibilities
cv_page__project            name, team_size, role, live_link, repository_link, tech_stack, responsibilities
cv_page__education          degree, institution, period, location, description
cv_page__language           language, level
cv_page__reference          name, phone, role
```

No field in `cv-page.json` is marked `sensitive` yet: which ones should be is
open question Q5 (SPEC §14).

## Migrations

Content tables are never created at runtime. Changes go through two
commands (run from `apps/cms-api`):

```bash
pnpm content:generate                     # build, diff, write content/migrations/NNNN_content.sql
pnpm content:generate -- --dry-run        # print the SQL and destructive changes, write nothing
pnpm content:generate -- --name add_github --allow-destructive
pnpm build && pnpm content:migrate        # apply pending migrations (needs the DB_* connection variables)
```

### content:generate

1. Loads and validates every `content/schemas/*.json` (the file name must be
   `<slug>.json`).
2. Diffs them against `content/migrations/snapshot.json`, the state of all
   definitions as of the latest migration (hash + definition per slug). The
   snapshot is in the repo, so generating needs no database and gives the
   same result on every machine.
3. Writes `NNNN_<name>.sql` (next sequence number) and the new snapshot.
   Nothing changed → nothing written. A change with no DDL (e.g. `string` →
   `richtext`, `kind`) still writes a comment-only migration so the
   `_content_types` row gets updated.

| Change                                  | SQL                                  | Destructive? |
| --------------------------------------- | ------------------------------------ | ------------ |
| New content type / component            | `CREATE TABLE` + indexes             | no           |
| New field                               | `ADD COLUMN` (nullable)              | no           |
| Field type with a different column type | `ALTER COLUMN … TYPE … USING col::t` | yes          |
| Removed field                           | `DROP COLUMN`                        | yes          |
| Removed component / content type        | `DROP TABLE` (children first)        | yes          |
| Renamed field                           | drop + add (data is not moved)       | yes          |

Destructive changes fail with the list of changes unless `--allow-destructive`
is passed. Review the SQL with `--dry-run` first.

### Column types

| Field type                   | Column                         |
| ---------------------------- | ------------------------------ |
| `string`, `text`, `richtext` | `text`                         |
| `integer`, `media`           | `integer`                      |
| `decimal`                    | `numeric` (no fixed precision) |
| `boolean`                    | `boolean`                      |
| `date`                       | `date`                         |
| `datetime`                   | `timestamptz`                  |
| `json`                       | `jsonb`                        |

All field columns are nullable: `required` is enforced by the API (drafts may
be incomplete), not by `NOT NULL`. Not generated yet: the `media` FK to
`public.file_library` and the `created_by`/`updated_by` FKs to
`public.accounts`, because those tables arrive with Prisma (T08/T27). The
names are already reserved in `naming.ts`.

System columns: root `id integer GENERATED ALWAYS AS IDENTITY`,
`document_id uuid NOT NULL`, `version integer NOT NULL DEFAULT 1`,
`published_at`/`locale` nullable, `created_at`/`updated_at timestamptz NOT
NULL DEFAULT now()`, `created_by`/`updated_by integer`. Component `id`,
`component_uid uuid NOT NULL` (set by the app), `parent_id integer NOT NULL`
(`ON DELETE CASCADE` to the direct parent), `order_index integer NOT NULL
DEFAULT 0`.

### content:migrate

Runs in **one transaction** under `pg_advisory_xact_lock`, so concurrent runs
wait and then find nothing to do; any failure rolls everything back.

1. Creates schema `content` and the bookkeeping tables if missing:
   `content._migrations` (name, checksum, applied_at) and
   `content._content_types` (slug, kind, draft_and_publish, definition,
   definition_hash). The leading `_` means no slug can collide with them, and
   Prisma, which owns `public`, never sees them.
2. Refuses to run if an applied migration file was edited (checksum), is
   missing, or a pending one is older than an applied one.
3. Applies pending migrations in order and records each one.
4. Upserts `_content_types` from `snapshot.json` (only rows whose hash
   changed) and deletes rows for removed content types.

Migration files are trusted repository content built from validated
definitions; every identifier is quoted, and no request input ever reaches
DDL.

In production, the cms-api image ships `content/` next to `dist/`, so run
`node dist/modules/content-engine/cli/ContentMigrate.command.js` (what `content:migrate`
runs) inside the container. `pnpm smoke` checks this.

## Runtime: registry and repository

Code: `src/modules/content-engine/{domain/ContentTypeRegistry.entity.ts,application/ContentRegistry.service.ts,application/ContentEngine.port.ts,adapters/KyselyContent.repository.ts,adapters/ComponentTableSync.adapter.ts,adapters/TreeLoader.adapter.ts,adapters/PgContentType.repository.ts,domain/ContentRowMapping.rules.ts,domain/ContentTree.entity.ts,domain/ContentDocument.entity.ts,domain/TreeInput.rules.ts}`.

**Registry.** `PgContentTypeRepository.loadDefinitions()` reads
`content._content_types` (the `ContentTypeRepository` port); the application
service `ContentRegistry` passes the rows to
`ContentTypeRegistry.fromDefinitions()`, which re-validates every definition
and builds its `planTables()` plans into a table tree. The registry class
reads no database. `resolve(slug)` returns the plans or throws
`UnknownContentTypeError` (`content_type.unknown`). A request slug is only a
map key: every table and column name the repository uses comes from a plan,
Kysely quotes it, and every value is a bound parameter.

**Tree shape.** API field names on both sides; the plan maps them to
columns (`teamSize` ⇄ `team_size`).

```ts
{ values: { position: 'Lead' },
  components: { experience: [
    { componentUid: '…', values: { company: 'Acme' },
      components: { role: [{ values: { teamSize: 4 } }] } } ] } }
```

Loaded documents add the root system columns (`id`, `documentId`,
`version`, `publishedAt`, …) and, per component, `id`, `componentUid`,
`orderIndex`. Every planned field and component list is present (`null` /
`[]` when empty). Values are raw from `pg` (`decimal` is a string, `json` is
parsed); serialization and masking belong to the API layer (T16/T20).

**Operations** (`ContentRepository` port, Kysely adapter `KyselyContentRepository`; all per slug, all take the caller's `UnitOfWork`):

| Method                                                   | Behaviour                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insertTree(unit, slug, input)`                          | Inserts the root row (`documentId`, `publishedAt` null = draft) and the whole tree. A sent `componentUid` is kept (publish clones), else a new one. |
| `loadTrees(unit, slug, { status, documentIds? })`        | 1 query for the roots, then 1 per component table whose parents have rows (`parent_id = ANY($1::int[])`), ordered by `order_index`.                 |
| `replaceTree(unit, slug, { documentId, status }, input)` | Locks the root row, updates it in place, then syncs each component list that is present in the input (see below).                                   |

`loadComponentTrees(db, root, rootIds)` (`adapters/TreeLoader.adapter.ts`) is exported for read
paths that select roots themselves (filters, pagination).

**replaceTree rules** (decisions, T07):

- Present keys are authoritative, absent keys are untouched: a value key
  overwrites the column (send `null` to clear), a component list replaces
  the stored list of that parent. Omitting a key never deletes data, so a
  client that does not see a field (masking, T16) cannot wipe it.
- In a list, an item whose `componentUid` matches a stored item of the
  same parent and field is updated in place (id and uid kept, `order_index`
  = its position). An item without a uid is inserted with a new UUID. Stored
  items not sent back are deleted, and their subtrees cascade.
- A `componentUid` that is not stored under that parent and field is
  rejected (`tree.unknown_uid`), never inserted or matched elsewhere, so a
  request cannot reach another root's rows. Deletes are also scoped by
  `parent_id`.
- Version bump and OCC (T21), publish cloning (T22) are the caller's job.

**Input checks** (`ContentTreeError`, with `code` and an input `path`), run
before any SQL: unknown keys or fields (`tree.invalid`), a component that is
not a list or has more than one item when not repeatable (`tree.invalid`),
a `componentUid` or `documentId` that is not a UUID (`tree.invalid_uid`), the
same uid twice in a list (`tree.duplicate_uid`). Value types are checked by
the API layer and Postgres.

**Transactions.** Writes take a Kysely `Transaction`: any error (from the
repository or the caller) rolls back the whole document.
`DocumentNotFoundError` (`document.not_found`) when the target row is
missing.
