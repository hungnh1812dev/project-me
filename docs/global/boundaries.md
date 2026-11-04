# Boundaries

Part of the [project spec](../../SPEC.md); moved from the old SPEC §13. Global: it applies to every flow in `docs/flows/`.

**Launch gate (added 2026-10-27, user decision).** The project goes live for real, so security must hold for any public visitor, not only recruiters. Before any public launch, phase LG (tasks/plan.md) must pass:

1. A whole-project security review by security-qc (opus): static over every app, package, script, CI workflow and deploy guide; dynamic on the full tier 3 stack.
2. A live check of the deployed site: response headers (CSP with nonce, HSTS, nosniff, Referrer-Policy, frame-ancestors, no `X-Powered-By`), TLS and HTTP->HTTPS redirect, auth (no self-registration, login/refresh/logout and the refresh cookie flags, 2FA, rate limits, setup route closed), masking (anonymous and reviewer responses and the server-rendered HTML carry no raw sensitive value), injection (richtext XSS, GraphQL limits and introspection off, filter and path input, CORS).
3. Every launch blocker on the LG list decided by the user.

The live check runs on the production config before the site is public (a staging host with the production config is allowed), with a throwaway admin account (2FA on) the user disables afterwards; write probes run only before the site is public and their test data is deleted; an OWASP ZAP passive baseline scan is allowed after the user is asked again right before it runs; the multer advisory is closed by a pnpm override kept only if unit, integration and tier 3 tests pass (user answers Q-LG1..Q-LG5, 2026-10-27). Exit: no open critical or high finding; each medium finding fixed or accepted by the user in writing. The manager asks the user before any launch.

- **Always:** write tests with each task · run Prettier, lint and typecheck before committing · use constants/config, not literals · route every record payload through the serializer · use parameterized SQL · keep `.env.example` in step with config.
- **Ask first:** adding any dependency not listed in §3 · DB schema changes outside the current task · changing a canonical value in §6 · changing a decision in §7 · CI/deploy changes · deleting files.
- **Never:** make the site public (public DNS record, public ingress or announced URL) before the launch gate (phase LG, above) has passed and the user has approved the launch in writing · read or edit `.env*` (except `.env.example`) · commit secrets · interpolate identifiers or slugs into SQL · build v2 backlog items · trust client-supplied permissions/`_maskedFields` · log OTPs, tokens or passwords in production · add AI attribution to commits.
