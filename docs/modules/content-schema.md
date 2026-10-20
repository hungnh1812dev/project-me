# Content schema format

A content type is defined in one JSON file per type under
`apps/cms-api/content/schemas/<slug>.json`. The content engine turns each file
into tables in the Postgres schema `content` (SPEC §8.2). Before any SQL is
generated, the definition must pass the validator.

| Piece                | File (in `apps/cms-api/src/modules/content-engine/`)              |
| -------------------- | ----------------------------------------------------------------- |
| Shape (Zod)          | `definition.schema.ts`                                            |
| Rules and errors     | `definition.validator.ts`                                         |
| SQL name assembly    | `naming.ts` (the only place names are built; T06/T07 must use it) |
| Limits, words, codes | `content-engine.constants.ts`                                     |

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

Column types are chosen by the SQL generator (T06), not by this format.

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
