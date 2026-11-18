# Content modeling: rules

Part of the [project spec](../../../SPEC.md). Flow `content-modeling`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Apply schema changes only by a generated, reviewed migration run by the migration command or Job, never at request time (D10).
2. Identifiers follow `^[a-z][a-z0-9_]*$`, at most 63 bytes after composition; the generator fails, never truncates, on a longer name or a collision ([canonical-values.md](../../global/reference/canonical-values.md), [data-model.md](../../global/reference/data-model.md) §8.2).
3. Components nest at most 3 levels ([canonical-values.md](../../global/reference/canonical-values.md)).
4. Commit the printed GraphQL SDL with the schema change (D18).
5. Name component tables and GraphQL component types from the `component` values of the path, never from field names; a field's `name` is only its API key and column name (CM-2, CM-4, ADR 0019).
6. To keep a component table's data, change a field's `name` and its `component` value in separate migrations: one of them alone is a rename or a plain column diff, both at once is a drop plus a create (CM-5).

## Must never

1. Let Prisma see or migrate the `content` schema (D10).
2. Make a destructive change (drop or rename a field) without `--allow-destructive` and a written data-migration note (D10).
3. Add `_lnk` tables: components are owned exclusively ([data-model.md](../../global/reference/data-model.md) §8.2).

## Also follows

- [global/RULES.md](../../global/RULES.md): boundaries (no identifiers in SQL; ask before DB schema changes outside the task).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): database roles (D19), `:slug` checked against the registry.
