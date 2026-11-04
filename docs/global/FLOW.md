---
summary: Processes every change and every release goes through
replaces: §13 Launch gate
---

# Global flows

Part of the [project spec](../../SPEC.md). Flows of one app: `docs/apps/<app>/FLOW.md`; the steps of one business flow: `docs/flows/<flow>/FLOW.md`. Each section says where it applies.

## Where a change goes

Applies to: all flows.

1. Find the flow in the Docs table of the [project spec](../../SPEC.md), and its modules in `MODULES.md`.
2. Before changing anything, read the rules that apply: [RULES.md](RULES.md), the `RULES.md` of each app the change touches (`docs/apps/<app>/`), and the flow's `RULES.md` and `FLOW.md`.
3. A new or changed requirement goes into the flow's `SPEC.md`, updated in place, plus one Change log line; a new journey gets a new `docs/flows/<flow>/` folder with `SPEC.md`, `FLOW.md` and `RULES.md`.
4. A rule or process shared by every flow of one app goes into that app's `RULES.md` or `FLOW.md`; one shared by several flows across apps goes here or into [RULES.md](RULES.md), naming the flows it applies to.
5. A new decision goes into the `SPEC.md` (Decisions) of the flow or app that owns it, or into [DECISIONS.md](DECISIONS.md) when it covers several apps; then the rules that follow from it are written into the matching `RULES.md`.
6. Run `.claude/bin/module-index`; `--check` must print nothing.

## Launch gate

Applies to: all flows.

**Launch gate (added 2026-10-27, user decision).** The project goes live for real, so security must hold for any public visitor, not only recruiters. Before any public launch, phase LG (tasks/plan.md) must pass:

1. A whole-project security review by security-qc (opus): static over every app, package, script, CI workflow and deploy guide; dynamic on the full tier 3 stack.
2. A live check of the deployed site: response headers (CSP with nonce, HSTS, nosniff, Referrer-Policy, frame-ancestors, no `X-Powered-By`), TLS and HTTP->HTTPS redirect, auth (no self-registration, login/refresh/logout and the refresh cookie flags, 2FA, rate limits, setup route closed), masking (anonymous and reviewer responses and the server-rendered HTML carry no raw sensitive value), injection (richtext XSS, GraphQL limits and introspection off, filter and path input, CORS).
3. Every launch blocker on the LG list decided by the user.

The live check runs on the production config before the site is public (a staging host with the production config is allowed), with a throwaway admin account (2FA on) the user disables afterwards; write probes run only before the site is public and their test data is deleted; an OWASP ZAP passive baseline scan is allowed after the user is asked again right before it runs; the multer advisory is closed by a pnpm override kept only if unit, integration and tier 3 tests pass (user answers Q-LG1..Q-LG5, 2026-10-27). Exit: no open critical or high finding; each medium finding fixed or accepted by the user in writing. The manager asks the user before any launch.
