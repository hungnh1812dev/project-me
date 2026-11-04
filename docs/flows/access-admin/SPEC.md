---
flow: access-admin
replaces: D6, §14 Q2, §14 Q7, §14 Q8, §14 Q9, §14 Q11, §14 Q12, §14 Q13
summary: Accounts and invitations, roles and the permission matrix, API tokens
---

# Access administration: spec

Part of the [project spec](../../../SPEC.md). Flow `access-admin`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

## Behaviour

Admins and the owner invite accounts, enable and disable them, revoke their sessions, create custom roles, edit a role's permissions in the permission matrix (subjects from the content type catalog), and create, update and revoke API tokens. Accounts exist only by invitation (Q2). Every action follows the rank rule (D6); API tokens follow D5; permission rows may carry conditions in the DSL of [data-model.md](../../global/reference/data-model.md) §8.3.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) rows "Accounts", "Roles", "API tokens", "Content types". Values (ranks, custom rank range, actions): [canonical-values.md](../../global/reference/canonical-values.md).

## Requirements

D5, D6 and the conditions DSL (§8.3), plus the decisions below. New requirements of this flow go here with ids `AA-<n>`.

## Acceptance

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 2, 6, 7, 11.

## Decisions

**D6 Role hierarchy (C7).** Manage an account, assign a role or edit a role's permissions only when target rank < actor rank. No "created by me" exception. System roles' slug and rank are immutable. Only one account can hold `owner`.

| # | Question | Recommendation |
|---|---|---|
| Q2 | Confirm self-registration is removed in v1 (invite-only)? | Yes |
| Q7 | Re-enabling a disabled account: which status does it get? | `active` if it has a password, else `invited` (an invitee disabled before setting a password can still use the invite flow) |
| Q8 | Which permission may resend an invite? | `accounts:create` (it issues an invitation, like invite); D6 rank rule applies |
| Q9 | Invite throttle values (invite + resend share one counter)? | 10 / hour per actor and 20 / hour per IP, in-memory like the other limits |
| Q11 | Paginate `GET /roles` too? The invite role picker, the matrix and the caller-access hint need the full list. | No: full list, custom roles capped at 50 (`409 ROLE_LIMIT_REACHED`) |
| Q12 | Filters or search on the accounts list now? | None in v1 (few accounts); add `status` filter later if needed |
| Q13 | Confirm dialogs for Enable and Resend invite in the admin UI? | None (both reversible, no data loss); keep the confirm on Disable |

## Out of scope

SSO and self-registration ([out of scope](../../../SPEC.md)).

## Open questions

None.

## Change log

- 2026-11-04 Flow folder created from the old SPEC (D5, D6, §9, Q2, Q7..Q9, Q11..Q13).
