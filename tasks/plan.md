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
