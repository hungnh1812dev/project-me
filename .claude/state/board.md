# Board — Abyss CMS v1

Source: `tasks/todo.md` (full acceptance criteria) · Spec: `SPEC.md` (approved 2026-10-20) · Finished phases 0-4, Ad-hoc DB1, phases R1, R4 and the old log: `archive/board-archive.md`
Decisions: Q1 Kysely=yes · Q2 invite-only · Q3 TOTP + email OTP (warn) · Q4 CLIENT_IP_HEADER optional, unset by default · Q5 sensitive = reference.phone, company (root + experience), github, email (confirmed) · Q6 owner reviewer-session log reuses the audit log
UI decisions: palette A (slate + muted blue), system font stack, no dark mode in v1, button order secondary-left/primary-right (end-aligned)
Open risks: braces 3.0.3 high DoS advisory (build-only, via tailwind CLI/shadcn; no fix published) · sprintf-js moderate (dev-only) · body-parser, multer and fast-uri advisories (pnpm audit --prod; need a dependency-bump task)

## Phase 5: Media
Base: 3aba2ba · Phase checks: qc pass (e2e 73/73, per task) · security pass (per task) · Checkpoint: pending user review

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T27 | Upload pipeline + Cloudinary adapter + list | apps/cms-api | done | d4a3394 |
| T28 | Safe delete + purge job | apps/cms-api | done | 854b479 |
| T29 | MediaInput + media library UI | apps/cms-admin, packages/form-commons | done | 9a33089 |

## Phase CA: cms-api clean-architecture audit
Source: `tasks/todo.md` "Architecture and navigation" · ADR `docs/adr/0006-cms-api-clean-architecture-layers.md` · Base: 38647bb · Phase checks: qc pending · security pending · Checkpoint: pending

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| CA1a | Audit identity and security-audit (layers L1-L8) | qc, security-qc | done (qc findings in AUDIT-CA1a.md; security pass after fix round 1; commit pending user) | - |
| CA1b | Audit access core, management, document auth | qc, security-qc | done (AUDIT-CA1b.md; security pass after fix round 2; expired-token fix routed to planner; commit pending user) | - |
| CA2 | Audit reviewer and media | qc, security-qc | done (AUDIT-CA2.md; security pass after fix round 2; commit pending user) | - |
| CA3 | Audit documents, graphql, content-types, health | qc | done (AUDIT-CA3.md; qc only; commit pending user) | - |
| CA4 | Audit content-engine and platform | qc | done (AUDIT-CA4.md; qc only; commit pending user) | - |
| CA5 | Consolidate CA findings, write CR refactor tasks | planner | done (CR list approved 2026-10-25) | - |

## Phase FN: file naming rule
Base: 0ae3c07
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| FN1 | SPEC §5 naming rule and per-package guards (core part) | core-builder | done (qc-cli tier 1 pass; user approved) | 0b03efe |
| FN1r | Revise the cms-api guard to FileNames.architecture.spec.ts + FileNames.constants.ts; drop kebab-case and *.config.ts exemptions; folder check | core-builder | done (qc-cli tier 1 pass; user approved) | 2e658fd |
| FN-api-1 | Rename cms-api src/architecture/ (26 files), tier 1 | core-builder | done (qc-cli tier 1 pass; user approved) | 0946024 |
| FN-api-2 | Rename cms-api root, common/, config/, contract/, infrastructure/ (53 files), tier 3 | core-builder | done (qc-cli tier 3 pass, smoke 205 e2e; user approved) | e2e3db9 |
| FN-api-3 | Rename the 14 cms-api module files left from CR (incl. CLI dist paths), Security gate yes, tier 3 | core-builder | done (qc-cli tier 3 pass, smoke 205 e2e; security pass after fix round 1; user approved) | bc628c0 |
| FN-api-4 | Rename cms-api test/ (49 files), remove the exception list, tier 1 incl. integration | core-builder | done (qc-cli tier 1 pass; one flaky timing run in Password.integration.spec, passed on rerun; user approved) | a080c89 |
| FN-bc-1 | Revise the base-config guard and rename base-config, tier 1 | core-builder | done (qc-cli tier 1 pass; root lint red in apps/e2e, pre-existing, FN-e2e-1; user approved) | 916a77e |
| FN-kit-1 | Rename form-commons folders to kebab-case and its files, tier 1 | ui-builder | done (qc-cli tier 1 pass; sortable-sheet.types.ts deletion approved; RichtextToolbar.ts name confirmed by planner; user approved) | 809eb0a |
| FN1b-kit | form-commons guard | ui-builder | done (qc-cli tier 1 pass; user approved) | d931937 |
| FN-web-1 | Rename web files, Security gate yes, tier 2 + production build | ui-builder | done (qc-browser tier 3 pass, e2e 205; security pass after fix round 1; user approved) | 6237458 |
| FN-web-2 | Drop the repeated Error from ReviewerError.errors.ts -> Reviewer.errors.ts (+ test), tier 1 | ui-builder | done (qc-cli tier 1 pass, web 152; user approved) | 8845886 |
| FN1b-web | web guard | ui-builder | done (qc-cli tier 1 pass, web 156; user approved) | e78f417 |
| FN-ad-1 | Rename cms-admin shell (app/, config/, lib/, components/, test/), tier 2 | ui-builder | done (qc-browser tier 2 pass, e2e 29; api-types.ts deletion approved; App.routes.tsx -> AppRoutes.setup.tsx per planner; user approved) | 7b6ba93 |
| FN-ad-2 | Rename cms-admin features/auth and features/security, Security gate yes, tier 2 | ui-builder | done (qc-browser tier 2 pass, e2e 12; security pass; useCurrentUser.query -> .state per planner; admin-session-retry assertion polled after 4 failed first runs; user approved) | 5562adb |
| FN-ad-3 | Rename cms-admin features access, media, content-types, reviewer, status, tier 2 | ui-builder | done (qc-browser tier 2 pass; tier 3 smoke pass, 205 e2e, reviewer-session all five; planner kept names as built; user approved) | b5be9e7 |
| FN-ad-4 | Rename cms-admin features/content and the feature registry, tier 2 | ui-builder | done (qc-browser tier 2 pass, e2e 110; planner: NavItems.test -> Features.registry.test, rest as built; user approved) | b0027d9 |
| FN-ad-5 | Drop the repeated Error from cms-admin auth and security error file names (Login, Password, Setup, Security .errors.ts), Security gate yes, qc-cli tier 1 + security-qc | ui-builder | done (qc-cli tier 1 pass, 395; security pass static; user approved) | 8580e6e |
| FN1b-admin | cms-admin guard, no exception list | ui-builder | done (qc-cli tier 1 pass, 399; user approved) | 875f218 |
| FN-e2e-1 | Rename apps/e2e files (205 tests stay), tier 2 | qc | done (qc-cli tier 2 dev 198/205 with 3 dev-only failures; tier 3 smoke pass 205; lint clean; user approved) | 5981747 |
| FN-e2e-2 | Merge small e2e constants (RunId, ContentTypes, TwoFactorAccount), ApiPaths.constants.ts -> Api.endpoints.ts, tier 1 | qc | done (qc-cli tier 1 pass: lint, typecheck, contract 3, 205 listed; user approved) | e48eaf5 |
| FN1c | e2e guard (word list in ADR 0008; test:contract renamed test:unit, approved) | qc | done (qc-cli tier 1 pass, 6 node tests; user approved) | e77d0b2 |
| FN-lint-1 | abyss/file-names ESLint rule in base-config (replaces the base-config guard; deletion approved) | core-builder | done (qc-cli tier 1 pass; user approved) | 25ba053 |
| ARCH-1 | Move cms-api architecture guards and analyzers from src/architecture to test/architecture; one SRC_ROOT (2 commits; user approved entry) | core-builder | done (qc-cli tier 1 pass, 138/1532; security pass static; user approved) | 6897e38, 65f6ed0 |
| FN-lint-api | cms-api opts into the rule; delete guard and FileNames.constants.ts (approved); ErrorContract.contract.spec.ts -> ErrorBody.contract.spec.ts | core-builder | done (qc-cli tier 1 pass, 1532; user approved) | b4604fb |
| FN-lint-ui | cms-admin, web, form-commons opt in; delete their three guards (approved) | ui-builder | done (qc-cli tier 1 pass; user approved) | e7787f9 |
| FN-lint-e2e | e2e opts in; delete guard (approved); AppContracts.contract.ts -> Apps.contract.ts | qc | done (qc-cli tier 1 pass; spec/test both accepted in both folders, user accepted; user approved) | ea0d157 |
| FN-hook-rename | Drop the hook word from 16 hook files (+6 tests), Security gate yes | ui-builder | done (qc-browser tier 2 + tier 3 smoke pass 205; security pass static; user approved) | 99f31f0 |

## Phase MF: micro-frontends
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| MF0 | User picks the micro-frontend option (ADR 0007) | user | done (option A: packages per feature, built together; user decision 2026-10-25, confirmed 2026-10-26) | - |

## Direct request: ET (expired API tokens)
Source: `tasks/todo.md` "Direct request: expired API tokens are not editable (ET)" · Answers in `handoff.md` Direct requests

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| ET1 | cms-api rejects PATCH on an expired token (409 API_TOKEN_EXPIRED), shared expiry rule | core-builder | done | 5db0108 |
| ET2 | cms-admin hides Edit on expired tokens, handles API_TOKEN_EXPIRED | ui-builder (qc e2e included; manual console/network/design walk not done) | done | 83cb2a6 |
| ET3 | e2e for the expired-token edit conflict (list refetch and Expired row after the 409) | qc | done | 1988376 |

## Ad-hoc: Dependencies
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| DEP1 | Bump body-parser (high DoS, runtime path) and fast-uri (moderate/low) to patched versions (pnpm audit) | core-builder | done (qc-cli tier 1 pass; multer high advisory still open, user decision; user approved) | 0ae3c07 |

## Notes
- Planner open questions Q-MF1..3, Q-CA1..4, Q-FN1..6, Q-SM1..4, Q-DV1..2 are waiting for the user (see `tasks/todo.md` / ADRs).
- Phase 5 checks were run per task under the old flow; no phase-level REGRESSION / PHASE review was run. Ask the user at the checkpoint whether to run them now.
- T38: no checks (docs only, Risk normal). Builder ran the guide's commands against the smoke stack; cluster YAML, real Traefik/Cloudflare client IP, rclone, SOPS and readOnlyRootFilesystem untested (see the guide's "not run" list).

## Ad-hoc: Docs
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D1 | Local run guide + k3s SOPS secret guide | docs | done | bfa3455 |

## Ad-hoc: Base config
Source: `tasks/todo.md` "Ad-hoc: Base config" (D2) · Order: core-builder (A) -> ui-builder (B) -> qc (C)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D2 | Rename prettier-config to base-config (@abyss/base-config): prettier, eslint, oxlint exports for all apps and packages | core-builder, ui-builder, qc | done (steps A 76d9058, B 1018286; C qc pass) | 76d9058, 1018286 |

## Ad-hoc: Base config (D3)
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| D3 | Build @abyss/base-config to dist/ and export from dist (supersedes D2 Q-BC4) | core-builder | done | 1713a2d |

## Ad-hoc: Root start scripts
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| S1 | Root start scripts: start:dev, start:cms-admin, start:web, start:cms-api | core-builder | done | c2c80a8 |

## Phase 8 (CI change): T37g
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| T37g | Remove e2e from CI; publish gated on app checks only | core-builder | done | 9afb986 |

## Ad-hoc: Format check fix
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| F1 | Ignore apps/e2e report output in prettier (format:check passes) | core-builder | done | b71cf76 |

## Ad-hoc: Owner setup
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| OS1 | Owner setup API (/setup/status, /setup/owner) + shared bootstrap audit | core-builder | done | c324e6b |
| OS2 | Admin /setup page + login notice | ui-builder | done | d4c929e |
| OS3 | Smoke stack creates owner via setup route; deploy and local docs | core-builder | done | a668623 |
| OS4 | e2e for closed state + browser check on fresh DB | qc (browser walk open, user) | done | 0d543d8 |

## Ad-hoc: Audit
Source: `tasks/todo.md` "Ad-hoc: Audit" (AU1a-AU6) · Read-only runs, findings in `.claude/state/findings/AUDIT-<area>.md` · Order: AU1a, AU1b, AU1c, AU2, AU3, AU4, AU5, then AU6

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| AU1a | Audit cms-api identity, access, reviewer, media | qc, security-qc | done (findings in AUDIT-AU1a.md, triage at AU6) | - |
| AU1b | Audit cms-api content-engine, content-types, documents, graphql | qc, security-qc | done (findings in AUDIT-AU1b.md, security merged; triage at AU6) | - |
| AU1c | Audit cms-api common, config, infrastructure | qc, security-qc | done (findings in AUDIT-AU1c.md, security merged; triage at AU6) | - |
| AU2 | Audit cms-admin | qc, security-qc | done (findings in AUDIT-AU2.md, security merged; triage at AU6) | - |
| AU3 | Audit web | qc, security-qc | done (findings in AUDIT-AU3.md, security merged; triage at AU6) | - |
| AU4 | Audit form-commons | qc, security-qc | done (findings in AUDIT-AU4.md, security merged; triage at AU6) | - |
| AU5 | Audit tooling and test code | qc, security-qc | done (qc 17 findings; security on -03 running) | - |
| AU6 | Consolidate findings, decide G6, propose R1-R4 | planner | done (user approved R1-R4) | - |
