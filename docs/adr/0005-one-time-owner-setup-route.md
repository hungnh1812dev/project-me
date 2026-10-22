# ADR 0005: One-time owner setup route guarded by a setup token

- Status: accepted (2026-10-22; user answered Q-OS1..Q-OS4 in `SPEC.md` §14)
- Date: 2026-10-22
- Amends: SPEC D1, success criterion §12-1, Q2 (invite-only)

## Context

SPEC D1 made `owner:bootstrap` (CLI) the only way to create the owner, and §12-1 required that no HTTP route can create one. On k3s that CLI runs through `kubectl exec` into the cms-api pod (or a one-shot Job). The user rejects both for first install and chose a first-run setup page in the admin console, like Strapi's, open only while no owner exists and guarded by a setup token kept in a k8s Secret.

The risk D1 addressed (finding C1, "first verified user becomes owner") is a race: whoever reaches a fresh install first takes it over. Any setup route must keep that race closed.

## Decision

- `GET /api/v1/setup/status` (`{ open }`) and `POST /api/v1/setup/owner` (`{ setupToken, email, displayName?, password }` -> `201 { email }`), in the `identity` module.
- Open only while `OWNER_SETUP_TOKEN` is set and no live owner exists; otherwise the submit route answers 404. The token (>= 32 bytes in production) is compared by SHA-256 digest with `timingSafeEqual`, before any body parsing or password hashing.
- Route and CLI share `bootstrapOwner()` (advisory lock, owner-exists check, single-owner partial unique index), so exactly one owner can exist whatever the mix of callers.
- No session is issued by setup; the owner signs in through the normal login.
- `owner.created` (both channels) and `owner.setup_rejected` audit rows.
- `owner:bootstrap` stays as a fallback. No new table: the owner row is the setup state.

Full contract: [docs/modules/owner-setup.md](../modules/owner-setup.md).

Alternatives rejected:

- Open setup with no token (Strapi's default): reopens C1; on a public domain a scanner can win the race between rollout and the operator's first visit.
- One-shot Job or `kubectl exec` running the CLI: rejected by the user (operational friction).
- Owner email and password from the Secret, created at boot: the password would sit in the Secret and in pod env for the pod's lifetime, and changing it later would leave a stale value there.
- A persisted "setup completed" flag: needs a schema change and adds a second source of truth; the owner row plus removing the token after setup closes the route.
- Auto sign-in after setup: a second path that issues sessions, outside the login throttles and the login audit row.

## Consequences

- §12-1 becomes: the owner can be created once, by the CLI or by the setup route with a valid token; no other HTTP route creates an owner, and the setup route answers 404 once an owner exists.
- The operator must remove `OWNER_SETUP_TOKEN` after setup; cms-api warns at boot while it is still set and an owner exists. If an owner row is ever deleted in SQL while a token is still configured, setup reopens to whoever has the token.
- The status route tells anyone that a fresh instance is waiting for setup. Accepted: the window is short and the token is still required.
- The identity module gains an unauthenticated write route: security review (security-qc) is required before later work builds on it.
