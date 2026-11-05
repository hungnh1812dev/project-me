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

## Acceptance

Global success criterion of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 16.

## Decisions

**D10 Content engine.** One engine for all content types: JSON schema → validated definition → generated SQL migration in PG schema `content`, applied by a migration command/Job, never at request time. Prisma owns only `public`, so Prisma migrate never sees content tables or proposes a drift reset. Adding a schema = generate → review the migration → deploy; nothing happens "automatically on file drop". Destructive changes (drop or rename a field) need an explicit `--allow-destructive` flag and a written data-migration note.

Q1 (Kysely for content queries) is global: [DECISIONS.md](../../global/DECISIONS.md).

## Out of scope

Group 2 owner-private runtime DDL ([out of scope](../../../SPEC.md)).

## Open questions

None.
