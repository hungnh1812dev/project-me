# Features
Order: provisional (migrated 2026-10-30 from the phase board); the planner confirms it with `PLAN` and writes `## Features (build order)` in `tasks/plan.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email · Q6 owner reviewer-session log reuses the audit log · UI: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only)

| # | Feature | Status | Folder | Apps / packages | Base | Summary |
|---|---|---|---|---|---|---|
| 1 | reviewer-toggle | in-progress | features/reviewer-toggle/ | apps/cms-api, apps/web, docs/deployment | 5bfd7b2 | - |
| 2 | backup | todo | features/backup/ | apps/cms-api, apps/cms-admin, docs/deployment | f4c4690 | - |
| 3 | ci | todo | features/ci/ | .github | 9db3759 | - |
| 4 | mf | todo | features/mf/ | apps/cms-admin, apps/web (planner to confirm) | - | - |
| 5 | launch-gate | todo | features/launch-gate/ | whole project | 9d6a334 | - |

Bases 1, 2, 3 and 5 are the parent of the oldest commit of the feature's tasks (from `tasks/done.md`); feature histories interleave, so a `base..HEAD` diff also holds other features' commits. Folders 2-5 were pre-created during the migration to keep their open state; the manager keeps their content when it opens them.

## Follow-ups
- Remove the multer pnpm override once Nest pins multer >= 2.5.0 -> core-builder, unscheduled.
- Hardening (optional, not findings): `SubjectCatalog.nonSensitiveFields` falls back to all fields for an unknown slug (core-builder); `ContactCard` EMAIL_SHAPE accepts `?`, `&` (apps/web/src/features/cv/ContactCard.tsx) (ui-builder) -> unscheduled.
- `scripts/docs/architecture/{build,notes}.py` still list old cms-admin paths (`features/registry.ts` -> `Features.registry.ts`); regenerate docs/architecture -> core-builder, unscheduled.
- Test gaps: access guards, the four management services and AnonymousActorService have no unit spec; e2e flakiness on a shared stack (TwoFactor, content-presence) -> run on a fresh stack; spec isolation unscheduled.
- conventions.md is over ~10 KB; user decided to keep Tooling and smoke/e2e procedures there until a docs page covers them.
