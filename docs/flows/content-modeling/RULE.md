# Content modeling: rules

Part of the [project spec](../../../SPEC.md). Flow `content-modeling`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Apply schema changes only by a generated, reviewed migration run by the migration command or Job, never at request time (D10).
2. Identifiers follow `^[a-z][a-z0-9_]*$`, at most 63 bytes after composition; the generator fails, never truncates, on a longer name or a collision ([canonical-values.md](../../global/canonical-values.md), [data-model.md](../../global/data-model.md) §8.2).
3. Components nest at most 3 levels ([canonical-values.md](../../global/canonical-values.md)).
4. Check `:slug` against the content type registry before any SQL is built ([api-contract.md](../../global/api-contract.md)).
5. Commit the printed GraphQL SDL with the schema change (D18).

## Must never

1. Let Prisma see or migrate the `content` schema (D10).
2. Make a destructive change (drop or rename a field) without `--allow-destructive` and a written data-migration note (D10).
3. Interpolate identifiers or slugs into SQL ([boundaries](../../global/boundaries.md)).
4. Add `_lnk` tables: components are owned exclusively ([data-model.md](../../global/data-model.md) §8.2).

## Ask first

- DB schema changes outside the current task ([boundaries](../../global/boundaries.md)).

## Global decisions this flow follows

D19 (migrator role), D18 (SDL, decision in [public-site](../public-site/RULE.md)).

## Decisions owned by this flow

**D10 Content engine.** One engine for all content types: JSON schema → validated definition → generated SQL migration in PG schema `content`, applied by a migration command/Job, never at request time. Prisma owns only `public`, so Prisma migrate never sees content tables or proposes a drift reset. Adding a schema = generate → review the migration → deploy; nothing happens "automatically on file drop". Destructive changes (drop or rename a field) need an explicit `--allow-destructive` flag and a written data-migration note.
