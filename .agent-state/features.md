# Features
Order: planner PLAN of 2026-11-02 in `tasks/plan.md` `## Features (build order)`; user 2026-11-02: reviewer-toggle dropped, draft-publish built next (no SPEC section; what was built: `features/draft-publish/SUMMARY.md`; flow `docs/flows/content-editing/`)
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email · Q6 owner reviewer-session log reuses the audit log · UI: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned) · Q7 reviewer-toggle PAUSED by user (its uncommitted state kept); web reviewer removal goes into new feature `web-bff-hardening` (planner to reconcile with reviewer-toggle) · Q8 iNet.vn 4xx check SKIPPED by user, resume when project is live (not in the plan) · Q9 husky + lint-staged approved as root devDependencies; pre-commit formats staged source; feature goes FIRST in the build order, before web-bff-hardening · Q-BFF1 cms-api public route moves to admin.domain.com/api · Q-BFF2 homepage `/` shows ONLY the service status view (like cms-admin); CV moves to `/cv`; /status and WEB_STATUS_PAGE_ENABLED removed (planner to reconcile the spec, which currently says CV + status card) · Q-BFF3 Turnstile on both 2FA steps · Q-BFF4 web login reuses the reviewer Turnstile keys · Q10 husky task HK-1 approved on 4 files incl. root README.md (git hooks note) · Q11 pre-commit Tooling line added to conventions.md · Q-BFF5 approved deletion of web reviewer files, /status and Graphql.client.ts (builder asks again before each delete)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only)

| # | Feature | Status | Folder | Apps / packages | Base | Summary |
|---|---|---|---|---|---|---|
| 1 | husky-precommit | done | features/husky-precommit/ | root package.json, .husky/, pnpm-lock.yaml, README.md | 4f21466 | features/husky-precommit/SUMMARY.md |
| 3 | draft-publish | done | features/draft-publish/ | apps/cms-api (content-engine, content-types, documents, content schemas, migrations), apps/cms-admin, apps/e2e, docs/modules | 9fff1c8d | features/draft-publish/SUMMARY.md |
| 4 | reviewer-toggle | dropped (user 2026-11-02; folder kept as record; its SEC-1 checks CRVOFF-25, CRVOFF-21 moved to launch-gate LG-D) | features/reviewer-toggle/ | apps/cms-api, apps/cms-admin (notice), docs/deployments | 5bfd7b2 | - |
| 11 | media-upload-fixes | done (2026-11-03) | features/media-upload-fixes/ | apps/cms-api (media, Bootstrap.setup.ts, prisma migrations), apps/cms-admin (features/media, apis/client, configs/copy), packages/form-commons (media-input), docker-compose.smoke.yml, docs/deployments, docs/modules, apps/e2e (qc) | c47132ca | features/media-upload-fixes/SUMMARY.md |
| 5 | web-bff-hardening | todo | features/web-bff-hardening/ | apps/web, apps/e2e, apps/cms-api (no code change), docker-compose.smoke.yml, scripts/, docs/deployments, docs/local-run.md | 4f21466 | - |
| 12 | remember-me | todo (plan approved 2026-11-03; after web-bff-hardening; phase 2 only for apps/web) | features/remember-me/ | apps/cms-api (modules/identity, prisma), apps/cms-admin (login, auth, copy), apps/web (BFF auth, session, dialog), docs/modules, apps/e2e | - | - |
| 6 | reviewer-console | todo (after web-bff-hardening, draft-publish) | features/reviewer-console/ | apps/cms-admin, apps/cms-api, apps/e2e, docker-compose.smoke.yml, scripts/, docs/deployments | - | - |
| 7 | backup | todo | features/backup/ | apps/cms-api, apps/cms-admin, docs/deployments | f4c4690 | - |
| 8 | ci | done (2026-11-04) | features/ci/ | .github, scripts, .claude/skills/release-tag, docs/deployments, docs/apps (patch notes), CHANGELOG.md, docs/global/FLOW.md | 9db3759 | features/ci/SUMMARY.md |
| 9 | mf | todo | features/mf/ | apps/cms-admin, apps/web (planner to confirm after web-bff-hardening) | - | - |
| 10 | launch-gate | todo | features/launch-gate/ | whole project | 9d6a334 | - |
| 13 | deploy-docs | dropped (user 2026-11-04; folder kept as record, empty) | features/deploy-docs/ | docs/deployments | 1e7cab92 | - |

Bases 1, 2, 3 and 5 are the parent of the oldest commit of the feature's tasks (from `tasks/done.md`); feature histories interleave, so a `base..HEAD` diff also holds other features' commits. Folders 2-5 were pre-created during the migration to keep their open state; the manager keeps their content when it opens them.

## Follow-ups
- Media file route GET /media-files/:fileName has no per-IP throttle (admin-ui-refresh UIL-10, user decision while the local provider is smoke/dev only); add one if the local provider is ever allowed beyond smoke/dev -> unscheduled.
- Remove the multer pnpm override once Nest pins multer >= 2.5.0 -> core-builder, unscheduled.
- Hardening (optional, not findings): `SubjectCatalog.nonSensitiveFields` falls back to all fields for an unknown slug (core-builder); `ContactCard` EMAIL_SHAPE accepts `?`, `&` (apps/web/src/features/cv/ContactCard.tsx) (ui-builder) -> unscheduled.
- Test gaps: access guards, the four management services and AnonymousActorService have no unit spec; e2e flakiness on a shared stack (TwoFactor, content-presence) -> run on a fresh stack; spec isolation unscheduled.
- iNet.vn reports apps/web returning 4xx (origin degraded, IP still answers) -> user deferred until the project is live; not planned.
- conventions.md is over ~10 KB; user decided to keep Tooling and smoke/e2e procedures there until a docs page covers them.
- Edit page h1 overflows on a 60-character unbroken word (realistic names wrap fine; qc note from draft-publish CDPN-9) -> ui-builder, unscheduled.
- `content:migrate` decides which definitions to update by `definition_hash`; a database whose hashes match but whose definitions lack displayName would not be repaired (cannot happen through generate-then-migrate) -> core-builder, unscheduled.
- SEC-1 checks CRVOFF-25 and CRVOFF-21 (reviewer-toggle, dropped) run at launch gate LG-D -> launch-gate.
- media-upload-fixes: production deploy repo needs the same Traefik entrypoint readTimeout 5m, the api-upload route and the two Middleware objects (outside this repo; see docs/deployments/traefik.md) -> deploy-repo to-do, user side.
- ADR 0014: web and admin routers have no body-size or upload cap (bounded by the 5 min entrypoint readTimeout) -> left open by user 2026-11-03; add a cap later if wanted.
- ci: the release tag run does not gate publish on the dependency audit (repo job: format, `pnpm audit --prod --audit-level high`, pins-check, does not block publish-*); a tag run can push images while the audit fails. Predates ci -> backlog (user 2026-11-04), unscheduled.
- ci: record the first v0.0.2 tag run (image push, deploy-repo bump) when the user tags; REL-B passed with it deferred (user 2026-11-04) -> user, unscheduled.
- ci: docs/deployments/ci-cd.md section 8 parity table still has the old "Branch targets" row (reads stale, points to the new depth table) -> docs task, unscheduled.
