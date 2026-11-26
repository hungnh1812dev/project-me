# Content schema format

A content type is defined in one JSON file per type under
`apps/cms-api/content/schemas/<slug>.json`. The content engine turns each file
into tables in the Postgres schema `content` (SPEC §8.2). Before any SQL is
generated, the definition must pass the validator.

| Piece                | File (in `apps/cms-api/src/modules/content-engine/`)                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape (Zod)          | `domain/DefinitionSchema.rules.ts`                                                                                                                                                                                                                                                                                                                                                                                          |
| Rules and errors     | `domain/DefinitionValidator.rules.ts`                                                                                                                                                                                                                                                                                                                                                                                       |
| SQL name assembly    | `domain/Naming.rules.ts` (the only place names are built; the migration generator and the tree repository use it)                                                                                                                                                                                                                                                                                                           |
| Limits, words, codes | `domain/ContentEngine.constants.ts` (pool, pg codes, migration file names and the lock key: `adapters/ContentDatabase.adapter.ts`)                                                                                                                                                                                                                                                                                          |
| Field type behaviour | `domain/field-types/` (`FIELD_TYPE_SPECS`, `fieldTypeOf`: one entry per type, including `coerceValue`; value patterns, `INT4_MAX` and the date/datetime/uuid parsers are exported next to it; `mediaColumnsOf(registry)` lists the media columns by table, column and field name, from the `referencesMedia` marker; `richtextColumnsOf(registry)` does the same for `richtext` columns, whose images are media references) |
| Diff → DDL (pure)    | `domain/SqlGenerator.rules.ts`                                                                                                                                                                                                                                                                                                                                                                                              |
| Files, snapshot      | `adapters/MigrationFiles.adapter.ts`                                                                                                                                                                                                                                                                                                                                                                                        |
| Apply + bookkeeping  | `adapters/MigrationRunner.adapter.ts` (Kysely)                                                                                                                                                                                                                                                                                                                                                                              |
| CLIs                 | `cli/ContentGenerate.command.ts`, `cli/ContentMigrate.command.ts`                                                                                                                                                                                                                                                                                                                                                           |

## Top level

```json
{
  "slug": "cv-page",
  "displayName": "CV Page",
  "kind": "collection",
  "draftAndPublish": true,
  "fields": [ ... ]
}
```

| Key               | Type                         | Meaning                                                                                                                                                    |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`            | string, kebab-case           | API name and source of the root table name. `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.                                                                               |
| `displayName`     | string, 1-60 characters      | Label the admin UI shows for the type. Required. Metadata only: changing it generates a comment-only migration (no DDL) and updates the stored definition. |
| `kind`            | `"single"` \| `"collection"` | `single`: one document (e.g. a settings page). `collection`: many documents.                                                                               |
| `draftAndPublish` | boolean                      | `true`: edits are drafts until published. `false`: every save is live.                                                                                     |
| `fields`          | array, at least one entry    | Ordered field list. The order is the order of columns and of the admin form.                                                                               |

Keys are written in this order (the schema builder exports them so): type:
`slug`, `displayName`, `kind`, `draftAndPublish`, `fields`; field: `name`,
`displayName`, `type`, `unsigned`, `options`, `default`, `component`,
`repeatable`, `titleField`, `subtitleField`, `required`, `sensitive`, `width`,
`fields`.

Unknown keys are rejected everywhere (top level and fields), so a typo never
passes silently.

## Fields

Every field has a `name` and a `type`. Optional on every field:

| Key           | Type                        | Meaning                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required`    | boolean                     | A value must be present on save. Default `false`.                                                                                                                                                                                                                                                                           |
| `displayName` | string                      | Admin label of the field (1-60 characters, same rules as the type's `displayName`; error path `fields[i].displayName`). Metadata only. Without it the admin derives a label from `name`.                                                                                                                                    |
| `width`       | `"1/3"`, `"1/2"`, `"full"`  | Share of the admin form row. Not allowed on a `component` (`schema.invalid`). Metadata only. `GET /content-types` always reports it, `full` when unset.                                                                                                                                                                     |
| `default`     | a value of the field's type | Starting value of the field in a new document in cms-admin. Not allowed on `media` and `component`; must be a value the API accepts on a write of the field (CM-11 in [content-modeling](../flows/content-modeling/SPEC.md); error path `fields[i].default`). Metadata only. `GET /content-types` reports it only when set. |
| `sensitive`   | boolean                     | The field is masked for `public` and `reviewer` unless their type-specific `read` row lists it; the wildcard `*` grant does not cover it (SPEC D2, [access control](access-control.md#sensitive-fields-spec-d2-task-rv-mask)). Default `false`.                                                                             |

### Field types

| `type`        | Stores                                                                                                                                                                                                                           | Masked value (SPEC §6) |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `text`        | short text (one line)                                                                                                                                                                                                            | `"***"`                |
| `string`      | long plain text                                                                                                                                                                                                                  | `"***"`                |
| `richtext`    | sanitized HTML (SPEC D13)                                                                                                                                                                                                        | `"***"`                |
| `enumeration` | one value of the field's `options` (below), as text; GraphQL `String`                                                                                                                                                            | `"***"`                |
| `integer`     | whole number, 4 bytes; with `unsigned` (below) never negative                                                                                                                                                                    | `null`                 |
| `biginteger`  | whole number, 8 bytes; API value a string of digits with an optional leading `-` (a number is accepted on input only when it is a safe integer), so no digit is lost past 2^53; GraphQL scalar `BigInt` (a string, as `Decimal`) | `null`                 |
| `decimal`     | exact decimal number                                                                                                                                                                                                             | `null`                 |
| `float`       | floating-point number, 4 bytes (about 6 significant digits); GraphQL `Float`                                                                                                                                                     | `null`                 |
| `double`      | floating-point number, 8 bytes (about 15 significant digits); GraphQL `Float`                                                                                                                                                    | `null`                 |
| `boolean`     | true / false                                                                                                                                                                                                                     | `null`                 |
| `date`        | calendar date, no time                                                                                                                                                                                                           | `null`                 |
| `datetime`    | point in time (UTC)                                                                                                                                                                                                              | `null`                 |
| `time`        | time of day, no date and no time zone; `HH:MM` or `HH:MM:SS` (24-hour) in, always `HH:MM:SS` out; GraphQL scalar `Time` (a string)                                                                                               | `null`                 |
| `json`        | free JSON (e.g. a list of tags)                                                                                                                                                                                                  | `null`                 |
| `media`       | one file from the media library (`file_library.id`)                                                                                                                                                                              | `null`                 |
| `component`   | nested group of fields in its own table                                                                                                                                                                                          | `null`                 |

Value ranges and limits are in [canonical-values.md](../global/reference/canonical-values.md) "Number field types", "Time values" and "Enum options". A value of the wrong form or out of range is refused on write with 400. Each new type filters and sorts like an existing one: `biginteger`, `float` and `double` as numbers (condition kind `decimal`), `time` and `enumeration` as text (condition kind `string`; `HH:MM:SS` sorts in time order).

Column types are chosen by the SQL generator; see [Migrations](#migrations).

### Type-specific keys

Allowed only on the type named; anywhere else they are `schema.invalid`. Both are metadata only, like `width`: changing them generates a comment-only migration (no DDL) and updates the stored definition.

| Key        | On                       | Type             | Meaning                                                                                                                                                                                                      |
| ---------- | ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unsigned` | `integer`                | boolean          | `true`: the API refuses a negative value (range in canonical-values "Number field types"); the column stays `integer`. Default `false`.                                                                      |
| `options`  | `enumeration` (required) | array of strings | The allowed values, in the order the admin shows them; limits in canonical-values "Enum options". The API refuses a value not in the list. A field changed to `enumeration` keeps any stored value as it is. |

A stored value the current keys no longer allow (a negative number after `unsigned` is set, a value removed from `options`) is still read and returned as stored; the next save of that document must change it, or it is refused like any other bad value.

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
  "name": "experiences",
  "component": "experience",
  "type": "component",
  "repeatable": true,
  "fields": [{ "name": "company", "type": "text" }]
}
```

- `name` is the API key and the column source (`experiences`). `component`
  (required on a component, rejected on any other field) names the table:
  its snake_case form must pass the field identifier rules (error path
  `fields[i].component`). Two sibling components with the same value are
  `identifier.collision`.

- `repeatable: true` makes it an ordered list (stored with `order_index`).
  Omitted or `false` means at most one entry.
- `titleField` and `subtitleField` (CM-14) are optional on a component with
  `repeatable: true`: each is the `name` of a direct child field (not a field
  of a nested component) whose type has a one-line text form (`canTitleItem`:
  `text`, `string`, `enumeration`, `integer`, `biginteger`, `decimal`,
  `float`, `double`, `date`, `datetime`, `time`). cms-admin shows the title
  (and the subtitle) in the collapsed item header. Metadata only, like
  `width`: a change plans a comment-only migration and stored documents are
  unchanged.
- Components are defined inline and owned by their parent: there is no
  reuse between types and no link table. Deleting a parent row deletes its
  component rows (`ON DELETE CASCADE`).
- Components nest at most **3 levels** below the root (SPEC §6):
  root → level 1 → level 2 → level 3.

## Naming

A `snapshot.json` written before `component` existed is read with
`component = name` on every component field, so it plans to the table names it
was generated with (the migration planner then pairs them with the new names).
Source schemas never get this fallback.

Field names are what the API uses as property names. Write them in
camelCase (`teamSize`); snake_case is accepted too. The SQL name is the
snake_case form.

| Object                 | Rule                                              | page-cv-a example                  |
| ---------------------- | ------------------------------------------------- | ---------------------------------- |
| Column                 | field name, each capital becomes `_` + lowercase  | `teamSize` → `team_size`           |
| Root table             | slug with `-` → `_`                               | `page-cv-a` → `page_cv_a`          |
| Component table        | parent table + `__` + `component` value column    | `page_cv_a__experience__role`      |
| Primary key            | `<table>_pk`                                      | `page_cv_a_pk`                     |
| Draft / published uniq | `<root>_draft_uq`, `<root>_published_uq`          | `page_cv_a_published_uq`           |
| Published list index   | `<root>_published_idx`                            | `page_cv_a_published_idx`          |
| Parent FK / index      | `<component>_parent_fk`, `<component>_parent_idx` | `page_cv_a__experience_parent_idx` |
| Media FK               | `<table>_<column>_media_fk`                       | `post_cover_image_media_fk`        |

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

| `rule`                     | Rejected when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.invalid`           | The shape is wrong: missing or unknown key, wrong value type, unknown `type`, a component without `fields` or `component`, `fields`/`repeatable`/`component` on a non-component, `width` on a component or outside `1/3`, `1/2`, `full`, an empty field list; `titleField` or `subtitleField` (CM-14; path `fields[i].titleField` / `fields[i].subtitleField`) on a component that is not repeatable, naming no direct child or a child whose type has no one-line text form (`boolean`, `richtext`, `json`, `media`, `component`), or a `subtitleField` without a `titleField` or equal to it, and either key on a scalar field (unknown key); `unsigned` on a type other than `integer`; `default` on `media` or `component`, `null`, or not a value the field accepts (CM-11; path `fields[i].default`); `options` on a type other than `enumeration`, an `enumeration` without `options`, or `options` empty, over the entry limit, holding two equal entries, or holding an entry that is empty, longer than the limit or has leading or trailing whitespace (path `fields[i].options`, or `fields[i].options[j]` for one entry). |
| `identifier.invalid`       | The slug is not kebab-case, or a field's SQL name fails `^[a-z][a-z0-9_]*$`, contains `__` or ends with `_` (so: no capital first letter, digit first, `-`, spaces, non-ASCII).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `display_name.invalid`     | `displayName` is empty, has leading or trailing whitespace, holds a line break or another control character, or is longer than 60 Unicode code points (an emoji counts once). The path is `displayName`, or `fields[i].displayName` for a field. A missing type-level key is `schema.invalid`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `identifier.reserved`      | A field's SQL name is an engine-owned column (above, plus `status`) or a Postgres reserved word (`order`, `user`, `select`, ...); a component field's `name` is exempt from the reserved-word check only (it is an API key with no column; its table segment is the `component` value, which keeps every check). A slug may not map to a reserved word.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `identifier.too_long`      | A composed table, column, index or constraint name is longer than **63 bytes** (Postgres would silently truncate it). The generator never truncates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `identifier.collision`     | Two fields at the same level map to the same SQL name (`teamSize` and `team_size`), or two generated table/index/constraint names are equal in the `content` schema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `component.depth_exceeded` | A component sits deeper than level 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Length budget: the longest suffix decides. A root table may be at most 49
bytes (`_published_idx` adds 14), a component table at most 52 bytes
(`_parent_idx` adds 11). Shape errors are reported alone; length and
collision checks run only once every name is well formed.

## Worked example: `page-cv-a`

`apps/cms-api/content/schemas/page-cv-a.json` (a collection of CV pages, no
web reader yet). A component field carries its `component` value, which names
its table; `width` is `1/3`, `1/2` or `full`:

```json
{
  "slug": "page-cv-a",
  "kind": "collection",
  "draftAndPublish": true,
  "fields": [
    { "name": "position", "type": "text", "width": "1/3" },
    { "name": "isMain", "type": "boolean", "width": "1/3" },
    { "name": "name", "type": "text", "width": "1/3" },
    { "name": "summary", "type": "richtext" },
    {
      "name": "experiences",
      "type": "component",
      "component": "experience",
      "repeatable": true,
      "fields": [
        { "name": "company", "type": "text", "width": "1/2", "sensitive": true },
        {
          "name": "roles",
          "type": "component",
          "component": "role",
          "repeatable": true,
          "fields": [
            { "name": "teamSize", "type": "integer", "width": "1/3" },
            { "name": "techStacks", "type": "json" }
          ]
        }
      ]
    }
  ]
}
```

(Shortened: the real file also has `skills`, `projects` and, as a single
component, `educations`, plus `languages` and `references` since 0018.) It produces 8 tables (acceptance criterion 16):

```
page_cv_a                      root: name, position, is_main, summary
page_cv_a__skill               skill, level
page_cv_a__experience          company, location, period
page_cv_a__experience__role    position, period, team_size, projects, tech_stacks, responsibilities
page_cv_a__project             name, team_size, role, live_link, repository_link, tech_stack, responsibilities
page_cv_a__education           degree, institution, period, location
page_cv_a__language            language, level
page_cv_a__reference           name, role, phone
```

`header` uses the same table naming (`header__nav__sub_navigation`).

Sensitive fields: `profile` `address`, `phone`, `email`, `github`, and
`page-cv-a` `experiences.company` and `references.phone`. Integration specs that need a type deeper
than depth 2 use a fixture definition inside the spec, never a repo schema.

## Data-migration notes

Generated migration files are never edited; what a migration does not carry
over is written here. A data step (`content:generate --data-step <file>`, see
"content:generate") is the way to keep data across a restructure: it moves the
data before the destructive statements run, and the entry here names the
migration and what it carries.

### `0006_content.sql` (cv-page schema format)

- Resume and header: component tables renamed to the component path
  (`ALTER TABLE ... RENAME`, constraints and indexes included); rows are kept.
- `cv_page.company` dropped: its values are not carried over (the root field
  is now `name`, added empty).
- `cv_page__experience__role.projects` (a text column) dropped: its values are
  not carried over; projects are now rows of the new table
  `cv_page__experience__role__project`, created empty.
- Table `cv_page__project` (the old top-level `project` component) dropped with
  its rows: they are not carried over to the new nested table.
- `cv_page__experience.period` added empty. The cv-page `skill`, `experience`,
  `education`, `language` and `reference` tables keep their names and rows (the
  API field names are now plural: `skills`, `experiences`, `educations`,
  `languages`, `references`).
- Applied with `content:generate --allow-destructive` (accepted by the user,
  2026-11-05).

### `0007_content.sql` (cv-page `referees` renamed `references`)

- Comments only, no DDL: the field keeps its component `reference`, so the
  table `cv_page__reference` and its rows stay. Component rows are keyed by
  table and parent, not by field name (drafts and published copies are rows of
  the same tables), so existing rows are read under `references` with no data
  loss and no re-save needed. Clients that send or query `referees` for
  `cv-page` must use `references`; `resume` keeps `referees`.

### `0014_content.sql` (public-site content types reshaped, Q-PS7)

- Dropped with their rows (written with `content:generate --allow-destructive`,
  accepted by the user, 2026-11-15; no data is carried over): `cv-contact`,
  `cv-page`, `resume`, `site-text`, `module-sign-in`, `module-page-status` and
  `cv-page-text`, each with its component tables. A rename is a drop and a
  create: `module-sign-in` became `module-auth`, `module-page-status` became
  `module-status`, `cv-page-text` became `page-cv-text`, all created empty.
- `profile.photo` dropped; the old `profile` collection becomes a single; migration
  0014 keeps every existing row (it does not delete extra rows), so remove surplus
  `profile` rows by hand where an environment has more than one.
- New empty types: `module-auth`, `module-status`, `page-cv-text`; `header`
  gains `navLabel`, `navCvLink`, `notFoundTitle`, `notFoundDescription`.
- The stacks reseed from the web mocks; production content is entered again
  in cms-admin.

### `0016_content.sql` (`page-cv-text` renamed to `cv-common-text`, Q-PS7)

- A rename is a drop and a create (written with `content:generate
--allow-destructive`, accepted by the user, 2026-11-16): `page-cv-text` and
  its component tables are dropped with their rows; `cv-common-text` is created
  empty. No data is carried over; enter the texts again in cms-admin. The SDL
  has `cvCommonText`, no `pageCvText`.

### `0017_header_restructure.sql` (header restructure, ADR 0026, Q-HR1..Q-HR6)

- Written with a data step (`--data-step`, no `--allow-destructive`); the step
  is the file's only copy, between `-- Data step (begin)` and `(end)`.
- Carried: `header.name` into `app_name` (draft and published rows);
  `header__nav__sub_navigation` rows into `header__nav__sub_nav` (same
  `component_uid`, `parent_id`, `order_index`, `title`, `link`, `requires_role`);
  a non-empty `header.nav_cv_link` into a first `header__nav` row (`link`
  `/cv`, `requires_role` `public`, one `component_uid` per document, the other
  rows move down by one); `not_found_title` and `not_found_description` into
  the new single type `module-not-found` (one new `document_id` per header
  document).
- Discarded: `header.nav_label` (user, 2026-11-19; the header has one nav
  landmark). `header.app_icon` is added empty.
- Value check: empty `requires_role` and `level` strings become null; a stored
  `requires_role` (nav, sub navigation) outside `public`, `owner`, `admin`,
  `editor`, or a `page-cv-a` skill `level` outside its options, stops the
  migration with the table, document id and value. Fix those in cms-admin
  before deploying.
- Release note: back up the database first; release cms-api before web.

### `0018_page_cv_languages_references.sql` (`page-cv-a` languages and references)

- Additive only: tables `page_cv_a__language` and `page_cv_a__reference`, and
  column `cv_common_text.phone`. No data step; existing rows are untouched.

### `0019_drop_open_cms.sql` (`module-auth.openCms` dropped, Q-HC3, WEB-12)

- Destructive: `DROP COLUMN module_auth.open_cms`. The text was a link label to
  cms-admin that nobody keeps (user decision 2026-11-19, Q-HC3); web no longer
  asks for it. No data step; the dropped text is not kept.
- Release note: back up the database first; release cms-api after web stops
  asking for the field.

### `0020_cv_common_text_print.sql` (`cv-common-text.print`, Q-CP4)

- Additive: `ADD COLUMN print` (nullable text) on `content.cv_common_text`. No
  data step; the owner fills the print button label in production.

## Migrations

Content tables are never created at runtime. Changes go through two
commands (run from `apps/cms-api`):

```bash
pnpm content:generate                     # build, diff, write content/migrations/NNNN_content.sql
pnpm content:generate -- --dry-run        # print the SQL and destructive changes, write nothing
pnpm content:generate -- --name add_github --allow-destructive
pnpm content:generate -- --name restructure --data-step step.sql   # keep data across a destructive change
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
   `richtext`, `kind`, `unsigned`, `options`, `default`) still writes a comment-only migration so the
   `_content_types` row gets updated.

| Change                                  | SQL                                            | Destructive? |
| --------------------------------------- | ---------------------------------------------- | ------------ |
| New content type / component            | `CREATE TABLE` + indexes                       | no           |
| New field                               | `ADD COLUMN` (nullable)                        | no           |
| Field type with a different column type | `ALTER COLUMN … TYPE … USING col::t`           | yes          |
| Removed field                           | `DROP COLUMN`                                  | yes          |
| Removed component / content type        | `DROP TABLE` (children first)                  | yes          |
| Renamed field                           | drop + add; data kept only through a data step | yes          |

Statement order in a migration: renames, creates and added columns; the data
step; then the destructive statements (type changes, dropped columns, dropped
tables children first).

`--data-step <file>` is a SQL file the developer writes: top comment lines
`-- carries <target>` (data moved elsewhere in this migration) or
`-- discards <target>: <who decided, date>`, then `INSERT`, `UPDATE`, `DELETE`,
`SELECT` and `DO` blocks. `<target>` is `<table>.<column>` or `<table>`, as in
the destructive change list. The file is refused when it has no statement,
holds `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `TRUNCATE`, `DROP`, `ALTER` or
`CREATE`, has a `discards` without a reason, declares a target that is not a
destructive change of the plan, or the content types have no change. It is
written verbatim between `-- Data step (begin)` and `-- Data step (end)`, after
`-- Carries` / `-- Discards` header lines; the input file is not committed. It
runs in the runner's one transaction: a raising statement rolls back the whole
`content:migrate` run. A field that becomes an enumeration or whose `options`
shrink gets a `DO` block that raises on a stored value outside the options.

Destructive changes fail with the list of changes unless the data step declares
each of them (the error lists only the undeclared ones) or `--allow-destructive`
is passed (test data only). Review the SQL with `--dry-run` first; `--dry-run`
and `--check` print the full file with the data step.

### Column types

| Field type                                  | Column                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `string`, `text`, `richtext`, `enumeration` | `text` (`enumeration`: no Postgres enum type or `CHECK`; the API checks `options`) |
| `integer`, `media`                          | `integer`                                                                          |
| `biginteger`                                | `bigint`                                                                           |
| `decimal`                                   | `numeric` (no fixed precision)                                                     |
| `float`                                     | `real`                                                                             |
| `double`                                    | `double precision`                                                                 |
| `boolean`                                   | `boolean`                                                                          |
| `date`                                      | `date`                                                                             |
| `datetime`                                  | `timestamptz`                                                                      |
| `time`                                      | `time` (without time zone)                                                         |
| `json`                                      | `jsonb`                                                                            |

All field columns are nullable: `required` is enforced by the API (drafts may
be incomplete), not by `NOT NULL`. Not generated yet: the `media` FK to
`public.file_library` and the `created_by`/`updated_by` FKs to
`public.accounts`, because those tables arrive with Prisma. The
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
parsed); serialization and masking belong to the API layer.

**Operations** (`ContentRepository` port, Kysely adapter `KyselyContentRepository`; all per slug, all take the caller's `UnitOfWork`):

| Method                                                   | Behaviour                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insertTree(unit, slug, input)`                          | Inserts the root row (`documentId`, `publishedAt` null = draft) and the whole tree. A sent `componentUid` is kept (publish clones), else a new one. |
| `loadTrees(unit, slug, { status, documentIds? })`        | 1 query for the roots, then 1 per component table whose parents have rows (`parent_id = ANY($1::int[])`), ordered by `order_index`.                 |
| `replaceTree(unit, slug, { documentId, status }, input)` | Locks the root row, updates it in place, then syncs each component list that is present in the input (see below).                                   |

`loadComponentTrees(db, root, rootIds)` (`adapters/TreeLoader.adapter.ts`) is exported for read
paths that select roots themselves (filters, pagination).

**replaceTree rules** (decisions):

- Present keys are authoritative, absent keys are untouched: a value key
  overwrites the column (send `null` to clear), a component list replaces
  the stored list of that parent. Omitting a key never deletes data, so a
  client that does not see a field (masking) cannot wipe it.
- In a list, an item whose `componentUid` matches a stored item of the
  same parent and field is updated in place (id and uid kept, `order_index`
  = its position). An item without a uid is inserted with a new UUID. Stored
  items not sent back are deleted, and their subtrees cascade.
- A `componentUid` that is not stored under that parent and field is
  rejected (`tree.unknown_uid`), never inserted or matched elsewhere, so a
  request cannot reach another root's rows. Deletes are also scoped by
  `parent_id`.
- Version bump and OCC, publish cloning are the caller's job.

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
