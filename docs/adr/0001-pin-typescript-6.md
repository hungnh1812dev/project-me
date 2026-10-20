# ADR 0001: Pin TypeScript to 6.0.x

- Status: accepted (T01)
- Date: 2026-10-20

## Context

TypeScript 7.0 (the native port) is the current `latest` on npm. The lint
stack in SPEC §10 uses ESLint per project, and typed linting for TS sources
needs `typescript-eslint`. Its current release (8.72) declares the peer range
`typescript >=4.8.4 <6.1.0`. Other planned tools (NestJS CLI, tsup `dts`) also
rely on the classic compiler API.

## Decision

Every project pins `typescript` to `6.0.3` (exact version, per project, as a
dev dependency). `tsconfig.base.json` targets options that are valid in both
6.x and 7.x so the upgrade is a version bump.

## Consequences

- Lint, type-check and build tools work with supported peer ranges.
- Revisit when `typescript-eslint` supports TypeScript 7; upgrade all projects
  in one change.
