---
flow: content-modeling
summary: Content type JSON schemas to generated SQL migrations in the content schema, the registry and the GraphQL SDL
---

# Content modeling: spec

Part of the [project spec](../../../SPEC.md). Flow `content-modeling`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

A developer adds or changes a content type as a JSON schema in `apps/cms-api/content/schemas/`, generates the SQL migration and the GraphQL SDL, reviews and commits them, and the deploy applies them with `deploy:migrate`. At runtime the content registry resolves every slug before any SQL. The full decision is D10 in [RULE.md](RULE.md); the table shapes are in [data-model.md](../../global/data-model.md) §8.2.

Commands: [stack-and-commands.md](../../global/stack-and-commands.md) (`content:generate`, `content:migrate`).

## Requirements

D10 ([RULE.md](RULE.md)) and §8.2 of [data-model.md](../../global/data-model.md). New requirements of this flow go here with ids `CM-<n>`.

## Acceptance

Global success criterion of this flow ([success-criteria.md](../../global/success-criteria.md)): 16.

## Decisions

Q1 (Kysely for content queries) is global: [decisions.md](../../global/decisions.md).

## Out of scope

Group 2 owner-private runtime DDL ([out of scope](../../../SPEC.md)).

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D10, §8.2).
