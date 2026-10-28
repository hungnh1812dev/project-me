# Implementation Plan: Abyss Headless CMS & Portfolio (v1)

Spec: [../SPEC.md](../SPEC.md) · Tasks: [todo.md](todo.md) · Date: 2026-10-20

Task tracking: `tasks/todo.md` is the source list. When running with `claude --agent manager`, the manager copies tasks into `.claude/state/board.md` one phase at a time and dispatches them to the worker.

## Overview

v1 delivers a REST headless CMS (`cms-api`) with a read-only GraphQL query API for documents (D18), an admin app (`cms-admin`), a public CV site (`web`, Next.js 16, reads content through GraphQL) and a shared UI kit (`@abyss/form-commons`), with the security decisions D1–D18 in SPEC §7 built in from the start. GraphQL mutations, Group 2 runtime DDL, reviewer write sandbox and S3 are v2.

## How this plan differs from the old HTML plan

| Old plan | New plan | Why |
|---|---|---|
| Layers in order: 12 UI components → backend → frontends in Phase 6 | **Vertical slices**: each feature ships API + UI + tests together; UI components get built when a slice needs them | Something works end to end from week 1, and integration problems show up early |
| Dynamic schema engine in Phase 5 | **Content engine spike in Phase 1** | It's the highest-risk piece (63-byte names, migrations, tree writes), so fail fast |
| Docker/Traefik checks in Phase 7 | **Walking skeleton with Dockerfiles + proxy smoke test in Phase 0** | Catches CORS/308/CSP on day one |
| One e2e suite at the end (T6.08) | Tests inside every task, plus Playwright flows added per slice | Security ADRs are protected as they're built |
| Several tasks labelled XS/S that were really L–XL | Each task S/M and touching about 5 files or fewer | Fits one worker session |
| No tasks for role/account management, settings, cleanup jobs, rate limits | Added | They were missing |

## Architecture Decisions

All decisions are in SPEC §7 (D1–D17). The most consequential:
- **D10:** one content engine; content tables live in PG schema `content`; Prisma owns only `public`.
- **D3/D4:** field permissions are applied when the query is built, and the server computes the write allowlist.
- **D2:** reviewers are read-only and see published content only.
- **D1:** the owner is created by CLI only; no self-registration.
- **D14:** admin runs on its own subdomain; the refresh cookie is path-scoped and checked against `Origin`.

## Dependency Graph

```
Phase 0  platform skeleton ──────────────┬───────────────┬──────────────┐
         (repo, api, apps, ui-kit dist,  │               │              │
          docker + proxy smoke)          ▼               ▼              ▼
Phase 1                          content-engine     identity core   (ui-kit grows per slice)
                                 (schema → SQL →    (Phase 2)
                                  tree repo)             │
                                         │               ▼
Phase 3                                  │          access (roles, policy,
                                         │          masking, tokens, audit)
                                         ▼               │
Phase 4                          documents (CRUD, OCC, publish, presence) ◄┘
                                         │
Phase 5                          media ──┤
                                         ▼
Phase 6                          web + reviewer
Phase 7                          bulk (collections)
Phase 8                          hardening + deploy guide
```

Phases 1 and 2 can run in parallel if more than one worker is available. This project runs a single worker, so the order is Phase 1 → Phase 2.

## Task List (index; details in todo.md)

### Phase 0: Walking skeleton
- T01 Monorepo + tooling isolation
- T02 cms-api skeleton: config (Zod, prod guards), HTTP pipeline, health
- T03 @abyss/form-commons package (dist-only) + Button/TextInput/Field
- T04 cms-admin & web skeletons + Dockerfiles + proxy smoke test

**Checkpoint 0:** `pnpm turbo build test` green; docker compose with a Traefik-like proxy serves web, admin and API; trailing-slash POST is never 3xx.

### Phase 1: Content engine spike (highest risk first)
- T05 JSON schema format + definition validator
- T06 SQL migration generator + `content:migrate` (needs Q1)
- T07 Content tree repository (write/read root + 3 levels)

**Checkpoint 1:** `cv-page.json` → 8 tables; round-trip write/read of a 3-level tree; >63-byte name fails generation.

### Phase 2: Identity
- T08 Core Prisma schema, system roles seed, `owner:bootstrap`
- T09 Login + JWT + refresh rotation/reuse detection + logout (needs Q2)
- T10 Rate limiting + client IP resolution
- T11 Admin login slice (UI) + session handling in cms-admin
- T12 OTP service + invite/set-password + reset/change password
- T13 TOTP / email 2FA, API + UI (needs Q3)

**Checkpoint 2:** owner can bootstrap, log in with 2FA in cms-admin, reset password; §12 items 1, 2, 9, 10 pass.

### Phase 3: Access control
- T14 Roles & permissions model + policy evaluator + conditions DSL
- T15 Revocation versions (token_version / policy_version) in JWT guard
- T16 Field projection, masking serializer, write allowlist, filter/sort guard
- T17 Accounts & roles management API (rank rules) + security audit
- T17a Re-enable account + resend invite + invite rate limit (API)
- T17b Read-only content types API (for the matrix pickers)
- T17c Accounts list pagination + custom role cap of 50 (API)
- T18 Accounts/roles/permissions admin UI
- T18a Admin UI for enable, resend invite, accounts pagination (after T17a, T17c)
- T19 API tokens (∩ creator, session-only management) API + UI

**Checkpoint 3:** §12 items 4 (system subjects), 5, 6, 7, 11, 18 pass.

### Phase 4: Documents
- T20 Document read API (list/detail, draft/published, masking, filter/sort guard)
- T21 Document create/update with OCC + masked 409
- T22 Publish/unpublish with deep clone + delete
- T23 Dynamic form renderer in cms-admin (scalar inputs)
- T24 Richtext (Tiptap) with server-side sanitize
- T25 Conflict diff/merge modal (component_uid based)
- T26 Presence API + banner

**Checkpoint 4:** create → edit → conflict → merge → publish works in cms-admin; §12 items 3 (draft 403 part), 4, 5, 12, 14 pass.

### Phase 5: Media
- T27 Upload pipeline + Cloudinary adapter + list
- T28 Safe delete (reference check, soft delete, purge job)
- T29 MediaInput + media library UI

**Checkpoint 5:** §12 item 13 passes; images can be attached to documents.

### Phase 6: Public web & reviewer
- GQ1 GraphQL schema builder + SDL print (needs Q-G1..Q-G3)
- GQ2 GraphQL endpoint + resolvers over the document read path
- GQ3 GraphQL limits + production hardening (needs Q-G4, Q-G5)
- T30a Migrate apps/web to Next.js (skeleton parity)
- T30b Smoke stack + script for the Next.js web
- T30 Web CV showcase, Server Components fetching through GraphQL (Q-G6, Q-G7 answered) — replanned 2026-10-27 as phase RV2 (RV-mask, RV-cv-1..RV-cv-3, RV-cv-e2e)
- T31 Reviewer backend: settings, Turnstile session, ephemeral account, cleanup job (needs Q4)
- T32 Reviewer UX in web + read-only admin + owner sessions log (needs Q6)
- T33 Web login + session sharing with admin

**Checkpoint 6:** §12 item 3 passes end to end in Playwright; public site renders with masked fields.

### Phase 7: Collections bulk
- T34 Bulk API (create/publish/unpublish/delete, atomic + partial)
- T35 Bulk UI (SortableSheet, TablePagination, BulkActionBar, JsonInput import)

**Checkpoint 7:** bulk create 50 records with 3-level trees in ≤ 4 inserts per level; ABAC per item.

### Phase 8: Hardening & deploy docs
- T36 Security headers + CSP per app + prod config audit
- T37 split (REPLAN 2026-10-22, re-scoped after the user's "T37 correction": compose is local-test only, never in CI; second REPLAN 2026-10-22: e2e does NOT run in GitHub CI, it stays local only via `SMOKE_E2E=1 pnpm smoke` / `pnpm e2e:spec`), build order: T37a + T37c + T37d (parallel) -> T37b -> T37e -> T37g
  - T37a cms-api init container command `deploy:migrate` (db:migrate -> content:migrate), numeric USER, smoke `cms-api-init` service (core-builder, security gate)
  - T37b CI checks + build generated from `.github_template/` into `.github/workflows/` (replaces the old untracked ci.yml; no compose, no e2e) (core-builder)
  - T37c web image numeric non-root user (ui-builder)
  - T37d Playwright consolidation + §12 success-criteria map (qc; local e2e)
  - T37f removed (e2e in CI; was built @ a2897da, its CI wiring is undone by T37g)
  - T37e image publish (one image per service, from each Dockerfile; one cms-api image for init + main, Q-T37-9) + deploy-repo bump from the template, gated on the app's CI checks only (lint, typecheck, unit tests, build), not on e2e (core-builder, security gate)
  - T37g remove the CI e2e job, `e2e.yml` and the `e2e` affected output; `publish-<app>` needs only `[changes, <app>]`; docs say e2e is local only (core-builder, security gate; needs Q-T37-12 on deleting `scripts/e2e-stack.sh`)
- T38 Deployment guide for the deploy repo (Traefik, cms-api init + main container, backups, IP policy); deps T36, T37a

**Checkpoint 8 (release):** all §12 criteria green (Jest/Vitest ones in the CI app flows, Playwright ones locally with `SMOKE_E2E=1 pnpm smoke`; no e2e in CI); deploy guide reviewed.

### Ad-hoc: Base config
- D2 `packages/prettier-config` -> `packages/base-config` (`@abyss/base-config`, exports `prettier`, `eslint`, `oxlint`); every app and package extends it locally. core-builder (step A: package, repo-wide rename, cms-api, e2e config) -> ui-builder (step B: cms-admin, web, form-commons) -> qc (step C: CLI checks). Needs Q-BC1..Q-BC4. Done; its Q-BC4 "no build step" contract is superseded by D3.
- D3 Build `@abyss/base-config` to `dist/` with `tsc` (ESM + `.d.ts`), exports `types`/`import`/`default` -> dist; turbo `^build` orders it before consumers (lint, typecheck, test, Docker builds); root `format` / `format:check` build it first; fresh-clone check. core-builder; deps D2. Needs Q-D3-1, Q-D3-2.

### Ad-hoc: Owner setup
Design `docs/modules/owner-setup.md`, ADR 0005; SPEC D1, §12-1 amended 2026-10-22. Needs Q-OS1..Q-OS4.
- OS1 Owner setup API (`GET /setup/status`, `POST /setup/owner`, `OWNER_SETUP_TOKEN`, throttles, audit, shared `bootstrapOwner`). core-builder; security gate.
- OS2 Admin `/setup` page + login notice. ui-builder; deps OS1; security gate.
- OS3 Smoke creates the owner via the setup route; deploy/local docs. core-builder; deps OS1.
- OS4 e2e (closed state) + browser check (open state on a fresh DB). qc; deps OS2, OS3.

### Ad-hoc: Audit
User request 2026-10-23: read-only whole-repo audit against `code-standards` §4. Criteria: C1 isolated modules, C2 readable names over comments, C3 extensible with minimal impact. Answers Q1-Q5 and the shared run rules and checks are in `todo.md` "Ad-hoc: Audit". AU0 (state-file fixes) done by the manager.

Goal: one findings file per area, then one approved list of behavior-preserving fix tasks.
Inputs: AU0 done (project.md, handoff.md, current.md, conventions.md current).
Outputs:
- `.claude/state/findings/AUDIT-<area>.md` for AU1a-AU5. Check: each listed check has entries or a zero count; `git status --short` shows no other change.
- AU6 planner report: accept / drop / question per finding, proposed phases R1-R4 with task IDs.
Exit criteria: the user approves the AU6 fix list. Only then are R1-R4 tasks written and put on the board.
Tasks (build order):
- AU1a cms-api identity, access, reviewer, media. qc + security-qc; security gate.
- AU1b cms-api content-engine, content-types, documents, graphql. qc.
- AU1c cms-api common, config, infrastructure. qc + security-qc for infrastructure/media and infrastructure/turnstile; security gate.
- AU2 cms-admin. qc + security-qc for features/auth and features/security; security gate.
- AU3 web. qc + security-qc for features/auth; security gate.
- AU4 form-commons. qc.
- AU5 tooling and test code (base-config, scripts, .github, turbo.json, smoke compose, apps/e2e). qc.
- AU6 Consolidate findings, decide G6 (SPEC §2 map), propose R1-R4 fix tasks. planner; deps AU1a-AU5. Done 2026-10-23.

### Refactor: Audit fixes (R1-R4) — APPROVED 2026-10-23
Details, rules, the standard verify (SV) and the user's answers to Q-A1..Q-A10 are in `todo.md` "Refactor: Audit fixes". Every task is behavior-preserving unless marked "planned change". Order: R1-00 (SPEC) first, then the R1 guards. R3 may run alongside R1, R2 follows R1, and R4 follows R1-R3.

## Phase R1: cms-api boundaries and guards
Goal: every cms-api module has one public interface and an import direction that a test enforces, and the identity <-> access cycle is gone.
Inputs: user answers Q-A1 (SPEC follows the code), Q-A2 (git mv approved), Q-A3 (keep the UUID helper); AU findings.
Outputs:
- `modules.architecture.spec.ts` green with an empty `KNOWN_VIOLATIONS` list. Check: `pnpm --filter @abyss/cms-api test:unit -- architecture`.
- The permission-metadata spec and the resolved-import serializer / GraphQL specs are green.
- `ALLOWED_MODULE_EDGES` matches SPEC §2 row for row, with `access` as three nodes (core, management, document auth). Check: read the constants file against the SPEC table.
- `modules/security-audit/` exists, and every module has an `index.ts`. Check: grep `from '\.\./[a-z-]+/[a-z]'` outside specs returns no cross-module deep import (lint `no-restricted-imports` passes).
- `seed:account` CLI. Check: `SMOKE_E2E=1 pnpm smoke` green with no `require('./dist` in `scripts/`.
Exit criteria: cms-api `lint typecheck test:unit test:integration` green; smoke and e2e green; qc REGRESSION and security-qc PHASE review pass.
Tasks: R1-00, R1-01, R1-02, R1-07, R1-03, R1-04, R1-05, R1-06, R1-08, R1-09, R1-10, R1-11, R1-12, R1-13, R1-14, R1-15, R1-16

## Phase R2: cms-api extensibility
Goal: a new field type, provider, throttled endpoint, route group or env key is added in its owning module with the fewest edits.
Inputs: R1 outputs (facades, guards, security-audit module); Q-A9 approved.
Outputs:
- Field-type registry. Check: the field-type architecture spec shows no scalar-type switch outside `content-engine/field-types/`; the media filter / sort / GraphQL rejection spec is green; `content:generate -- --check` and `graphql:print-schema -- --check` unchanged.
- Rate-limit policies per module, the throttle subject resolver bound in `app.module.ts`, and a route snapshot spec. Check: specs green; §12-8 spoof test green.
- Allowlisted boot summary, `.env.example` parity spec, and provider factory maps. Check: specs green.
Exit criteria: as R1, plus the drill-a count is down to 1 registry entry plus docs plus the admin adapter. qc REGRESSION and security-qc PHASE review pass.
Tasks: R2-01, R2-02, R2-03, R2-04, R2-05, R2-06, R2-07, R2-08, R2-09, R2-10, R2-11, R2-12, R2-13, R2-14, R2-15, R2-16, R2-17, R2-18

## Phase R3: frontends and UI kit
Goal: admin and web features have facades and one import direction, the admin gets a feature registry, and the kit owns shared form wiring.
Inputs: none from R1/R2 except R3-24 (needs R1-15, R2-10), and R3-04 / R3-12 (need R1-00: the SPEC §2 frontend directions, with the admin feature order auth < security < content-types < access < media < content, reviewer). Q-A4, Q-A5 (option A), Q-A7, Q-A9 and Q-A10 are approved. R3 can start in parallel with R1 (different builder).
Outputs:
- Admin and web `src/architecture.spec.ts` green, and lint blocks cross-feature deep imports. Check: `pnpm --filter @abyss/cms-admin test`, `pnpm --filter @abyss/web test`.
- Admin pages, nav and providers come from `features/registry.ts`. Check: browser walk of the admin nav (same items and order for owner, admin and reader); the public route spec is green.
- 2FA dialogs on the kit `Dialog`, and tables on `SortableSheet`. Check: browser: an overlay click does not close the 2FA dialog and Esc does; the account, token, role and reviewer lists look and act as before.
- Contract snapshot tests in admin, web, kit and e2e. Check: change one mirrored value and the matching test fails.
Exit criteria: all frontend and kit tests, lint and build green; `SMOKE_E2E=1 pnpm smoke` green; qc REGRESSION (browser) and security-qc PHASE review pass.
Tasks: R3-14, R3-13, R3-15, R3-22, R3-01, R3-02, R3-03, R3-04, R3-05, R3-06, R3-07, R3-08, R3-09, R3-10, R3-11, R3-12, R3-16, R3-17, R3-18, R3-19, R3-20, R3-21, R3-23, R3-24, R3-25, R3-26

## Phase R4: readability sweep and test tooling
Goal: no task IDs in comments, internal names read as questions or verbs, the largest files are split by responsibility, and test tooling has one owner for each shared value.
Inputs: R1-R3 outputs (files have settled in their owners); Q-A6 approved.
Outputs:
- Comment-guard specs green in cms-api, cms-admin, web and kit. Check: grep for task IDs in source comments returns nothing.
- Split files, each under 300 lines where a split was planned. Check: `wc -l` on the listed files.
- e2e helpers and `app-contracts.ts`, the `smoke.sh` section files, and the reusable CI workflow. Check: full smoke green; actionlint clean; `affected.test.sh` passes.
Exit criteria: all packages green; smoke green; qc REGRESSION pass; security-qc PHASE review for the gated splits.
Tasks: R4-01, R4-02, R4-03, R4-04, R4-05, R4-06, R4-07, R4-08, R4-09, R4-10, R4-11, R4-12, R4-13, R4-14, R4-15, R4-16, R4-17, R4-18, R4-19, R4-20, R4-21, R4-22, R4-23, R4-24, R4-25, R4-26, R4-27, R4-28, R4-29

### Architecture and navigation (CA, CR, DV, SM, FN, MF) — PROPOSED 2026-10-25
Details in `todo.md` "Architecture and navigation". Designs: ADR 0006 (cms-api layers), ADR 0007 (micro-frontend options), ADR 0008 (file naming), `docs/modules/admin-navigation.md`. Phases CA, DV and SM are independent and may run in parallel (qc / core-builder / ui-builder). FN waits for Q-FN answers; MF waits for the user's option pick. The cms-api refactor phases CR0-CR7 were written by CA5 (below Phase MF); CR runs on core-builder, so it did not run in parallel with DV or the cms-api part of FN (FN1). Phase FN was revised 2026-10-26 (REPLAN FN1): see Phase FN.

## Phase CA: cms-api clean-architecture audit
Goal: every cms-api file is placed in a target layer (ADR 0006) with its violations listed, so the refactor can be planned module by module.
Inputs: ADR 0006 (proposed); `src/architecture/import-graph.ts`.
Outputs:
- `.claude/state/findings/AUDIT-CA1a.md`, `AUDIT-CA1b.md`, `AUDIT-CA2.md`, `AUDIT-CA3.md`, `AUDIT-CA4.md`, each with an entry or zero count for L1-L8 and a target file map. Check: read each file; `git status --short` shows only findings files.
- Security notes under every proposed fix in high-risk paths (CA1a, CA1b, CA2). Check: `grep -c "Security note:"` per file is non-zero.
- CR task list in todo.md and plan.md (CA5). Check: the user approves it.
Exit criteria: all five findings files complete; Q-CA1..Q-CA4 answered; CA5 approved.
Tasks: CA1a, CA1b, CA2, CA3, CA4, CA5

## Phase DV: cms-api local start
Goal: `start:dev` runs cms-api with values from `apps/cms-api/.env.local`.
Inputs: Q-DV1, Q-DV2 answers (given); Q-NC1..Q-NC3 answers (ADR 0009) for DV1c.
Outputs:
- `pnpm --filter @abyss/cms-api start:dev` starts the API with a throwaway `.env.local`. Check (CLI): the log shows `Listening on port <PORT from the file>`; with no file it fails on the config check listing keys only.
- Docs. Check: `docs/local-run.md` and the cms-api README name `.env.local` for `start:dev`.
- NestJS CLI defaults (ADR 0009). Check (CLI): `pnpm --filter @abyss/cms-api build` runs `nest build` and writes `dist/main.js` with the same `.js` file list as the old `tsc` build; `start:prod` and `start:debug` exist; the cms-api Docker image builds and starts.
Exit criteria: cms-api lint, typecheck, unit green; the CLI checks above pass; `content:generate` / `graphql:print-schema` / `contract:print` `--check` pass; the image still runs `node dist/main.js`.
Tasks: DV1, DV1b (done, 5c50f23), DV1c

## Phase SM: cms-admin side menu
Goal: signed-in pages use a left side menu with Content (single / collection types), Utilities and System settings.
Inputs: Q-SM1..Q-SM4 answers (SM1 can start before them).
Outputs:
- Side menu on desktop and a menu sheet below `md`. Check (browser, kept smoke stack): owner sees the three sections with the listed items; a limited role sees only its items; 375 / 768 / 1280 px; Esc closes the sheet; focus visible.
- Content-type links from the catalog. Check (browser): each content type the caller can read is listed under its kind and opens its page.
- e2e. Check: `SMOKE_E2E=1 pnpm smoke` green with the updated nav specs.
Exit criteria: cms-admin lint, typecheck, test, build green; smoke and e2e green; qc REGRESSION (browser) pass.
Tasks: SM1, SM2, SM3, SM4

## Phase FN: file naming rule (revised 2026-10-26, REPLAN FN1)
Goal: every TypeScript file and folder in every package follows the rule (kebab-case folders, `<use><PascalName>[.<function>].<ext>` files with a word only when needed, SPEC §5, ADR 0008), checked by one guard per package with no exception list.
Inputs: FN1 core guards (0b03efe); SPEC §5 table and ADR 0008 revision (planner, 2026-10-26); user answers Q-FN7..Q-FN11 (2026-10-26, ADR 0008 "User answers"). No task waits on a question.
Outputs:
- Revised cms-api and base-config guards. Check (CLI): `pnpm --filter @abyss/cms-api test:unit -- FileNames` and `pnpm --filter @abyss/base-config test`; a scratch `bad-name.ts` and a scratch `BadFolder/` fail.
- Renamed packages, one commit per task. Check (CLI): each package's guard passes with no `KNOWN_FILE_NAME_EXCEPTIONS`; `find apps packages -path '*/node_modules' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print` under `src/`, `test/`, `tests/` lists no lower-case file outside the framework names; the reviewed old -> new maps apply the ADR 0008 "needed" test (components without a word).
- Guards in form-commons, web, cms-admin, e2e. Check (CLI): each package's test run includes `FileNames.architecture.test.ts`; a scratch bad file fails.
- Same behaviour. Check: unit and integration counts unchanged; `pnpm exec playwright test --list` count unchanged (205); tier 3 smoke with e2e green at the phase checkpoint.
Exit criteria: `pnpm lint typecheck test build` green; cms-api full integration green; `SMOKE_E2E=1 pnpm smoke` green; security-qc pass on FN-api-3, FN-web-1, FN-ad-2, FN-ad-5; planner updates the SPEC §5 tree to the new names.
Tasks (three chains, may run in parallel): core-builder FN1r -> FN-api-1 -> FN-api-2 -> FN-api-3 -> FN-api-4, and FN-bc-1 · ui-builder FN-kit-1 -> FN1b-kit -> FN-web-1 -> FN-web-2 -> FN1b-web -> FN-ad-1 -> FN-ad-2 -> FN-ad-3 -> FN-ad-4 -> FN-ad-5 -> FN1b-admin · qc FN-e2e-1 -> FN-e2e-2 -> FN1c
Scheduling with other work: CR is closed (no CR task carries renames any more). The MF feature-package tasks are planned after FN-ad-4 (user answer Q-FN9) and move already-named files. T30 (CV page) runs after FN-web-1 or names its files by the rule. Not in parallel with the same files: the API security-headers task (FN-api-2), the dev-stack port-readiness follow-up (FN-api-3, `scripts/dev-stack.sh`), the side-menu a11y follow-up (FN-ad-1). FN-e2e-1 changes spec paths that `project.md` and `conventions.md` cite; the manager updates them.

Revision 3 (DESIGN naming-rule-general and naming-rule-decisions, 2026-10-26; ADR 0008 "Revision 3"; user answers Q-FN12..Q-FN16 applied):
Goal: the word set is open and hook words are dropped; one ESLint rule `abyss/file-names` from `@abyss/base-config` replaces the six per-package guards and every word list.
Inputs: phase FN tasks above (all packages renamed, guards in place); user approval of each guard-file deletion; `code-standards` §4.5 in this project's agent layer (manager).
Outputs:
- The rule. Check (CLI): `pnpm --filter @abyss/base-config test` runs the rule's `Linter` cases (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` checked; other types ignored); `pnpm lint` green at the root.
- Every package opted in, no guard left. Check (CLI): `git ls-files | grep FileNames` lists nothing; `git grep -n "FILE_FUNCTION_WORDS\|HOOK_FUNCTION_WORDS"` finds nothing outside `docs/adr/` and `tasks/`; in each package a scratch `bad-name.ts` and a scratch `BadFolder/` fail `pnpm --filter <pkg> lint`.
- Renamed files. Check (CLI): `git grep -nE "use[A-Z][A-Za-z]+\.(query|mutation|state)\b" apps packages` finds nothing; `git ls-files | grep -E "AppContracts.contract|ErrorContract.contract"` lists nothing.
- Same behaviour. Check: unit counts drop only by the deleted guard tests; `pnpm exec playwright test --list` still 205; qc tier 2 ui pass after FN-hook-rename.
Exit criteria: `pnpm lint typecheck test build` green; SPEC §5 and ADR 0008 match (done in this DESIGN); planner updates the SPEC §5 tree names when phase FN closes.
Tasks (build order): FN-lint-1 (core-builder) -> in parallel FN-lint-api (core-builder) · FN-lint-e2e (qc) · FN-lint-ui (ui-builder) -> FN-hook-rename (ui-builder, after FN-lint-ui; Security gate)

## Phase MF: micro-frontends
Goal: the chosen micro-frontend option (ADR 0007) is planned.
Inputs: Q-MF1..Q-MF3 answers.
Outputs: accepted ADR 0007 and an MF task list. Check: the user approves it.
Exit criteria: MF tasks approved.
Tasks: MF0

### Phase CR: cms-api clean-architecture refactor — PROPOSED 2026-10-25 (CA5)
Details, rules, CR-SV, the user's answers to Q-CA5..Q-CA17 (2026-10-25) and dropped findings in `todo.md` "Phase CR". Awaiting the user's approval of the CR task list (CA5 Verify). Builder: core-builder (CR-00: planner). Order: CR0 → CR1 → checkpoint → CR2 → CR3 → CR4 → CR5 → CR6 → CR6b → CR7. Revised 2026-10-25 (planner REVISE CR): every open task has a §4.4 Target map and a Tier line (`todo.md` "Revision 2026-10-25", rules G1-G10); DEV-STACK (infra, tier 2 runner) is built after CR-dc-1; CR6b consolidates the modules moved before §4.4. Task checks run at the task's tier; every phase check below is tier 3. Platform first because of the `describeError` hazard (AUD-CA3-2, AUD-CA4-9); then the `content-types` pilot with `health` as warm-up; then modules from the bottom of the SPEC §2 graph up, with the high-risk modules last (`Security gate: yes` on every task in CR4-CR6). Every task is behavior-preserving except the line marked planned change in CR-dc-3 (Q-CA14c).

## Phase CR0: platform foundation
Goal: the error, guard, transaction and logging pieces every module refactor needs exist, and nothing reads `HttpException` outside `common/` any more.
Inputs: ADR 0006 accepted (§1-7, all questions answered); user approval of the CR list.
Outputs:
- `DomainError` and `describeError`. Check (CLI): the parity and contract specs in `common/errors/` pass; one `DomainError` gives the same body over REST, GraphQL and a bulk item.
- Layer guard. Check (CLI): `pnpm --filter @abyss/cms-api test:unit -- layers.architecture` passes with an empty `MIGRATED_MODULES`, and every fixture case passes or fails as listed in CR-pf-3.
- Pinned paths in one table. Check (CLI): renaming a pinned file in a scratch commit fails with "missing path".
- `TransactionRunner` (core) and `AppLogger`. Check (CLI): `test:integration -- transaction-runner` passes (commit, rollback, after-commit only after commit).
- Domain enums. Check (CLI): the four parity specs pass.
Exit criteria: CR-SV green; security-qc reviews CR-pf-1, CR-pf-2, CR-pf-5 and CR-pf-6; the user approves the CR-00 SPEC diff.
Tasks: CR-pf-1, CR-pf-2, CR-pf-3, CR-pf-4, CR-pf-5, CR-pf-6, CR-00

## Phase CR1: pilot (health, content-types)
Goal: two small modules show the full pattern (layers, `DomainError`, facades, path-pinned tests) before the rest follows.
Inputs: CR0 outputs.
Outputs:
- `health` and `content-types` in layers and listed in `MIGRATED_MODULES`. Check (CLI): `layers.architecture.spec.ts` green; `test/integration/{health,content-types}.spec.ts` unchanged and green.
- Endpoints unchanged. Check (CLI): `curl -i` on a kept smoke stack for `/health/live`, `/health/ready` and an unknown content type (404 `CONTENT_TYPE_NOT_FOUND`) shows the same bodies as before the phase.
- README "Module layout (ADR 0006)" checklist. Check: read it.
Exit criteria: CR-SV green; checkpoint: the user reviews the pilot diffs and the checklist, and ADR 0006 is amended if the pilot shows a gap.
Tasks: CR-hc-1, CR-hc-2

## Phase CR2: content-engine
Goal: content-engine owns its persistence behind ports, and its domain types no longer live in adapter files.
Inputs: CR1 checkpoint; CR-pf-5 (port).
Outputs:
- content-engine in layers, with the content-DB `TransactionRunner`; the registry load use case reaches the database only through the `ContentTypeRepository` port, and only wiring (`ContentEngine.module.ts`, `cli/ContentEngineCli.setup.ts`) imports `MigrationDb.adapter.ts`. Check (CLI): `layers.architecture.spec.ts` (no application-to-adapter entry), `facade-reexports` and `field-type-branches` specs green; `content:generate -- --check` unchanged; `test/integration/{content-repository,content-migrations}.spec.ts` green.
Exit criteria: CR-SV green; security-qc reviews CR-ce-2.
Tasks: CR-ce-1, CR-ce-2

## Phase CR3: documents and graphql
Goal: document use cases are free of Kysely and Nest exceptions, and GraphQL reads errors through the shared reader.
Inputs: CR2 outputs.
Outputs:
- documents and graphql in layers. Check (CLI): `layers.architecture.spec.ts` and `graphql.architecture.spec.ts` green; `test/integration/documents-*.spec.ts` and `graphql.spec.ts` green with no assertion change (apart from the Q-CA14c planned-change test); `graphql:print-schema -- --check` unchanged.
- Behavior on the running stack. Check (CLI): `SMOKE_E2E=1 pnpm smoke` green (document create, publish, bulk, GraphQL reads).
- Dev stack for tier 2 (DEV-STACK). Check (CLI): `pnpm dev:stack`, then `E2E_STACK=dev pnpm e2e:spec tests/admin-auth.spec.ts` and `tests/media-library.spec.ts` pass; `pnpm dev:stack:stop` leaves no `abyss-dev` container; a running `abyss-smoke` stack is untouched.
Exit criteria: CR-SV green; security-qc reviews CR-dc-1, CR-dc-2, CR-dc-3; qc REGRESSION (tier 3).
Tasks: CR-dc-1, DEV-STACK, CR-gq-1, CR-dc-2, CR-dc-3, CR-gq-2

## Phase CR4: access core
Goal: the access rules (serializer, allowlist, projection, policy) sit in `domain/`, authentication and caching in `application/`, and guards in `http/`, with document auth as its own sub-module.
Inputs: CR3 outputs.
Outputs:
- access core and document auth in layers. Check (CLI): `layers.architecture.spec.ts`, `modules.architecture.spec.ts` (three access nodes), `record-serializer.architecture.spec.ts` and `permission-metadata.architecture.spec.ts` green; `test/integration/{field-masking,access-guard,api-tokens}.spec.ts` unchanged and green.
- New guard tests. Check (CLI): the `DocumentAuthGuard` header-shape table and the `ApiTokenAuthentication` 401-cause specs pass.
Exit criteria: CR-SV green; security-qc reviews every task and runs a PHASE review; qc REGRESSION including the e2e access specs.
Tasks: CR-ac-1, CR-ac-2, CR-ac-3, CR-ac-4

## Phase CR5: security-audit and identity
Goal: sign-in, tokens, OTP, TOTP and owner setup run as use cases behind ports, with the timing-parity and stored-format paths unchanged.
Inputs: CR4 outputs (`RoleLookup`, `AccessSession` dependencies through facades); CR-pf-5.
Outputs:
- security-audit and identity in layers. Check (CLI): `layers.architecture.spec.ts`, `identity-cli.architecture.spec.ts`, `security-audit-provider.architecture.spec.ts` and `auth-constants.pin.spec.ts` green; `test/integration/{auth,two-factor,password,owner-setup,identity-bootstrap,seed-account,bootstrap}.spec.ts` unchanged and green.
- Fixture tests for stored formats (refresh-token hash, OTP HMAC, SecretBox, audit email HMAC). Check (CLI): they pass on the old and the new code.
- Browser: sign-in, refresh cookie clearing, 2FA setup and owner setup on a kept smoke stack. Check: qc walk; network shows the same status codes and bodies as before.
Exit criteria: CR-SV green; security-qc reviews every task and runs a PHASE review; qc REGRESSION (browser and e2e).
Tasks: CR-sa-1, CR-id-1, CR-id-2, CR-id-3, CR-id-4

## Phase CR6: access management, media, reviewer
Goal: the remaining high-risk modules are in layers, the media storage and turnstile platform folders have moved into media and reviewer (Q-CA14a), and both scheduled jobs live in `jobs/` on one shared helper (Q-CA7).
Inputs: CR5 outputs.
Outputs:
- access management, media and reviewer in layers. Check (CLI): `layers.architecture.spec.ts` green; `test/integration/{accounts-roles,api-tokens,role-permissions-seed,media,media-delete,media-update,media-document-refs,reviewer}.spec.ts` unchanged and green.
- Upload behavior. Check (CLI): `upload.pipeline.spec.ts` (rewired to the receiver adapter) has the same cases; a `curl` upload of an SVG on a kept stack still answers 415 `MEDIA_UNSUPPORTED_TYPE`.
- Reviewer rate limit. Check (CLI): the reviewer integration spec's 429 has `Retry-After`.
Exit criteria: CR-SV green; security-qc reviews every task and runs a PHASE review; qc REGRESSION (browser walk of accounts, roles, API tokens, media library, reviewer dialog; e2e green).
Tasks: CR-ac-5, CR-ac-6, CR-md-1, CR-md-2, CR-md-3, CR-rv-1, CR-rv-2

## Phase CR6b: consolidation (health, content-types, platform, content-engine)
Goal: the modules and platform files moved before the file-granularity rule (ADR 0006 §7.13) follow `code-standards` §4.4, with no behavior change.
Inputs: CR6 outputs (every module in layers, so the import-path edits are final).
Outputs:
- Fewer files. Check (CLI): `find apps/cms-api/src/modules/{health,content-types,content-engine} apps/cms-api/src/common -name '*.ts' ! -name '*.spec.ts' | wc -l` per folder gives health 5, content-types 5, content-engine 31, common 22; no non-spec file under 30 lines in them except the G6 list.
- Same behavior. Check (CLI): `test/integration/{health,content-types,content-repository,content-migrations}.spec.ts` and the architecture suite green with path edits only; `content:generate -- --check` unchanged; `SMOKE_E2E=1 pnpm smoke` green (CR-cs-3 is tier 3).
Exit criteria: CR-SV green; security-qc reviews CR-cs-3; qc REGRESSION (tier 3).
Tasks: CR-cs-1, CR-cs-2, CR-cs-3, CR-ce-4

## Phase CR7: close
Goal: every module is checked by the layer guard with no exceptions left, and the contract builder reads facades only.
Inputs: CR3-CR6b outputs.
Outputs:
- Full layer guard. Check (CLI): `layers.architecture.spec.ts` checks every module and `KNOWN_LAYER_VIOLATIONS` is empty; `grep -rn "unitOfWorkFromPrismaTx\|unitOfWorkFromContentTrx" apps/cms-api/src` prints nothing.
- Contract unchanged. Check (CLI): `contract:print -- --check` passes.
- Bulk item errors read in `http/`. Check (CLI): `KNOWN_LAYER_VIOLATIONS` has no `documents` entry; the documents bulk integration spec is unchanged and green.
Exit criteria: CR-SV green; qc REGRESSION; ADR 0006 marked implemented.
Tasks: CR-cl-1

### Direct request: expired API tokens are not editable (ET) — PROPOSED 2026-10-25
Flat list, details in `todo.md` "Direct request: expired API tokens are not editable (ET)". SPEC §7 D5. Order: ET1 (core-builder, security gate) -> ET2 (ui-builder) -> ET3 (qc). ET1 waits for Q-ET1 and Q-ET2; Q-ET3 changes only a test line in ET1 and the Revoke button in ET2. Independent of CA, DV, SM, FN, MF; the CR refactor (after CA5) later moves `ApiTokenExpiry.rules.ts` into `access/domain/` without changes.

### Direct request: architecture guards move to `test/architecture/` (ARCH) — APPROVED 2026-10-27
Flat list, details in `todo.md` "Direct request: architecture guards move to `test/architecture/` (ARCH)". SPEC §2 "Module directions (cms-api)", §5; ADR 0006 "Addendum ARCH-1". One task: ARCH-1 (core-builder, Security gate, tier 1 + security-qc), after FN-lint-api (so the FileNames guard files are deleted, not moved). Check (CLI): `git ls-files apps/cms-api/src | grep -c architecture` prints `0`; `pnpm --filter @abyss/cms-api test:unit` has the same suite and test counts as before; after `pnpm --filter @abyss/cms-api build`, `apps/cms-api/dist/architecture` does not exist. Not in parallel with another cms-api task that edits `SourcePaths.constants.ts` or `LayerRules.constants.ts`.

### Direct request: content types from the parked JSON files (CT) — APPROVED 2026-10-27
Flat list, details in `todo.md` "Direct request: content types from the parked JSON files (CT)". SPEC §7 D10, §8.2; ADR 0010. Two core-builder tasks: CT-doc (no deps, docs and a Dockerfile comment) and CT3 (four converted definitions, the CV type as slug `resume` per Q-CT8, + generated `0003_site_content_types.sql`, snapshot and `schema.graphql` with `Resume` / `ResumePage`). No open questions. Check (CLI): `content:generate -- --check` and `graphql:print-schema -- --check` pass; tier 3 smoke: the `cms-api-init` log shows `Applied 1 migration(s): 0003_site_content_types.sql.` and `GET /api/v1/content-types` as the owner lists the four new slugs (`common-text`, `cv-contact`, `header`, `resume`). Independent of the other open work; not in parallel with another task that generates a content migration.

### Direct request: backup download in cms-admin (BK) — PROPOSED 2026-10-27

Details are in `todo.md` under "Direct request: backup download in cms-admin (BK)". Design: `docs/adr/0013-backup-download.md`. SPEC references: §7 D20, §9 "Backups".

The user answered Q-BK1 to Q-BK6 on 2026-10-27: owner only, existing dumps only, lifecycle retention, Cloudflare R2, two separate keys, and `age` encryption. Q-BK7 is answered too: the official S3 SDK plus `testcontainers` and an S3 stand-in image. No BK question is open. BK-1 and BK-2 can be dispatched now, and BK-doc after LG-db-4 and LG-pg17.

Build order is a flat list:
1. BK-1 (core-builder, Security gate) and BK-2 (core-builder, Security gate) in parallel.
2. BK-3 (core-builder, Security gate).
3. BK-4 (ui-builder, Security gate).
4. BK-e2e (qc).

BK-doc (core-builder) runs after LG-db-4 and LG-pg17, because it edits the same guides.

Checks:
- CLI: `pnpm --filter @abyss/cms-api test:integration -- Backups S3BackupStorage` passes. It covers the owner-only rule, re-auth, audit rows, no-store and the rate limit. A presigned URL fetched from the S3 stand-in returns the uploaded bytes.
- Tier 3: `SMOKE_E2E=1 pnpm smoke` passes with the feature off.
- Browser: `E2E_STACK=dev pnpm e2e:spec tests/Backups.e2e.spec.ts` passes. The owner sees the page, an admin does not, and the download dialog navigates to the returned URL.

This is not a launch blocker. If BK-3 is committed before LG-1, the LG-1 review covers D20.

Checkpoints (user rule 2026-10-28: qc runs only here). BK-1 to BK-4 are done with their task checks and security passes; they are inputs here, not re-built.

#### Checkpoint BK-A: backups feature in cms-admin and cms-api
Tasks: BK-1, BK-2, BK-3, BK-4 (done), BK-e2e (after BK-e2e).
Inputs: BK-1 to BK-4 committed; dev stack (`pnpm dev:stack`, no backup storage); Docker running for the integration suites.
Outputs: the rows below.
Test tier: 2 (dev stack e2e), plus tier 3 smoke with the feature off.
Doubts for QC: the open BK-4 note (the owner sees the menu item when the list call fails with 500 or 403); the fixture download URL leaving the stack (it must be intercepted by `page.route`); the e2e spec flaky on the second run; a non-owner reaching the list through a direct `/backups` visit; the download URL ending up in the query cache, Redux or a log.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CBK-1 | BK-4, BK-e2e, dev stack | Backups page e2e. Check (CLI): `E2E_STACK=dev pnpm e2e:spec tests/Backups.e2e.spec.ts` green twice in a row: owner sees the not-configured state; admin has no nav item and gets 403 on `GET /api/v1/backups`; with fixture routes the table, the stale banner and the dialog work and the page navigates to the fixture URL | qc | | |
| CBK-2 | BK-2, BK-3 | API rules hold. Check (CLI): `pnpm --filter @abyss/cms-api test:integration -- Backups S3BackupStorage` green (owner only, re-auth, audit rows, `no-store`, rate limit, presigned URL returns the bytes and 403 after expiry) | qc | | |
| CBK-3 | CBK-1, CBK-2 | Feature off does not break the stack. Check (CLI): `SMOKE_E2E=1 pnpm smoke` green with the full e2e count, `Backups.e2e.spec.ts` included in the list | qc | | |

#### Checkpoint BK-B: backup job and restore documented
Tasks: BK-doc.
Inputs: checkpoint BK-A passed; LG-db-4 and LG-pg17 committed (checkpoint LG-B). May run in the same qc run as checkpoint LG-B or CRVOFF-8.
Outputs: the rows below.
Test tier: 1 (docs).
Doubts for QC: a `/tmp` dump path or a volume left in the CronJob; the job credential described with delete rights; R2 lifecycle rules not matching the R2 docs; a custom domain or public bucket access suggested for presigned URLs; the age private key placed on the VPS; key layout in the commands not matching `Backups.constants.ts`.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CBK-4 | BK-doc | Guides match the design. Check (CLI): `grep -n "/tmp/" docs/deployment/k3s-traefik.md` finds no dump path; every env key named exists in `apps/cms-api/.env.example` or is marked job-only; the object keys in the commands match `apps/cms-api/src/modules/backups/domain/Backups.constants.ts`; `pnpm format:check` green | qc | | |
| CBK-5 | BK-doc | Runbook points to the final text. Check: `docs/deployment/devops-runbook.md` section 6 is a link plus the setup order; blocker B6 is cleared there; the Supabase guide says nothing is stored in Supabase Storage | qc | | |

### Direct request: CI from the earlier deployment config (CI-old) — PROPOSED 2026-10-27
Flat list, details and the old-vs-current comparison table in `todo.md` "Direct request: CI from the earlier deployment config (CI-old)". SPEC §11, §13, D17; runbook `docs/deployment/devops-runbook.md` §3. Finding: `.github/` already carries the old config (built from it in T37b/T37e) with this project's newer checks; no restructure. User answers 2026-10-27: Q-CIO1 both environments x86_64 Ubuntu on Xeon (staging moves to `linux/amd64`), Q-CIO4 the three adaptations accepted. Order: CI-old-1 (core-builder, Security gate: build-args validated before the step output, extracted to a tested script) -> CI-old-4 (core-builder, Security gate: staging `linux/amd64` on `ubuntu-24.04` like production, cache scope per environment, runbook and architecture doc follow) -> CI-old-2 (core-builder, docs parity table, `.prettierignore`). Second round 2026-10-27: Q-CIO2 = no (CI-old-3 removed, self-tests stay local), Q-CIO3 = actionlint local only. Open owner decision: Q-CIO5 (only CI-old-2's `.prettierignore` line waits for it). Check (CLI): `bash .github/scripts/build-args.test.sh`, `affected.test.sh`, `pins-check.test.sh` pass; `pnpm format:check` passes; actionlint only through the command approved under Q-CIO3. No push, publish or deploy (B4 stays with the owner's first push). Blockers B1-B3 and B7 untouched.

#### Checkpoint CI-A: CI follows the earlier deployment config
Tasks: CI-old-1, CI-old-4, CI-old-2 (after CI-old-2).
Inputs: the three tasks built and through their commit gates (CI-old-1 and CI-old-4 through their security gates); Q-CIO5 answered for the `.prettierignore` line.
Outputs: the rows below.
Test tier: 1 (local scripts and dry review; never a push, publish or deploy).
Doubts for QC: a build-arg value echoed in the log or written to `$GITHUB_OUTPUT` before a check fails; a "must stay" check removed from `ci.yml` or `_publish.yml`; a permission or action pin changed; staging and production sharing one build cache scope; an `arm64` or "Apple M1" leftover; actionlint run with a command the manager did not approve.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CCI-1 | CI-old-1 | Build args checked before output. Check (CLI): `bash .github/scripts/build-args.test.sh`, `affected.test.sh`, `pins-check.sh` and `pins-check.test.sh` pass; `git diff develop -- .github/workflows/_publish.yml` shows only the step body and the cache scope changed | qc | | |
| CCI-2 | CI-old-4 | Staging builds amd64. Check (CLI): the "Resolve deploy target" script with `BRANCH=staging` and `BRANCH=main` (`EVENT_NAME=push`, scratch `GITHUB_OUTPUT`) writes the same `linux/amd64` / `ubuntu-24.04` matrix and environments `staging` / `production`; `BRANCH=develop` gives empty matrices; `grep -rnI "arm64\|ubuntu-24.04-arm\|Apple M1" .github docs/ci-cd.md docs/deployment/devops-runbook.md scripts/docs docs/architecture` prints nothing | qc | | |
| CCI-3 | CI-old-2 | CI docs carry the parity table. Check (CLI): `grep -rn "github_template" docs/ci-cd.md .prettierignore` prints nothing; `docs/ci-cd.md` has "Carried over from the earlier deployment" with the table and the "must stay" list, and names no secret, `DEPLOYMENT_REPO` value or cluster path; `pnpm format:check` green | qc | | |

### Recruiter reviewability (RV) — PROPOSED 2026-10-27
Details in `todo.md` "Recruiter reviewability (RV)"; design `docs/adr/0011-recruiter-reviewability.md`; user answers Q-RV2..Q-RV9 recorded there (2026-10-27); Q-RV1 (LICENSE holder name) still open. T30 (CV page) is unarchived and replaced by the RV2 tasks. User decisions: MIT license; no seeded or published demo account (reviewer flow); order demo -> CV page -> README.

## Phase RV1: one-command demo
Goal: a fresh clone runs the whole product with `pnpm install` + `pnpm demo`, with reviewer access on and sample CV content.
Inputs: none (dev stack from DEV-STACK, site content types from CT3).
Outputs:
- `pnpm demo` from a fresh worktree. Check (CLI): in `git worktree add <scratchpad>/abyss-fresh HEAD`, `pnpm install && pnpm demo` exits 0 and prints the web, admin and Mailpit URLs; `GET /api/v1/reviewer/status` returns `enabled: true`; `pnpm dev:stack:stop` leaves no `abyss-dev` container.
- Pre-flight. Check (CLI): with port 5174 held, `pnpm dev:stack` exits 1 naming 5174 and `DEV_STACK_WEB_PORT`; with Docker stopped it exits 1 with "Docker is not running."
- Sample content. Check (CLI): anonymous GraphQL `resumeList(filter: { isMain: { eq: true } }, pageSize: 1) { items { name } }` and `cvContact { name }` return the sample values.
- Docs. Check: `docs/local-run.md` starts with "Quick start".
Exit criteria: qc-cli tier 2 on both tasks; the tier 2 e2e run (`pnpm dev:stack` + one auth spec) unchanged; user approves.
Tasks: RV-demo-1, RV-demo-2

## Phase RV2: CV page
Goal: the web home page is the CV, fed by GraphQL, with sensitive fields masked for anonymous visitors and reviewers.
Inputs: RV1 outputs (sample content to look at).
Outputs:
- Default masking. Check (CLI): anonymous `GET /api/v1/documents/cv-contact` and GraphQL `cvContact { phone _maskedFields }` mask every Q-RV6 field; `FieldMasking` and `Reviewer` integration specs green.
- CV page. Check (browser, `pnpm demo`): `http://domain.localhost:5174/` shows the sample CV with "Sign in to view" on the masked fields; Reviewer access shows the reviewer profile; signed-in owner sees the raw values; `/status` shows the status card; no console or CSP error.
- e2e. Check (CLI): `WebCv.e2e.spec.ts` green on tier 3 `SMOKE_E2E=1 pnpm smoke` with the full suite.
Exit criteria: security-qc on RV-mask, RV-cv-1 and RV-cv-3 and a PHASE review; qc REGRESSION tier 3; user approves.
Tasks: RV-mask, RV-cv-1, RV-cv-2, RV-cv-3, RV-cv-e2e (RV-mask and RV-cv-1 have no deps and may run in either order)

## Phase RV3: README, LICENSE, screenshots
Goal: the GitHub landing page explains the project, shows it, and says how to run it in one command.
Inputs: RV1 outputs (Quick start), RV2 outputs (CV page for the screenshots).
Outputs:
- `LICENSE` (MIT) and root `README.md`. Check (CLI): files exist; every relative README link resolves; `pnpm format:check` green.
- Screenshots. Check: five PNGs in `docs/screenshots/` linked from the README, no real personal data or secret visible (manager and user review).
- cms-admin README. Check: its summary names every folder in `apps/cms-admin/src/features/`.
Exit criteria: qc tier 1 on the docs; user approves the README and the images.
Tasks: RV-doc-1, RV-doc-2, RV-doc-3 (RV-doc-1 and RV-doc-2 can start after RV1, the LICENSE file waits for Q-RV1; RV-doc-3 after RV2)

## Phase LG: launch gate (no public launch without it)
Goal: security holds for any public visitor: a whole-project security review and a live check of the deployed site pass before the site is public (SPEC §13 "Launch gate", user decision 2026-10-27).
Inputs: RV3 outputs (all RV work committed); the site deployed by the user with the production config and not public yet (staging with the production config allowed; Q-LG1, Q-LG2); a throwaway admin with 2FA (Q-LG2); launch blockers decided (LG-0).
Outputs:
- Launch blockers. Check: handoff.md has a user decision for each of the nine LG-0 items (multer and audit advisories, CI first run, untested deploy pieces, Cloudinary, DB roles, setup token, reviewer state, browser walk gaps).
- Database roles (ADR 0012, SPEC D19). Check (CLI): `pnpm --filter @abyss/cms-api test:integration -- DatabaseRoles` green; `SMOKE_E2E=1 pnpm smoke` green with `cms-api-init` as `abyss_migrator` holding only `DB_*` keys, `cms-api` as `abyss_api`, and the `database-roles` section all `ok`; the deploy guides carry the per-pod Secret map and the owner runbook. Supabase (ADR 0012 §9): both `DatabaseRoles` suites green (`self_managed` and the Supabase stand-in); unit cases for `DB_SSL_MODE` / `DB_SSL_ROOT_CERT_PATH`; `docs/deployment/supabase-database.md` has runbook S1-S8; LG-db-7 records Data API off, TLS check, second script run and a clean boot on the Supabase project.
- Live check script. Check (CLI): `scripts/launch-check.sh --web <origin> --admin <origin>` prints only `ok` lines against a kept smoke stack and is part of `SMOKE_E2E=1 pnpm smoke`.
- Whole-project review. Check: `.claude/state/findings/audit-<date>-security-launch.md` with a complete D1-D19 verdict table; every critical and high finding has a committed LG-fix task re-reviewed by security-qc.
- Live check. Check (CLI and browser): `launch-check.sh` against the deployed origins all `ok`; `.claude/state/findings/audit-<date>-live-launch.md` covers headers, transport, auth and cookie flags, masking (API and web HTML/RSC, anonymous and reviewer), injection and, if approved, the write probes and the ZAP scan.
Exit criteria: no open critical or high finding; each medium fixed or accepted by the user in writing; the throwaway admin account disabled; the user approves the launch in writing. Until then the SPEC §13 "Never" rule applies (no public DNS, ingress or announced URL).
Tasks: LG-0 and LG-dep (may start during RV), LG-db-1 and LG-db-2 (parallel; LG-db-2 has the `self_managed` and `supabase` modes), LG-db-3 and LG-db-6 (DB TLS keys, after LG-db-1), LG-db-5 (production boot warning, Q-DB2 warn only), LG-db-4 (deploy guides incl. the Supabase runbook), LG-db-7 (Supabase lockdown, owner; Q-DB3..Q-DB7 answered), LG-pg17 (Postgres 17 images, after LG-db-3 and LG-db-4), LG-2, LG-1, LG-fix-* (from LG-1), LG-3, LG-fix-* (from LG-3)

Checkpoints (user rule 2026-10-28: qc runs only here, not per task; each task keeps its builder, its commit gate and its security gate). LG-dep is done (qc tier 3 pass, a3029e2) and is not re-checked. LG-0 and LG-db-7 are user and owner decisions recorded by the manager; they are inputs of checkpoint LG-E, not table rows (see the planner question on 2026-10-28).

#### Checkpoint LG-A: database roles
Tasks: LG-db-1, LG-db-2, LG-db-6, LG-db-3, LG-db-5 (after the last of them).
Inputs: the five tasks built and through their security gates; Docker running; no other `abyss-smoke` stack.
Outputs: the rows below.
Test tier: 3 (env schema, smoke compose, `deploy:migrate` CLI) plus cms-api integration.
Doubts for QC: the init path falling back to the full config (`loadAppConfig`) anywhere; the roles script making its own self-check pass (revoking a `PUBLIC` right, or skipping `content` when the schema is created later); role cleanup between integration suites on the shared Testcontainers server (second run in a row); Postgres 16 vs 17 grant behaviour; suites that boot with `NODE_ENV=production` on the superuser now logging the LG-db-5 warning; the Prisma TLS URL parameters for `migrate deploy` (names taken from the docs, not memory); a CA file path or PEM content in any error output.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CLG-1 | LG-db-1 | Init container runs on DB keys only. Check (CLI): `docker compose -p abyss-smoke config cms-api-init` shows only `NODE_ENV` and `DB_*` keys (no JWT, SMTP, Cloudinary, Turnstile key); the `cms-api-init` log shows the migrations applied; `AppConfig.setup.spec.ts` only-DB cases green | qc | | |
| CLG-2 | LG-db-2 | Roles script in both modes. Check (CLI): `pnpm --filter @abyss/cms-api test:integration -- DatabaseRoles` green twice in a row (`self_managed` and Supabase stand-in suites), then the full `test:integration` green | qc | | |
| CLG-3 | LG-db-3, CLG-1, CLG-2 | Smoke stack on split roles. Check (CLI): `SMOKE_E2E=1 pnpm smoke` green with the full e2e count; the `database-roles` section prints only `ok`; `cms-api` runs as `abyss_api`, `cms-api-init` as `abyss_migrator` (`docker compose ... exec` env shows the user, never the password) | qc | | |
| CLG-4 | CLG-3 on a kept stack (`SMOKE_KEEP=1`) | API role cannot change the schema. Check (CLI, psql as `abyss_api` inside `db`): DDL beyond the scripted list is refused too (`CREATE FUNCTION`, `GRANT`, `SET ROLE abyss_migrator`, `ALTER DEFAULT PRIVILEGES`, writes to `_prisma_migrations` and `content._migrations`); the backup role writes nothing | security-qc | | |
| CLG-5 | LG-db-5 | Boot warning, warn only. Check (CLI): the `DatabaseRoles` case as the migrator logs exactly one warning with problem names and no values and the app still starts; as `abyss_api` no warning; the smoke `cms-api` log has no role warning | qc | | |
| CLG-6 | LG-db-6 | TLS keys mapped. Check (CLI): unit cases (`disable` no `ssl`, `require`, `verify-full` with PEM, missing path rejected naming the key, unreadable path rejected without content) green; smoke stays on `disable` and green (CLG-3) | qc | | |
| CLG-7 | LG-db-6, local `postgres:17-alpine` with `ssl=on` and a self-signed CA | `verify-full` really verifies. Check (CLI): `deploy:migrate` and the API boot succeed with the right CA and fail with a wrong CA and with a `DB_HOST` that does not match the certificate; no path to `rejectUnauthorized: false` from `verify-full` | security-qc | | |

#### Checkpoint LG-B: deploy guides and Postgres 17
Tasks: LG-db-4, LG-pg17 (after LG-pg17). BK-doc and RVOFF-doc edit the same guides after LG-db-4; when they are ready at the same time, the manager may run their checkpoints (CBK-4, CRVOFF-8) in the same qc run.
Inputs: checkpoint LG-A passed.
Outputs: the rows below.
Test tier: 3 (LG-pg17 changes `docker-compose.smoke.yml` and the test image); LG-db-4 alone is tier 1 (docs).
Doubts for QC: a runbook command whose psql variables do not match the script (`hosting`, `migrator_role`, `data_api_roles`); `6543` mentioned outside the "never use" sentence; a pod in the Secret map that gets a credential it does not need; an old dev-stack volume from 16 that does not start on 17 (the documented stop-and-remove command must work); `docs/architecture/10-local-setup.html` hand-edited instead of regenerated.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CLG-8 | LG-db-4 | Guides match the roles design. Check (CLI): `grep -n "open follow-up\|same Secret\|same \`envFrom\`" docs/deployment/*.md` finds nothing about DB roles; `grep -n "6543" docs/deployment/supabase-database.md` finds only the "never use" sentence; every runbook command matches `scripts/db/database-roles.sql` variables and the smoke hook; every env key named exists in `apps/cms-api/.env.example`; `pnpm format:check` and `EnvExample.contract.spec.ts` green; `devops-runbook.md` has no "pending LG-db-2/LG-db-4" mark left | qc | | |
| CLG-9 | LG-pg17, CLG-8 | Postgres 17 everywhere. Check (CLI): `grep -rn "postgres:16\|Postgres 16\|PostgreSQL 16\|pg_dump 16" --exclude-dir=node_modules --exclude-dir=.git .` finds only history; `pnpm --filter @abyss/cms-api test:integration` green on 17; `pnpm dev:stack` starts from an empty volume, then `pnpm dev:stack:stop`; `SMOKE_E2E=1 pnpm smoke` green; `pnpm docs:architecture` leaves no diff | qc | | |

#### Checkpoint LG-C: read-only live check script
Tasks: LG-2.
Inputs: RV-mask and RV-cv-3 (done); checkpoint LG-A passed (the smoke stack runs on the split roles).
Outputs: the rows below.
Test tier: 3.
Doubts for QC: a check that changes state (more than 3 failed logins, a lockout, an audit row other than the failed logins); the masking check comparing against known values instead of the masked paths; `transport` checks not skipped on `http://`; a check group with no shown FAIL path; helpers copied between `scripts/smoke/` and `scripts/launch-check/` instead of shared in `scripts/lib/`.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CLG-10 | LG-2, kept smoke stack | Script passes on the smoke origins. Check (CLI): `scripts/launch-check.sh --web <smoke web> --admin <smoke admin>` prints only `ok` lines and exits 0; `SMOKE_E2E=1 pnpm smoke` runs it as a step and stays green; `transport` skipped on `http://` | qc | | |
| CLG-11 | CLG-10 | Each group can fail and the script changes nothing. Check (CLI): for each of `headers`, `transport`, `auth`, `masking`, `injection` one FAIL line and exit 1 when an expectation is broken on the kept stack (for example a removed header); after a run, the security audit has at most 3 `auth.login_failed` rows from the run and no account or IP is locked | qc | | |

#### Checkpoint LG-D: whole-project security review and its fixes
Tasks: LG-1, LG-fix-* from LG-1 (after the last critical or high fix).
Inputs: checkpoints LG-A, LG-B and LG-C passed; all RV, BK-3 and RVOFF code committed.
Outputs: the rows below.
Test tier: 3 (fresh `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke`, dynamic review).
Doubts for QC: the verdict table predates D2a and D20 (BK-3 is committed, so LG-1 covers D20; ADR 0014 adds D2a); a fix that changes behaviour covered by e2e without a test update; a fix that touches a high-risk path without its own security gate.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CLG-12 | LG-1 | Review complete. Check: `.claude/state/findings/audit-<date>-security-launch.md` names the commit, has a verdict (holds / gap / not applicable) with a file reference for every SPEC §7 decision D1-D20 including D2a, and lists every finding with severity, scope, evidence and fix proposal; every critical and high finding is closed by a committed LG-fix task and re-reviewed; the stack is torn down | security-qc | | |
| CLG-13 | the LG-fix-* tasks from LG-1 | No regression from the fixes. Check (CLI): `SMOKE_E2E=1 pnpm smoke` green with an e2e count not lower than before the fixes; `pnpm test` and `pnpm --filter @abyss/cms-api test:integration` green | qc | | |

#### Checkpoint LG-E: live check of the deployed site (phase exit)
Tasks: LG-3, LG-fix-* from LG-3.
Inputs: checkpoint LG-D passed; LG-0 nine decisions and LG-db-7 owner results recorded in handoff.md by the manager; the site deployed by the user with the production config and not public (Q-LG1); the throwaway admin with 2FA (Q-LG2); reviewer features off in production (RVOFF, LG-0 item 8).
Outputs: the rows below.
Test tier: live (deployed production config), above tier 3.
Doubts for QC: LG-3's reviewer-flow walk cannot run while the RVOFF switch is off; it is replaced by the "off" checks (CLG-16) and the reviewer masking live check runs again before the switch goes on (ADR 0014 "Consequences"); a write probe left behind on the deployed site; cookie `Domain` set (must be host-only); real Turnstile and CSP together on the login dialog; the ZAP scan run without the user's second yes.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CLG-14 | deployed origins, LG-2 | Live script passes. Check (CLI): `scripts/launch-check.sh --web <web origin> --admin <admin origin>` all `ok`, `transport` included | qc | | |
| CLG-15 | CLG-14, the Q-LG2 account | Browser walk. Check (browser, Chromium, devtools): headers on web and admin; no console error and no CSP violation on the CV page, the login dialog and the admin pages; sign-in with TOTP; refresh cookie `Secure`, `HttpOnly`, `SameSite` per D14, `Path=/api/v1/auth`, host-only; after sign-out the refresh is refused | qc | | |
| CLG-16 | CLG-14, RVOFF in production | Reviewer features off on the deployed site. Check (CLI and browser): the four reviewer routes answer `404 REVIEWER_FEATURE_OFF`; `GET /status` on the web origin is 404; the web header has no "Reviewer access" button; the cms-api start log shows "Reviewer cleanup not started" | qc | | |
| CLG-17 | CLG-14 | Masking holds live. Check (CLI and browser): anonymous REST, GraphQL, the web HTML and the RSC payload contain no raw Q-RV6 value; masked fields are `***` or `null` and listed in `_maskedFields` | security-qc | | |
| CLG-18 | CLG-15, Q-LG3 | Write probes, before public only. Check: richtext with `<img src=x onerror=...>` and `<script>` is stored stripped and does not run on web or admin; an SVG and a renamed non-image upload get 415; all test documents and files are deleted and the deletion is listed in the findings file | security-qc | | |
| CLG-19 | CLG-14, the user's second yes right before (Q-LG5) | Outside scan. Check: OWASP ZAP passive baseline (official Docker image) against both origins; every alert triaged in `.claude/state/findings/audit-<date>-live-launch.md` | security-qc | | |
| CLG-20 | CLG-14..CLG-19, LG-fix-* from LG-3 | Gate verdict. Check: `audit-<date>-live-launch.md` lists every check above with result and evidence; no open critical or high finding; each medium fixed or accepted by the user in writing | security-qc | | |

Phase exit also needs, outside the table (user and manager): the throwaway admin disabled (user confirms) and the user's written launch approval.

### Direct request: reviewer features off by a deploy switch (RVOFF) — APPROVED 2026-10-28
Flat list, details in `todo.md` "Direct request: reviewer features off by a deploy switch (RVOFF)". Design: `docs/adr/0014-reviewer-feature-switch.md`. SPEC §7 D2a, §9 "Reviewer", §12-20. User answers 2026-10-28: Q-RVOFF1 test stacks keep both switches on; Q-RVOFF2 the cms-admin menu item stays with a notice. Build order: RVOFF-cfg -> RVOFF-api -> RVOFF-token ‖ RVOFF-web ‖ RVOFF-admin -> RVOFF-doc (after LG-db-4). RVOFF-cfg and RVOFF-api are done (qc tier 3 pass each, under the old per-task flow) and are not re-checked on their own; the checkpoint re-runs their switch-off behaviour together with the rest.

#### Checkpoint RVOFF-A: the switch works end to end
Tasks: RVOFF-api (done), RVOFF-token, RVOFF-web, RVOFF-admin (after the last of the three).
Inputs: RVOFF-cfg and RVOFF-api committed; RVOFF-token, RVOFF-web and RVOFF-admin built and through their commit gates (RVOFF-token through its security gate); Docker running; no other `abyss-smoke` stack.
Outputs: the rows below.
Test tier: 3 (smoke with both switches on, then a kept smoke stack with `cms-api` and `web` recreated with `REVIEWER_FEATURE_ENABLED=false` and `WEB_STATUS_PAGE_ENABLED=false`; browser rows on that kept stack). Stop the stack afterwards (`docker compose -p abyss-smoke down -v`).
Doubts for QC: `/status` baked at build time (Next.js static rendering) instead of read per request; a cached "off" 404 hiding the Reviewer button after switch-on (error responses outside the handler carry no `no-store`; open user question in handoff); a reviewer token issued while on still working after the restart on one path (REST, GraphQL or cms-admin); owner and admin tokens wrongly refused by the identity change; the web `isEnabled()` treating other 404s as "off"; cms-admin retrying the 4xx in a loop; the reviewer CV view not falling back to the public CV on 401.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CRVOFF-1 | all four tasks | On path unchanged. Check (CLI): `SMOKE_E2E=1 pnpm smoke` green with the full e2e count (all reviewer and `/status` specs pass) | qc | | |
| CRVOFF-2 | CRVOFF-1, kept stack recreated with both keys `false` | Reviewer routes off. Check (CLI): `GET /api/v1/reviewer/status` and `POST /api/v1/reviewer/sessions` (valid body) → 404 `REVIEWER_FEATURE_OFF`; `GET /reviewer/sessions` and `PUT /reviewer/settings` → 401 without a token, 404 `REVIEWER_FEATURE_OFF` with the owner's token; `app_settings` and `reviewer_sessions` row counts unchanged | qc | | |
| CRVOFF-3 | a reviewer token created on the stack before the restart | Old reviewer tokens refused. Check (CLI): that token gets 401 on a REST published-content read and on a GraphQL read; owner and admin tokens still get 200 on the same reads | qc | | |
| CRVOFF-4 | CRVOFF-2 | Cleanup job off. Check (CLI): the `cms-api` start log has "Reviewer cleanup not started: REVIEWER_FEATURE_ENABLED is off" and the config summary shows `reviewer.isFeatureEnabled: false` | qc | | |
| CRVOFF-5 | CRVOFF-2, same `web` image | `/status` off without a rebuild. Check (CLI): `GET /status` on the web origin → 404 with `WEB_STATUS_PAGE_ENABLED=false`; after recreating `web` with `true` (same image) → 200 with the card | qc | | |
| CRVOFF-6 | CRVOFF-2 | Web home with the switch off. Check (browser): `/` shows the public CV, no "Reviewer access" button, no error state, no console or CSP error | qc | | |
| CRVOFF-7 | CRVOFF-2 | cms-admin notice. Check (browser, as the owner): the Reviewer menu item is visible; the page shows "Reviewer access is turned off on this server" with the `REVIEWER_FEATURE_ENABLED` line, no toggle, no session table; the network panel shows no repeated status request; no console error | qc | | |

#### Checkpoint RVOFF-B: off and on steps documented
Tasks: RVOFF-doc.
Inputs: checkpoint RVOFF-A passed; LG-db-4 committed (same guide files). May run in the same qc run as checkpoint LG-B or CBK-4.
Outputs: the row below.
Test tier: 1 (docs).
Doubts for QC: the runbook order (owner toggle off first, then the keys, then restart) reversed; a `TURNSTILE_*` row that does not say it applies only when the switch is on; a key spelled differently from the `.env.example` files.

| num | input | output | checked | result | issues |
|---|---|---|---|---|---|
| CRVOFF-8 | RVOFF-doc | Guides carry the switch. Check (CLI): `docs/deployment/k3s-traefik.md` env tables list `REVIEWER_FEATURE_ENABLED` and `WEB_STATUS_PAGE_ENABLED` with production `false`; `docs/deployment/devops-runbook.md` has "Turn reviewer features off or on" in the ADR 0014 §5 order; `docs/local-run.md` says the dev stack and `pnpm demo` run with both switches on; every key matches `apps/cms-api/.env.example` and `apps/web/.env.example`; `pnpm format:check` green | qc | | |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Content engine harder than expected (tree diff, migrations) | High | Spiked in Phase 1; scope limited to additive migrations + explicit destructive flag |
| Masking leaks through a path that skips the serializer | High | Single serializer; integration test asserts that no raw sensitive value appears in any response body for a masked role (snapshot scan) |
| Scope creep toward GraphQL mutations/Group 2 | Medium | v2 backlog is explicit in SPEC §2; "Never" boundary |
| In-memory caches (revocation, presence, rate limit) wrong at >1 replica | Medium | v1 runs one replica; documented; revocation falls back to 5 s TTL |
| Single VPS data loss | High | Deploy guide requires nightly `pg_dump` off-site + restore drill (T38) |
| Tailwind duplication between ui-kit dist CSS and app CSS | Low | ui-kit ships prefixed/compiled CSS layer; verified in T03/T04 |

## Parallelization

Single worker by default. If parallel workers are added: Phase 1 ‖ Phase 2; T23/T24 ‖ T21/T22 once the T20 DTO contract is fixed; T29 ‖ T28.

## Open Questions

See SPEC §14 (Q1–Q6). Each blocks only the task marked above.
