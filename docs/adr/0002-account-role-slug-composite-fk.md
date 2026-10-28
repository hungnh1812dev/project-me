# ADR 0002: accounts.role_slug kept in sync by a composite FK

- Status: accepted (T08, approved by user 2026-10-20)
- Date: 2026-10-20

## Context

SPEC D1 requires a partial unique index
`ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL`, while
SPEC §8.1 lists `accounts.role_id` as the role FK and no `role_slug` column.
A partial index can only look at its own table's columns, so the owner check
needs the slug on `accounts`.

## Decision

`accounts` has both `role_id` and `role_slug`. `roles` has
`UNIQUE (id, slug)`, and `accounts (role_id, role_slug)` references
`roles (id, slug)` (`ON DELETE RESTRICT ON UPDATE CASCADE`). The database
guarantees the two columns always name the same role, and the D1 index works
as written.

Alternatives rejected:

- An `is_owner` boolean: a second source of truth with nothing tying it to
  the role.
- A trigger checking the owner count: not race-free without extra locking;
  a unique index is.
- Referencing `roles(slug)` only: drops `role_id`, which §8.1 lists.

## Consequences

- Code assigns a role by connecting the relation (`role: { connect: ... }`);
  Prisma writes both columns.
- System role slugs cannot change (trigger), so the cascade only matters for
  custom roles.
