# Handoff
Updated: 2026-10-25 after trim (phase R4 closed and archived; finished R-phase lines and older unscheduled follow-ups moved to `archive/handoff-trim-2026-10-25.md`)

## In progress / next
- CR-hc-2 committed f252559; CR1 checkpoint passed (user, 2026-10-25). Health spec lint fix committed f88242c. CR-ce-1 committed 3e58fe8 (includes cli/generate.spec.ts and registry.service.spec.ts import paths). CR-ce-2 committed 5ed2ff5 (security and qc pass). Next: CR-dc-1. Follow-ups: MigrationDb.adapter pool silences idle-connection errors without logging (builder note) · password.spec.ts timing-ratio test flaky under load (identity, qc run 1) -> user decides on the limit.
- CR-dc-1 documents domain/ and http/ moves - committed 0228f1e (board: qc pass, security pass). User (2026-10-25): accepted as done; no builder for it. Working tree had no staged or modified product files at the state check.
- CR-gq-1 graphql http moves - reset to todo (user, 2026-10-25); no working-tree changes existed.
- Bookkeeping (user, 2026-10-25): conventions.md and handoff.md changes (trim plus CR lines for committed work) go in one separate bookkeeping commit, after user approval.
- Planner REVISE job (user, 2026-10-25): see "## Planner job: REVISE CR (2026-10-25)" below.
- CR-ce-2 content-engine ports, adapters, content transaction runner - awaiting security-qc and commit; next: CR-dc-1
- CR-pf-6 domain constants for the Prisma enums - awaiting security-qc and commit; next: CR-00 or the next CR task
- CR-pf-5 TransactionRunner port and Prisma runner - awaiting security-qc and commit; next: CR-pf-6 or next CR task
- CR-pf-4 platform splits and AppLogger port - awaiting checks/commit; next: CR-pf-5 or the next CR task
- CR-pf-3 LAYER_RULES and the layer guard - awaiting checks/commit; next: CR-pf-4
- CR-pf-2 layer-aware import graph and pinned-path table - awaiting security-qc and commit; next: CR-pf-3
- CR-pf-1 DomainError, describeError, kind-to-status table - awaiting security-qc and commit; next: CR-pf-2
- ET1 expired API token PATCH 409 - awaiting security-qc and commit; next: ET2 (ui-builder)
- ET2 cms-admin hides Edit on expired tokens - awaiting checks/commit; next: ET3 (qc)
- Planner job `DESIGN nest-cli-defaults` (user decisions, 2026-10-25): NestJS scope = all CLI defaults (nest build, start:prod/start:debug scripts, scaffold tsconfig, nest-cli.json, dev watch). Building with `nest build` is allowed if the plan shows dist/main.js, Dockerfile, smoke stack and CI keep working. Next.js (apps/web): no change now; standalone output, security headers, API rewrite, custom ports and agentRules false stay. The planner reconciles DV1b (in progress).
- Phase DV closed 2026-10-25 (checkpoint approved): DV1 b3fbc13, DV1b 5c50f23, DV1c 38647bb. Smoke stack torn down. Section in archive/board-archive-DV-2026-10-25.md.
- Planner request: cms architecture and side-menu. Planner DONE: ADR 0006/0007/0008, docs/modules/admin-navigation.md, phases CA, DV, SM, FN, MF in tasks/todo.md and board.md.
  - User decision (2026-10-25): micro-frontend option A (packages per feature, built together); purpose = boundaries and per-feature build.
  - User decision: cms-api `application/` may use only `@Injectable` and `@Inject`.
  - User decision: naming rule covers every TS package.
  - User decision: all remaining planner defaults accepted: CA2 domain/application/adapters/http; CA3 no Prisma types in domain or application; CA4 blanket rename approval for CR tasks (whole-file deletions still asked); FN2 new files now, existing files move once with their CR/MF task; FN3 components keep PascalName.tsx; FN4 hooks query / mutation / state; FN5 ADR 0008 table as written; FN6 web .query.ts -> .graphql.ts; SM1 single-type link to /content/:slug; SM2 "Roles and permissions" (/roles), "Accounts" label -> "Users" (route stays); SM3 Security settings and Sign out in bottom user block; SM4 no collapsible menu in v1; DV1 tsc --watch + node --watch-path; DV2 add start:cms-api:dev, root start:dev includes cms-api (needs local Postgres); MF3 admin first, web after the CV page.
  - User decision: cms-api is audit first, then refactor.
  - User decision: micro-frontend, planner proposes options, user picks.
  - User decision: cms-api `start:dev` loads `.env.local` (never read `.env*`).
  - User decision: side-menu groups as written: content-types (single-types, collection-types), utils (file libraries), system settings (API tokens, permissions, users, roles, reviewer, ...).
  - User rule (file naming): `<use (for react hook)><Pascal Name>.<function>.<ext>`, `<function>` from setup | module | query | client | service | ... (user's list; more may follow). Planner to confirm.
- Phase 5 (Media): checkpoint pending user review. No phase-level REGRESSION / PHASE run yet; ask at checkpoint.
- Phase 6: phase checks not run yet (T38 done).
- D1 open: SOPS flow untested on a cluster; try once on a scratch namespace.
- OS4 browser walk: the user walks the open-state steps on a fresh smoke stack (wrong token, validation, valid submit, owner sign-in, /setup redirect after setup, storage/URL check). Do not work around the qc browser typing block.

- CA1a (user, 2026-10-25): run security-qc on the existing qc audit `.claude/state/findings/audit-2026-10-25-qc.md`; no restart. Security review is opus per task (high-risk).

- User decision (2026-10-25, from CA1b security): an expired API token is treated like a revoked one; PATCH /api-tokens/:id on an expired token returns 409 (no new expiresAt). Routed as a direct request.
- CA1b follow-up for CR (core-builder): record-serializer.architecture.spec.ts hard-codes paths and filename suffixes for http/ files; match on the http/ folder instead (F2 from CA1b-security.md).

## Planner job: REVISE CR (2026-10-25)
User decisions in force: file granularity (code-standards §4.4; cms-api ADR 0006 §7.13), test tiers (skill test-tiers; commands in project.md). No product code in this job.
a. Revise the target file map and file list of every CR task still todo (after CR-dc-1 through CR-rv-2) to follow §4.4. Report file count per module before and after. The L8 maps in `.claude/state/findings/AUDIT-CA*.md` are superseded where they conflict. Keep every security note, behavior rule and verify step. Set each task's expected test tier.
b. Add behavior-preserving consolidation tasks, one commit each, after CR-rv-2 and before CR-cl-1:
   - CR-cs-1: health + content-types
   - CR-cs-2: platform files of CR-pf-1..6 (common/, infrastructure/, architecture/)
   - CR-cs-3: content-engine; Security gate: yes
   Each updates pinned paths (source-paths.constants.ts, layer-rules.constants.ts lists, eslint.config.mjs exceptions), docs/modules/*.md and test imports; integration and architecture suites unchanged. Tier 1 unless a tier 3 path is touched.
c. Add infra task DEV-STACK (core-builder), right after CR-dc-1 (so after the current done row, before CR-dc-2): `pnpm dev:stack` (scripts/dev-stack.sh) per test-tiers tier 2:
   - Postgres and Mailpit from ready images only, no image build; own compose project name; never touch abyss-smoke or any other stack;
   - db:migrate + content:migrate + e2e account seeding (reuse smoke seeding code, do not copy it);
   - cms-api, cms-admin and web in dev mode, wait until each answers;
   - write the e2e vars file so `pnpm e2e:spec` runs against it; a stop command;
   - env only from `.localEnv.agent` (create with generated dev-only values if missing; key names only in the matching .env.example files);
   - update project.md (`dev stack` line, remove "not built yet"), conventions.md and apps/e2e/README.md;
   - verify: `pnpm dev:stack`, then one auth spec and one media spec pass with `pnpm e2e:spec`; report start-up time against `SMOKE_E2E=1 pnpm smoke`.
   Checks: qc-cli tier 2. Risk: normal.
d. List any other app or package (apps/web, apps/cms-admin, packages/*) whose files break §4.4. Report only; no tasks added.
e. Fix duplicate item number "11." in ADR 0006 §7 without changing numbers other files cite (§7.12, §7.13), so Prettier passes. ADR 0006 is uncommitted: include it in this job's commit.
f. Fix double bullet "- - cms-admin:" in conventions.md.
Rules for the builders after this job: behavior-preserving unless the task says otherwise; checks at the tier in Checks needed; one commit per task with user approval; a builder whose file list conflicts with §4.4 follows §4.4 and records the difference in current.md.
Result to the user before any further dispatch.
User answers to planner questions (2026-10-25), recorded for the revision:
- Q-R1: ports file is `<Module>.port.ts` (one per module), not `.ports.ts`. Planner aligns ADR 0006 §7.13 wording (and the maps) to this.
- Q-R2: files under 30 lines allowed for Nest entry points (guard, resolver, middleware, job) and for a single adapter that its layer forces into its own file.
- Q-R3: no ports for library calls without I/O (argon2, jsonwebtoken, otplib, node:crypto). Planner aligns ADR 0006 §1 ("crypto and library wrappers" in adapters/) with this.
- Q-R4: blanket approval for exactly the whole-file deletions listed under "Merged away" in each CR task. Other deletions still need approval.
Revision approval: pending (user).

## Direct requests
### ET expired API tokens are not editable (planner, 2026-10-25)
- User answers: Q-ET1 new `API_TOKEN_EXPIRED` (409, "The API token is expired.") · Q-ET2 block the whole PATCH on an expired token · Q-ET3 revoking an expired token stays 204 · Q-ET4 the guard uses the shared expiry rule in ET1.
- Shared rule: `apps/cms-api/src/modules/access/ApiTokenExpiry.rules.ts` `isApiTokenExpired(expiresAt, nowMs)`, `expires_at <= now`.
- Tasks: ET1 (core-builder) -> ET2 (ui-builder) -> ET3 (qc). Spec: SPEC §7 D5.

## Follow-ups (open, user action or risk only)
- CR-dc-1: documents `domain/` still imports values from other modules (`fieldTypeOf`, `joinFieldPath`, `RECORD_SYSTEM_*`, content-engine value parsers); the layer guard allows only `isComponentField` -> decide at CR-dc-3 when documents joins `MIGRATED_MODULES` (extend `DOMAIN_CROSS_MODULE_HELPERS` or move through ports). `record-serializer.architecture.spec` `BOUNDARY_FILE` suffix rule untouched -> CR-ac-1. SPEC.md:410 still names `documents/documents.controller.ts` (SPEC outside core scope) -> planner.
- CR-ce-2: `documents/bulk.service.ts` still holds its own savepoint statements (`bulk_item`); the runner's `runInSavepoint` copy is unused until CR-dc-3 moves bulk onto it, and `unitOfWorkFromContentTrx` goes then -> CR-dc-3. The task text asked for a `KNOWN_LAYER_VIOLATIONS` entry for it; the guard rejects entries of unmigrated modules, so none was added.
- CR-ce-2: `ContentRegistryProvider` / `RegistryService` stay as facade aliases of `ContentRegistry` / `ContentTypeRegistry` for unmigrated modules; drop each alias with the last consumer's CR task -> CR-cl-1
- CA5 user answers (2026-10-25): Q-CA5/Q-CA13 allow pure packages (zod, sanitize-html) in domain/, I/O banned · Q-CA6 allow import type and pure helpers along existing module edges · Q-CA7 add jobs/ layer · Q-CA14a move the four single-consumer infrastructure folders into owner modules · Q-CA9b SQL behind ports in the consumer module · Q-CA10 graphql rules and schema in http/ · Q-CA14b keep loadDefinitions and DEFAULT_CONTENT_PATHS on the content-engine facade · Q-CA14c concurrent delete returns 404 DOCUMENT_NOT_FOUND (marked planned change) · Q-CA15c access/<layer>/, access/management/<layer>/, access/document-auth/<layer>/ with its own index.ts · Q-CA16 add only resolver to ADR 0008 · Q-CA17 named LAYER_RULES exception with opaque RowFilter · Q-CA1..Q-CA4 and Q-FN1..Q-FN6 confirmed as recorded here. Q-CA8 moot (Q-CA14a yes). Q-CA12 and Q-CA15a/b/d per planner's recommendation in ADR 0006 §7.
- CA4 open decisions for CA5 / user (from AUDIT-CA4.md): Q-CA13 allow pure third-party libs (zod, sanitize-html, graphql) in domain/ (qc recommends yes with an allowlist) · Q-CA14 (a) move the four single-user infrastructure ports into their owner modules (recommended yes); (b) keep loadDefinitions and DEFAULT_CONTENT_PATHS on the content-engine facade (recommended no); (c) DocumentNotFoundError becomes DomainError(not_found) in the calling use case · Q-CA15 (a) classify platform roles by folder (recommended); (b) start the layer spec with MIGRATED_MODULES (recommended yes); (c) layout of access/management and document-auth; (d) keep ClientMeta as a type in common/http/client-meta.ts. Also AUD-CA4-9: a describeError(unknown) reader is needed so DomainError is not a 500 over GraphQL or in bulk items (security gate yes).
- CA3 open decisions for CA5 / user (from AUDIT-CA3.md): Q-CA10 graphql rules/ and schema/ depend on graphql-js, which domain forbids (qc recommends http/) · Q-CA11 keep the 19 bare 403/404 bodies as they are · Q-CA12 TransactionRunner shape and where DATABASE_HEALTH lives. CA3 pilot recommendation: content-types, with health as warm-up.
- CA2 open decisions for CA5 / user (from AUDIT-CA2.md): Q-CA7 jobs/ layer for scheduled entry points (qc recommends yes) · Q-CA8 allow domain/ to import platform port vocabulary such as MediaKind · Q-CA9 keep infrastructure/media and infrastructure/turnstile in place and reword ADR section 6, route reviewer account lifecycle through an access/identity facade · new error kind for HTTP 415 (unsupported_media_type proposed; ADR kind list has none).
- CHECK LATER (manager, 2026-10-25):
  - Commit decision on the audit reports `.claude/state/findings/AUDIT-CA1a.md` and `AUDIT-CA1b.md` (uncommitted; CA1a also has an unresolved Prettier flag).
  - ET2 manual walk (console, network, design guidelines) not done: owner password is random in the kept stack; re-run with credentials.
  - api-tokens e2e: "admin: only its own tokens" fails on a standalone rerun on the kept stack (likely two-factor spec changing the password); passes on a fresh full run.
  - CR follow-up: record-serializer architecture spec path/suffix rule (AUD-CA1b-7).
  - Audit gap noted by qc (CA1b): guards, the four management services and AnonymousActorService have no unit spec; e2e coverage not checked.
- CI first real run (T37e/T37f, R4-29 check names) unverified until the user pushes. Before that: confirm GitHub Environments (staging, production), branch restrictions and secrets -> user.
- Untested deploy pieces (T38): k8s manifests, real Traefik/Cloudflare client IP, rclone off-site upload, readOnlyRootFilesystem on admin, SOPS check -> user.
- Cloudinary: user must supply real CLOUDINARY_* values -> user.
- Production config: a DB-only config loader for `content:migrate` / `deploy:migrate`, and a DDL-capable migration role separate from the API runtime role -> owner decision.
- pnpm audit: 6 pre-existing advisories (2 high: body-parser DoS, multer DoS; 2 moderate and 2 low: fast-uri) -> separate dependency-bump task, user decides.
- Phase R2 security: API responses send only the CSP header; no `X-Content-Type-Options` -> decide with the user.
- CA1b F2: D3 architecture test (`record-serializer.architecture.spec.ts`) keys on fixed paths and the `.controller/.filter/.interceptor/.gateway` suffix; update paths with the move and make rule 2 also key on the `http/` folder -> CR-ac-1
- Browser walk gaps before a release (R3 coverage: authenticated pages and nav labels, date display, checkbox/switch/radio visuals, mobile dialog, Esc in login challenge and TOTP setup, read-only role variants, console checks on list pages) -> user, before release.
- conventions.md ~14.9 KB, over the ~10 KB limit. User decision: keep the Tooling and smoke/e2e procedures in conventions for now; revisit when a docs page covers them -> user.
- e2e flakiness on a shared stack (two-factor and content-presence specs) -> run on a fresh stack; spec isolation unscheduled.
