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
- T30 Web CV showcase, Server Components fetching through GraphQL (needs Q-G6, Q-G7)
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
