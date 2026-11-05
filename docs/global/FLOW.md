---
summary: Processes every change and every release goes through
replaces: §13 Launch gate
---

# Global flows

Part of the [project spec](../../SPEC.md). Flows of one app: `docs/apps/<app>/FLOW.md`; the steps of one business flow: `docs/flows/<flow>/FLOW.md`. A section that covers only some flows names them in an `Applies to:` line; no line means all flows.

## Where a change goes

1. Find the flow in the Docs table of the [project spec](../../SPEC.md), and its modules in [docs/modules/MODULES.md](../modules/MODULES.md).
2. Before changing anything, read the rules that apply: [RULES.md](RULES.md), the `RULES.md` of each app the change touches (`docs/apps/<app>/`), and the flow's `RULES.md` and `FLOW.md`.
3. A new or changed requirement goes into the flow's `SPEC.md`, updated in place (the change itself goes into the change log, step 6); a new journey gets a new `docs/flows/<flow>/` folder with `SPEC.md`, `FLOW.md` and `RULES.md`.
4. A rule or process shared by every flow of one app goes into that app's `RULES.md` or `FLOW.md`; one shared by several flows across apps goes here or into [RULES.md](RULES.md). A section that covers only some flows names them in an `Applies to:` line; no line means all flows.
5. A new decision goes into the `SPEC.md` (Decisions) of the flow or app that owns it, or into [DECISIONS.md](DECISIONS.md) when it covers several apps, as a paragraph starting `**D<n> <Title>.**` (the index in `DECISIONS.md` is generated from it); then the rules that follow from it are written into the matching `RULES.md`.

Each fact is written once, in the doc that owns it (a requirement in its flow's `SPEC.md`, a rule in its `RULES.md`, a value in `reference/`, a design in its ADR). Other docs refer to it by id (D21, PS-3, criterion 25, ADR 0018 §2) and never restate it, so a change edits one doc. 6. Record the change for the next release in [CHANGELOG.md](../../CHANGELOG.md) (section below). 7. Run `.claude/bin/module-index`; `--check` must print nothing.

## Versions and change log

1. **Versions.** The repo version (root `package.json`) names a release and follows Semantic Versioning: patch for fixes, minor for new features, major for breaking changes. Each app in `apps/` keeps its own semver in its `package.json`, bumped in a release by the `release-tag` skill with the major, minor or patch step the user picks for it, or kept with `none` ([ADR 0016](../adr/0016-tag-driven-release-ci.md)). `packages/base-config` and `packages/form-commons` keep their own versions and change only when the package itself is released.
2. **Change log.** Every release gets one entry at the top of [CHANGELOG.md](../../CHANGELOG.md): the repo version and date, the version of each app and package (and whether it changed), then the lists New features, Changes, Bug fixes, and DevOps patches. Each item names the app it touches and links the flow or module doc it changed. A change that is not released yet goes under `## Unreleased` until the release.
3. **Docs.** A flow, app or module with no doc yet gets one (`docs/flows/<flow>/`, `docs/apps/<app>/`, `.claude/bin/module-index --new <folder>`). An existing doc is updated in place with the change.
4. **DevOps changes.** When a change needs the deploy repo to change (configuration, Secrets, routes, probes, workloads, the rollout order), update the matching page of [docs/deployments/](../deployments/devops-runbook.md) to the new target state, **and** write `patch-<name>-<repo version>.md` in the doc folder of the app, flow or module the change belongs to (for example `docs/apps/web/patch-web-0.0.2.md`, `docs/flows/media/patch-media-0.0.2.md`). The patch lists only what the deploy repo must change from the previous release: each item with its deploy repo object, the change and a link to its target state, then the order, the checks and the rollback. The change log entry links every patch of the release.
5. **Release.** A release is the `release-tag` skill, run in two sittings ([ADR 0016](../adr/0016-tag-driven-release-ci.md)). On `develop`: review the changes since the previous `v*` tag, pick the repo and app bumps, write the versions and the `CHANGELOG.md` entry (the `## Unreleased` items move under the new version heading), run `.claude/bin/module-index --check` and `pnpm format:check`, and make the release commit, which reaches `main` through the normal develop -> staging -> main pull requests. On `main` after the merge: run the skill again to create the repo tag `v<x.y.z>` and one `<app>@<x.y.z>` tag per bumped app; the skill asks before it pushes them.

## Launch gate

**Launch gate (added 2026-10-27, user decision).** The project goes live for real, so security must hold for any public visitor, not only recruiters. Before any public launch, phase LG (tasks/plan.md) must pass:

1. A whole-project security review by security-qc (opus): static over every app, package, script, CI workflow and deploy guide; dynamic on the full tier 3 stack.
2. A live check of the deployed site: response headers (CSP with nonce, HSTS, nosniff, Referrer-Policy, frame-ancestors, no `X-Powered-By`), TLS and HTTP->HTTPS redirect, auth (no self-registration, login/refresh/logout and the refresh cookie flags, 2FA, rate limits, setup route closed), masking (anonymous and reviewer responses and the server-rendered HTML carry no raw sensitive value), injection (richtext XSS, GraphQL limits and introspection off, filter and path input, CORS).
3. Every launch blocker on the LG list decided by the user.

The live check runs on the production config before the site is public (a staging host with the production config is allowed), with a throwaway admin account (2FA on) the user disables afterwards; write probes run only before the site is public and their test data is deleted; an OWASP ZAP passive baseline scan is allowed after the user is asked again right before it runs; the multer advisory is closed by a pnpm override kept only if unit, integration and tier 3 tests pass (user answers Q-LG1..Q-LG5, 2026-10-27). Exit: no open critical or high finding; each medium finding fixed or accepted by the user in writing. The manager asks the user before any launch.
