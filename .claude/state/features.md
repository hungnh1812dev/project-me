# Features
Order: provisional (migrated 2026-10-30 from the phase board); the planner confirms it with `PLAN` and writes `## Features (build order)` in `tasks/plan.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email · Q6 owner reviewer-session log reuses the audit log · UI: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned) · Q7 reviewer-toggle PAUSED by user (its uncommitted state kept); web reviewer removal goes into new feature `web-bff-hardening` (planner to reconcile with reviewer-toggle) · Q8 iNet.vn 4xx check SKIPPED by user, resume when project is live (not in the plan) · Q9 husky + lint-staged approved as root devDependencies; pre-commit formats staged source; feature goes FIRST in the build order, before web-bff-hardening · Q-BFF1 cms-api public route moves to admin.domain.com/api · Q-BFF2 homepage `/` shows ONLY the service status view (like cms-admin); CV moves to `/cv`; /status and WEB_STATUS_PAGE_ENABLED removed (planner to reconcile the spec, which currently says CV + status card) · Q-BFF3 Turnstile on both 2FA steps · Q-BFF4 web login reuses the reviewer Turnstile keys · Q10 husky task HK-1 approved on 4 files incl. root README.md (git hooks note) · Q11 pre-commit Tooling line added to conventions.md · Q-BFF5 approved deletion of web reviewer files, /status and Graphql.client.ts (builder asks again before each delete)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only)

| # | Feature | Status | Folder | Apps / packages | Base | Summary |
|---|---|---|---|---|---|---|
| 1 | husky-precommit | done | features/husky-precommit/ | root package.json, .husky/, pnpm-lock.yaml, README.md | 4f21466 | features/husky-precommit/SUMMARY.md |
| 2 | reviewer-toggle | blocked (paused by user 2026-10-31; resume after admin-ui-refresh) | features/reviewer-toggle/ | apps/cms-api, apps/cms-admin (notice), docs/deployment (reviewer mode moved to reviewer-console) | 5bfd7b2 | only the SEC-1 recheck (CRVOFF-25, CRVOFF-21) left |
| 3 | admin-ui-refresh | done | features/admin-ui-refresh/ | apps/cms-admin, packages/form-commons, apps/cms-api (media + content-engine), apps/web (sanitizer, Q-UI8) | 6ec6aa48 | features/admin-ui-refresh/SUMMARY.md |
| 4 | web-bff-hardening | todo | features/web-bff-hardening/ | apps/web, apps/e2e, apps/cms-api (no code change), docker-compose.smoke.yml, scripts/, docs/deployment, docs/local-run.md | 4f21466 | - |
| 5 | reviewer-console | todo | features/reviewer-console/ | apps/cms-admin, apps/cms-api, apps/e2e, docker-compose.smoke.yml, scripts/, docs/deployment | - | - |
| 6 | backup | todo | features/backup/ | apps/cms-api, apps/cms-admin, docs/deployment | f4c4690 | - |
| 7 | ci | todo | features/ci/ | .github | 9db3759 | - |
| 8 | mf | todo | features/mf/ | apps/cms-admin, apps/web (planner to confirm after web-bff-hardening) | - | - |
| 9 | launch-gate | todo | features/launch-gate/ | whole project | 9d6a334 | - |

Bases 1, 2, 3 and 5 are the parent of the oldest commit of the feature's tasks (from `tasks/done.md`); feature histories interleave, so a `base..HEAD` diff also holds other features' commits. Folders 2-5 were pre-created during the migration to keep their open state; the manager keeps their content when it opens them.

## Follow-ups
- Media file route GET /media-files/:fileName has no per-IP throttle (admin-ui-refresh UIL-10, user decision while the local provider is smoke/dev only); add one if the local provider is ever allowed beyond smoke/dev -> unscheduled.
- Remove the multer pnpm override once Nest pins multer >= 2.5.0 -> core-builder, unscheduled.
- Hardening (optional, not findings): `SubjectCatalog.nonSensitiveFields` falls back to all fields for an unknown slug (core-builder); `ContactCard` EMAIL_SHAPE accepts `?`, `&` (apps/web/src/features/cv/ContactCard.tsx) (ui-builder) -> unscheduled.
- `scripts/docs/architecture/{build,notes}.py` still list old cms-admin paths (`features/registry.ts` -> `Features.registry.ts`); regenerate docs/architecture -> core-builder, unscheduled.
- Test gaps: access guards, the four management services and AnonymousActorService have no unit spec; e2e flakiness on a shared stack (TwoFactor, content-presence) -> run on a fresh stack; spec isolation unscheduled.
- iNet.vn reports apps/web returning 4xx (origin degraded, IP still answers) -> user deferred until the project is live; not planned.
- conventions.md is over ~10 KB; user decided to keep Tooling and smoke/e2e procedures there until a docs page covers them.
