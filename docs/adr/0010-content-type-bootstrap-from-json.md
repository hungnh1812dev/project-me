# ADR 0010: Content types from JSON definitions at start-up

- Status: accepted for planning (2026-10-27). User answers Q-CT1..Q-CT7 are recorded under "Open questions"; Variant A was chosen. Q-CT8 answered: the new CV type's slug is `resume`. No question is open.
- Date: 2026-10-27
- Asked by: the user (handoff, "Planner job: DESIGN content-type bootstrap", 2026-10-27): cms-api must create its content types from JSON config files at start-up (init container). The files in question are the four in `.claude/state/parked/`: `common-text.json`, `cv-contact.json`, `cv-page-new.json`, `header.json`.
- Amends: nothing. Variant A (Q-CT2) leaves the definition format and the `GET /content-types` view as they are; Variant B below stays on record as a possible follow-up only.

## Context

### What cms-api does today (checked on the repo, 2026-10-27)

Yes, cms-api already creates its content types from JSON files, and the init container is the step that applies them. The flow (SPEC §7 D10, `docs/modules/content-schema.md`):

1. **Author time.** One file per type in `apps/cms-api/content/schemas/<slug>.json` (today `cv-page.json`, `profile.json`). `pnpm content:generate` validates them (`domain/DefinitionSchema.rules.ts`, `domain/DefinitionValidator.rules.ts`), diffs them against `content/migrations/snapshot.json` and writes the next `content/migrations/NNNN_<label>.sql` plus the new snapshot. Destructive changes need `--allow-destructive`. The SQL and the snapshot are reviewed and committed.
2. **CI.** `.github/workflows/cms-api.yml` runs `content:generate -- --check` (fails when a schema changed without its migration) and `graphql:print-schema -- --check`.
3. **Image.** `apps/cms-api/Dockerfile` copies `content/` (schemas, migrations, snapshot) next to `dist/`.
4. **Start-up.** The init container runs `npm run deploy:migrate` = `db:migrate` (Prisma, seed) then `content:migrate` (`cli/ContentMigrate.command.ts` -> `adapters/MigrationRunner.adapter.ts`): one transaction under `pg_advisory_xact_lock`; creates schema `content` and the bookkeeping tables, applies pending migrations (checksum and order checked), upserts `content._content_types` from `snapshot.json` and deletes rows of removed types. The API container starts only after it exits 0. Wired in `docker-compose.smoke.yml` (service `cms-api-init`, checked by `scripts/smoke/init-container.sh`) and in `docs/deployment/k3s-traefik.md` §3 (`initContainers: migrate`).
5. **Runtime.** `ContentRegistry.service.ts` loads the registry from `_content_types`; REST, GraphQL, access and the admin read it from there.

So the init container does not read `content/schemas/*.json` itself: it applies the committed migrations and syncs the type rows from the snapshot that was generated from those JSON files. A new JSON file has effect only after `content:generate` has been run and its migration committed. That is deliberate: D10 says "Adding a schema means generate -> review the migration -> deploy. Nothing happens automatically on file drop", and SPEC §2 lists runtime DDL as v2 backlog.

### Why the four parked files do not load today

They use a different format. Run through the built validator (`validateDefinitions`), every file fails on shape:

| Parked file uses                  | Current format                                                                                  | Effect                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| top-level `name` ("Common Text")  | no display name; the admin nav shows the slug (`useContentNavItems.ts`)                         | unknown key, rejected      |
| `draftToPublish`                  | `draftAndPublish`                                                                               | unknown key + missing key  |
| field `width: "50%"`              | no layout hints; the admin form is one column                                                   | unknown key, rejected      |
| component `component: "skill"`    | components are inline and owned by their parent; table names come from the field path, no reuse | unknown key, rejected      |
| `type: "number"` (`teamSize`)     | `integer` or `decimal`                                                                          | invalid type               |
| `type: "text"` for name, email... | `text` exists (long plain text); one-line text is `string`                                      | valid, but maybe not meant |
| field `references` (cv-page-new)  | `references` is a reserved SQL word                                                             | `identifier.reserved`      |
| field `responsitoryLink`          | `cv-page.json` spells it `repositoryLink`                                                       | valid, looks like a typo   |

With only mechanical changes (drop `name`, `width`, `component`; `draftToPublish` -> `draftAndPublish`; `number` -> `integer`; `text` -> `string`; `references` renamed), all four pass together with `cv-page.json` and `profile.json`. Nesting stays within the 3-level limit; the longest table is `cv_page_new__experiences__roles__projects`. Tables produced: `common_text`; `cv_contact`; `cv_page_new` + `__skills`, `__experiences`, `__experiences__roles`, `__experiences__roles__projects`, `__educations`, `__languages`, and the renamed references table; `header` + `__nav`, `__nav__sub_navigations`, `__author`.

## Decision

### 1. Mechanism: keep the generate -> commit -> init-container flow (no new start-up code)

The init container keeps running `deploy:migrate` unchanged. We do **not** add a start-up step that reads `content/schemas/*.json` and creates or alters tables directly, because it would:

- skip the reviewed SQL and the `--allow-destructive` gate (a renamed field would drop a column with data on the next pod start);
- lose the checksum and order guarantees of `_migrations` and make two replicas or a rollback race on DDL;
- contradict SPEC D10 and the v2 backlog line in SPEC §2.

Mounting definitions at run time (e.g. a ConfigMap) is out for the same reason; the definitions ship in the image. If the user wants it anyway, it is a SPEC change (Q-CT1).

Optional hardening (Q-CT6): make `content:migrate` refuse to run when the image's `content/schemas` differ from `snapshot.json` (reuse `checkContentMigrations` from `ContentGenerate.command.ts`), so a file added without `content:generate` fails the init container loudly instead of being silently ignored. CI already blocks this on the main branch; the check only adds value for images built outside CI.

### 2. Bringing the four parked files in

The files become ordinary definitions in `apps/cms-api/content/schemas/` and go through `content:generate` like any other. Two variants, chosen by Q-CT2:

- **Variant A (recommended for v1): convert to the current format.** No product code changes. Display name, `width` and `component` are dropped; the admin keeps showing the slug and a one-column form.
- **Variant B: extend the format with presentation hints.** Two optional, additive keys that never affect SQL, the API data or GraphQL (only the definition hash, which produces a comment-only migration that updates `_content_types`):
  - top level `displayName` (string, 1-60 chars). Not `name`: on fields `name` is the API name, and one word must keep one meaning.
  - field `width`: `"half" | "full"`, default `"full"`. An enum rather than free percentages, so the admin maps it to its existing grid tokens and an invalid value fails validation. The parked `"50%"` becomes `"half"`.
  - `component` (a component name separate from the field name) is not adopted in either variant: components have no identity outside their parent, so a second name would be unused.

### Module ownership

| Responsibility                                        | Owner (one module)                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Definition format, validation, SQL, migrations, apply | cms-api `content-engine` (domain rules, adapters, CLIs)                           |
| Start-up step                                         | the existing init container (`deploy:migrate`); no new owner                      |
| `GET /content-types` view (Variant B fields)          | cms-api `content-types` (`domain/ContentTypeView.rules.ts`)                       |
| Admin model of a content type (Variant B)             | cms-admin `features/content-types` (`ContentTypes.api.ts`)                        |
| Admin nav label and form layout (Variant B)           | cms-admin `features/content` (`useContentNavItems.ts`, `DynamicFormRenderer.tsx`) |

### Target file map

Variant A (one core-builder task, content files only):

- `apps/cms-api/content/schemas/common-text.json`, `cv-contact.json`, `resume.json` (from the parked `cv-page-new.json`; Q-CT4, Q-CT8), `header.json` (new)
- `apps/cms-api/content/migrations/0003_<label>.sql` (generated), `content/migrations/snapshot.json` (generated)
- `apps/cms-api/content/schema.graphql` (re-printed by `graphql:print-schema`)

Variant B adds, before the Variant A task:

- cms-api (core-builder, 5 files): `content-engine/domain/DefinitionSchema.rules.ts` (two optional keys), `content-engine/domain/ContentEngine.constants.ts` (`FIELD_WIDTHS`, `DISPLAY_NAME_MAX_LENGTH`), `content-types/domain/ContentTypeView.rules.ts` (+ its `.rules.spec.ts` and `.contract.spec.ts`: `displayName: string | null` on the type, `width` on content fields, both additive), `docs/modules/content-schema.md`.
- cms-admin (ui-builder, 4 files): `features/content-types/ContentTypes.api.ts` (model), `features/content/useContentNavItems.ts` (`displayName ?? slug`), `features/content/FieldTree.rules.ts` (carry `width`), `features/content/DynamicFormRenderer.tsx` (two-column grid for `half`, one column on small screens).

Every list stays within §4.4 (no new files except the definitions and the generated migration).

### Extension path

- **Next content type:** add one `content/schemas/<slug>.json`, run `pnpm content:generate`, commit the SQL, snapshot and re-printed `schema.graphql`. No code change; the init container applies it on the next deploy. Permissions for the new type are granted in the admin (no seed per type).
- **Next presentation hint (Variant B):** one optional key in `DefinitionSchema.rules.ts`, one additive field on `ContentFieldView`, one read in the admin renderer. SQL generation is untouched.

## Consequences

- No change to the init container, the Dockerfile, the compose files or the k8s manifests.
- New types are not readable by `public` or `reviewer` until a role grants them (current access rules), so `apps/web` sees nothing until then.
- Doc fix found while checking: `docs/deployment/k3s-traefik.md` line 109 says `content:migrate` "parse[s] and merge[s] `content/schemas`"; it reads only `content/migrations` (SQL + snapshot). Same in the Dockerfile comment (line 30-31). Core-builder docs fix.

## Tasks (in `tasks/todo.md`, "Direct request: content types from the parked JSON files (CT)")

- **CT3 (core-builder):** add the four converted definitions (CV type as `resume`) to `apps/cms-api/content/schemas/`, generate `0003_site_content_types.sql` and the snapshot, re-print `content/schema.graphql`.
- **CT-doc (core-builder, no deps):** correct the `content:migrate` description in `docs/deployment/k3s-traefik.md` and the `apps/cms-api/Dockerfile` comment.
- CT1 and CT2 (Variant B) are not scheduled. CT4 (e2e of the new types) is optional and not written; the manager may ask for it after CT3.

## Open questions

Answered by the user (2026-10-27):

- **Q-CT1** Keep the generate -> commit -> init-container flow: **yes**.
- **Q-CT2** **Variant A**: convert the four files; no code change.
- **Q-CT3** One-line `text` fields become `string`: **yes** (recommendation accepted).
- **Q-CT4** Add the CV type **next to** `cv-page` (keep `cv-page`), slug `cv`, replaced by `resume` in Q-CT8 because `cv` cannot be used.
- **Q-CT5** `references` -> **`referees`**; `responsitoryLink` -> **`repositoryLink`**.
- **Q-CT6** No start-up drift check (recommendation accepted).
- **Q-CT7** `teamSize` -> `integer` (recommendation accepted).

- **Q-CT8** **`resume`** (user, 2026-10-27): REST `/api/v1/documents/resume`, permission subject `resume`, GraphQL types `Resume` / `ResumePage` and queries `resume` / `resumeList`, tables `resume` and `resume__*`. The migration name `0003_site_content_types.sql` does not depend on the slug. Background: the slug `cv` clashes in GraphQL. A collection's list type is `<Type>Page`, so `cv` produces `CvPage`, which is already the object type of `cv-page`. Checked with the built `buildGraphqlSchema` on 2026-10-27: `GraphQL name "CvPage" is generated by both content type "cv" and content type "cv-page"`. The REST and SQL sides accept `cv`; only GraphQL fails, and `graphql:print-schema -- --check` in CI would fail too. Options: (a) another slug, checked clash-free: `resume` (GraphQL `Resume`, `ResumePage`, query `resume` / `resumeList`) or `cv-new`; (b) keep `cv` and replace `cv-page` (destructive, which the user ruled out in Q-CT4); (c) keep `cv` and rename the GraphQL list wrapper suffix (a breaking GraphQL change in cms-api code, outside Variant A). Recommended: (a) `resume`. Trade-off: the slug is permanent (REST path, permission subject, GraphQL names), and `resume` is clear but differs from the `cv-*` names of the other types. The planner's earlier example `cv` in Q-CT4 was not checked against GraphQL; this question corrects it.
