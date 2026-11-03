# Spec: Abyss Headless CMS & Portfolio (v1)

Status: **Approved 2026-10-20** · Date: 2026-10-20. Amended: 2026-10-21 (web on Next.js, GraphQL read API: §2, §3, §5, D17, D18, §9; D18 details pending Q-G1..Q-G7) · 2026-10-22 (one-time owner setup route: §1, §2, D1, D15, D17, §9, §12-1, Q2; details pending Q-OS1..Q-OS4) · 2026-10-23 (smoke seed CLI: D1, D15, D17, Q2) · 2026-10-23 (R1-00 module directions from the audit: §2, §5, §10 constants line) · 2026-10-27 (recruiter reviewability and launch gate: §4 `pnpm demo`, §5 web CV files, D2 masking mechanism, §13 launch gate, §14 Q5/Q-G6/Q-G7 answered; ADR 0011) · 2026-10-27 (backup download: §2, §3, D20, §9; ADR 0013; Q-BK1..Q-BK7 answered) · 2026-10-31 (web BFF, reviewer mode removed from web, homepage status, web hardening: §2, §5 web rules, §6, D2a, D7, D14, D17, new D21, §9, §12-20..25; ADR 0017; pending Q-BFF1..Q-BFF5) · 2026-11-03 (media upload fixes: new §15, §6 upload timeout row, D12 stored file name and rename migration; Q-MU1..Q-MU6 answered) · 2026-11-03 (remember me, approved by the user 2026-11-03: new §16, §6 TTL and refresh cookie rows, D21 session, new D22, §8.1 `refresh_tokens.remember_me`, §9 login bodies, §12-26, §12-27; Q-RM1..Q-RM8 answered). Supersedes `CMS_Requirements_And_Architecture_Spec.html`, `CMS_Implementation_Planning.html`, `CMS_Project_Tasks.html` (kept for history; this file wins where they disagree).

Related: [tasks/plan.md](tasks/plan.md) · [tasks/todo.md](tasks/todo.md)

---

## 0. Assumptions (correct these before implementation starts)

1. One owner (the portfolio author) plus a few invited editors/admins. Not multi-tenant.
2. One VPS, K3s + Traefik, **one replica per app in v1**. In-memory caches only where marked, each saying what changes at more than one replica.
3. PostgreSQL 17 on a Supabase free project, via the session pooler with TLS (amended 2026-10-27, user decision, ADR 0012 §9, D19); the in-cluster StatefulSet with a PVC stays the documented self-managed alternative. The separate deploy repo owns backups; this repo documents what they must cover.
4. Public self-registration is **off**; accounts are created by invitation.
5. v1 scope is cut down (§2). To v2: GraphQL mutations/subscriptions (a read-only GraphQL query API is in v1, D18), Group 2 runtime DDL, reviewer write sandbox, S3, Yup.
6. Domains: `domain.com` (web + API under `/api/v1`) and `admin.domain.com` (cms-admin).

---

## 1. Objective

Build a headless CMS that is:

1. **Content hub:** the owner manages and publishes CV/portfolio content defined by JSON schemas (root + up to 3 nested component levels), served over REST, plus a read-only GraphQL query API for document reads (D18).
2. **Technical showcase:** ERP-grade concerns that hold up under attack: hybrid RBAC + field-level permissions with `***` masking, draft/publish with optimistic concurrency and diff/merge, an always-on security audit, and a safe "Login as Reviewer" experience.

Actors (threat model):

| Actor | How they get in | Can do (v1) |
|---|---|---|
| Anonymous | none | Read **published** content through the `public` role's field profile |
| Reviewer | Self-service session (Turnstile + rate limit), 24h, when Owner enables it and the deploy switch `REVIEWER_FEATURE_ENABLED` is `true` (D2a) | Read published content through the `reviewer` role's field profile, browse preset media. **No writes, no drafts.** |
| Editor (rank 30) | Invitation | Permissions granted to their role |
| Admin (rank 40) | Invitation | Manage accounts/roles/tokens **strictly below** rank 40, plus their role's content permissions |
| Owner (rank 100) | One-time setup page with the setup token while no owner exists, or the `owner:bootstrap` CLI (D1) | Everything |
| API token | Created by an Admin/Owner session | ≤ creator's **current** permissions, content endpoints only |

Success = every item in §12 has a passing automated test.

---

## 2. Scope

### Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `platform` | Monorepo, tooling, config/env validation (`src/config`), HTTP pipeline and pure helpers (`src/common`), shared adapters and ports (`src/infrastructure`: database, mail, logging, scheduling), Prisma client (`src/generated`), Docker | — |
| `ui-kit` | `@abyss/form-commons`: shadcn base + form components, built to `dist/` | platform |
| `content-engine` | JSON schema → validated definition → SQL migrations for `content` schema, tree repository | platform |
| `health` | Liveness and readiness endpoints | platform |
| `access` core | Policy evaluation, actor context, system roles and default permissions, subject catalog, field projection/masking, record serializer, write allowlist, revocation versions, permission and API-token guards, rank rules | platform, content-engine |
| `security-audit` | Security audit log (D15): `SecurityAuditService`, `writeAuditLog`, audit actions and reasons, email HMAC | platform, access core (types only) |
| `identity` | Owner bootstrap (CLI + one-time setup route), smoke seed CLI, invitation acceptance, login, refresh rotation and session revocation, access-token issuing (incl. reviewer tokens), OTP, TOTP 2FA, password lifecycle, rate limits | platform, access core, security-audit |
| `access` management | Accounts, roles and API tokens: admin endpoints, services, requests, constants (`access/management/`) | platform, access core, identity, security-audit |
| `access` document auth | `DocumentAuthGuard` for document reads (JWT, API token or anonymous), own small module (`access/document-auth/`, own `index.ts`) | platform, access core, identity |
| `content-types` | Read-only content-type catalog filtered by the caller's permissions (feeds the admin permission matrix) | platform, content-engine, access core, identity (auth guard only) |
| `media` | Upload pipeline, storage port use, file library, media references, safe delete | platform, content-engine, access core, identity (auth guard only), security-audit |
| `documents` | Document CRUD, OCC/409, draft/publish deep clone, presence, bulk (collections) | platform, content-engine, access core, access document auth, media |
| `graphql` | Read-only GraphQL over document reads (D18): schema generated from content definitions, same authz and serializer as REST | platform, content-engine, access core, access document auth, documents |
| `reviewer` | Reviewer toggle, session creation, field profile, owner log, cleanup | platform, access core, identity, security-audit |
| `backups` | Owner-only list of nightly dumps in the backup bucket and 60 s download links after re-authentication (D20); read-only on the bucket | platform, access core, identity, security-audit |
| `admin-app` | cms-admin UI | ui-kit + the API modules it uses |
| `web-app` | Public CV site (Next.js) with its BFF (`/bff/v1`, D21), login with Turnstile, homepage service status; reaches cms-api only from the Next server (`API_INTERNAL_URL`); no reviewer entry (ADR 0017) | ui-kit, graphql, identity |

Dependency order (lowest first): `platform` → (`ui-kit`, `content-engine`, `health`) → `access` core → `security-audit` → `identity` → (`access` management, `access` document auth, `content-types`, `media`, `reviewer`, `backups`) → `documents` → `graphql` → app slices. UI work goes into each vertical slice, not a separate phase.

### Module directions (cms-api)

Amended 2026-10-23 (audit G6): the map follows the code and is the one authority for which module may import which.

- A file in module A may import from module B only when B is in A's "Depends on" cell; no cycles. `apps/cms-api/test/architecture/ModuleEdges.constants.ts` (`ALLOWED_MODULE_EDGES`) mirrors the cms-api rows row for row; change both together.
- `platform` (`src/common`, `src/config`, `src/infrastructure`, `src/generated`) never imports `src/modules/**`. The composition root (`app.module.ts`, `app.setup.ts`, `bootstrap.ts`, `main.ts`) may import any module.
- `access` is one folder with three parts, by folder (Q-CA15c): core `access/<layer>/` with `access/Access.module.ts` and `access/index.ts`; management `access/management/<layer>/` and document auth `access/document-auth/<layer>/`, each with its own module file and `index.ts`. Core never imports `identity`; only management and document auth do. `AccessModule` (core) imports `ContentEngineModule`.
- "types only" = `import type` (security-audit uses the `ActorContext` and `SystemSubject` types). "auth guard only" = the JWT guard and `AuthenticatedRequest`, nothing else.
- Other modules use a module only through its `index.ts` (public interface), never internal files.
- `KNOWN_VIOLATIONS` (edges the code has but the table forbids) is empty and must stay empty.
- Adding a module: one table row and one `ALLOWED_MODULE_EDGES` entry in the same change.
- **Layers inside a module** (amended 2026-10-25, ADR 0006 §1-2, §7). A module folder holds only the layer folders it needs (`domain/`, `application/`, `adapters/`, `http/`, `cli/`, `jobs/`) plus wiring files `<Module>.module.ts` and `index.ts`. `apps/cms-api/test/architecture/LayerRules.constants.ts` (`LAYER_RULES`) mirrors this bullet; change both together. A layer may import:
  - `domain/`: own `domain/`; another module's facade along a module edge with `import type` only, except the pure helpers in `DOMAIN_CROSS_MODULE_HELPERS` (Q-CA6); pure platform folders; no package but `zod`, `sanitize-html` (Q-CA5) and `createHash` from `node:crypto`. No `process.env`, `new Date()` or `Date.now(`.
  - `application/`: own `domain/`, `application/`; other modules' facades (not their `http/` exports); pure platform folders, platform ports, `config/`. From `@nestjs/*` only `Injectable` and `Inject` (Q-CA1); never `express`, `@prisma/*`, `src/generated/**` (`import type` included), `kysely`, `pg`, `passport*`, `process.env`, `new Date()` or `Date.now(`.
  - `adapters/`: own `domain/`, `application/`, `adapters/`; other modules' facades (not their `http/` exports); pure platform folders, platform ports and adapters, `config/`, `src/generated/`; any package.
  - `http/`: own `domain/`, `application/`, `http/`; other modules' facades incl. their exported guards and decorators; pure platform folders, the HTTP pipeline, `config/`; never `@prisma/*`, `kysely` or `pg`.
  - `cli/`: own `domain/`, `application/`, `adapters/`, `cli/`; other modules' facades (not their `http/` exports), incl. an adapter a facade exports (`loadDefinitions`, Q-CA14b); pure platform folders, platform ports and adapters, `config/`, `src/generated/`; any package. A CLI builds adapters and hands them to use cases.
  - `jobs/` (Q-CA7): own `domain/`, `application/`, `jobs/`; other modules' facades (not their `http/` exports); pure platform folders, `config/`, `infrastructure/scheduling/`. From `@nestjs/common` only `Injectable`, `Inject`, `Logger` and lifecycle hooks; never `express`, `@prisma/*`, `kysely`, `pg` or `passport*`. A job calls use cases only.
  - Wiring (`<Module>.module.ts`, `index.ts`): anything in the module. A facade never exports `adapters/` (except `loadDefinitions`).
  - Platform folders by role (ADR 0006 §7.6): pure = `common/{constants,errors,time,types,validation}/`; HTTP pipeline = `common/{http,middleware,filters,guards,rate-limit}/`; ports = `infrastructure/**/*.port.ts`; job runner = `infrastructure/scheduling/`; every other `infrastructure/` file is an adapter.
  - Named exceptions only in `LAYER_EXCEPTIONS`: `kysely` in `access/domain/PolicyEvaluator.ts` and `access/domain/Conditions.rules.ts`, seen by other modules as the opaque `RowFilter` type (Q-CA17); `documents` reading the access field projection by file (D3). `src/contract/` is not module code and not checked (`LAYER_EXEMPT_ROOTS`); the guards live in `test/architecture/`, outside `src/`. Deep imports into another module stay banned for every layer.
  - `Layers.architecture.spec.ts` checks every module: no file outside its layer folders and wiring files. `KNOWN_LAYER_VIOLATIONS` is empty and must stay empty.

### Frontend directions

- **cms-admin layers** (higher imports lower, never the reverse): `main.tsx` → `app/` (composition root: store, providers, shell, routes) → `features/*` → `components/`, `lib/` → `config/`. `lib/` and `components/` import no feature and no `app/`; features import no `app/`. Only `app/` imports `features/auth/app-wiring.ts`.
- **cms-admin feature order** (a feature imports only features to its left, via their `index.ts`): `auth` < `security` < `content-types` < `access` < `media` < `content`, `reviewer`. `status` imports no other feature. `content-types` owns the `ContentType` / `ContentTypeField` model and `getContentTypes`, read by `access`, `media`, `content` and `reviewer`.
- **web layers** (amended 2026-10-31, ADR 0017 §6): `app/` (pages, shell incl. `AccountMenu`, BFF route files `app/bff/v1/**/route.ts`) → `features/*` → `features/session` → `apis/` (browser client of the BFF; cms-api server clients and the BFF pipeline in `apis/server/`) → `libs/`, `utils/` → `configs/`. A BFF route file only binds its path to `defineBffRoute(...)` with one feature function. `apis/server/**` imports no feature. `auth`, `status` and `cv` import no feature other than `session`. Cross-feature imports go through `index.ts`. No `reviewer` feature on web.

### In scope (v1)

Everything in the map above. Collections get bulk create/publish/unpublish/delete.

### Out of scope (v2 backlog — do not build in v1)

GraphQL mutations, subscriptions and non-document reads · Group 2 owner-private runtime DDL · reviewer write sandbox · S3 adapter for media (the read-only backup bucket client of D20 is in scope, user request 2026-10-27) · Yup support · SSO across unrelated domains · multi-replica deployment.

---

## 3. Tech Stack

| Area | Choice |
|---|---|
| Package manager / build | pnpm workspaces + Turborepo |
| API | NestJS 11 on **Express**, TypeScript strict |
| Core persistence | Prisma (PG schema `public`, system tables only) via `@prisma/adapter-pg` |
| Content persistence | Generated SQL migrations in PG schema `content`; queries through **Kysely**, parameters only (D10; confirm, new dependency) |
| Auth | Passport-JWT, `argon2` (Argon2id), `otplib` (TOTP) |
| GraphQL (cms-api) | `graphql` (graphql-js) with an in-house handler inside the Nest pipeline, no Apollo/Yoga (D18; dependency pending Q-G1) |
| Admin (cms-admin) | React 19 + Vite SPA served by nginx, Redux Toolkit (session/UI), TanStack Query (server data), Axios, REST only |
| Web (apps/web) | **Next.js 16 App Router** (pinned ≥ 16.2.5), `output: 'standalone'` run by Node (no nginx); Server Components by default; server data fetched **through GraphQL** (anonymous, from `API_INTERNAL_URL`, data cache `WEB_REVALIDATE_SECONDS`: 60 s production, 0 smoke); browser state with React context + TanStack Query + Axios, **no Redux**; DOMPurify on server and client (D13); Tailwind v4 via `@tailwindcss/postcss` |
| UI kit | shadcn/ui + Tailwind, react-hook-form + Zod, Tiptap, CodeMirror 6 |
| Media | Cloudinary, `sharp` for re-encoding, `file-type` for magic bytes |
| Backups | Cloudflare R2 bucket (Q-BK5), read by cms-api via the official S3 SDK, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (D20, Q-BK7 answered 2026-10-27); adapter tests use `testcontainers` with an S3 stand-in image; dumps encrypted with `age` by the deploy repo's job |
| Bot protection | Cloudflare Turnstile (server-side verification) |
| Tests | Jest + Supertest + Testcontainers (Postgres 17) for API · Vitest + Testing Library for UI · Playwright for e2e |

---

## 4. Commands

```bash
pnpm install
pnpm demo                       # whole product on the dev stack + reviewer access on + sample content (ADR 0011); stop: pnpm dev:stack:stop
pnpm turbo run build            # builds @abyss/form-commons dist/ first, then apps
pnpm turbo run lint typecheck
pnpm turbo run test             # unit + integration (Testcontainers needs Docker)
pnpm --filter @abyss/cms-api test:e2e
pnpm --filter @abyss/cms-api db:migrate         # Prisma core migrations (public schema)
pnpm --filter @abyss/cms-api content:generate   # schemas/*.json -> content migrations (+ dry-run diff)
pnpm --filter @abyss/cms-api content:migrate    # apply content migrations
pnpm --filter @abyss/cms-api owner:bootstrap    # one-time; fails if an owner exists
pnpm --filter @abyss/cms-admin dev
pnpm --filter @abyss/web dev
pnpm format                     # Prettier (required before every commit)
pnpm --filter @abyss/e2e test   # Playwright
```

---

## 5. Project Structure

```
abyss/
├── abyss.code-workspace # multi-root: one folder per app/package
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json (compilerOptions only)
├── packages/
│   ├── base-config/ # @abyss/base-config: exports prettier, eslint, oxlint
│   └── form-commons/ # @abyss/form-commons, exports ./dist only
│       └── src/{components/ui, components/forms, constants}
├── apps/
│   ├── cms-api/ # @abyss/cms-api
│   │   ├── prisma/ # core schema + migrations (public)
│   │   ├── content/ # schemas/*.json + generated migrations/ + schema.graphql (printed SDL, D18)
│   │   ├── src/
│   │   │   ├── main.ts · Bootstrap.setup.ts · App.module.ts · App.setup.ts # composition root
│   │   │   ├── config/ # Env.schema.ts (Zod), AppConfig.setup.ts (frozen IAppConfig), Config.constants.ts, Config.module.ts
│   │   │   ├── common/ # pure: constants/, errors/ (DomainError), time/ (Clock.service.ts, Clock.module.ts), types/, validation/
│   │   │   │ # HTTP pipeline: filters/, guards/, http/ (incl. ClientIp.module.ts), middleware/, rate-limit/ (incl. ThrottleSubject.port.ts)
│   │   │   ├── generated/ # Prisma client (generated; never edited)
│   │   │   ├── infrastructure/ # adapters and *.port.ts used by several modules: database/ (TransactionRunner.port.ts), mail/, logging/ (AppLogger.port.ts),
│   │   │   │ # scheduling/; activity/, media/, turnstile/ and the database-health port live in documents, media, reviewer, health (Q-CA14a)
│   │   │   └── modules/ # one folder per §2 module: identity/, access/ (core <layer>/ + management/<layer>/ + document-auth/<layer>/, Q-CA15c),
│   │   │       │ # security-audit/, content-engine/, content-types/, documents/, graphql/, media/, reviewer/, health/
│   │   │       └── <module>/ # {domain,application,adapters,http,cli,jobs}/ (only the layers it needs, §2), <Module>.module.ts, index.ts (facade)
│   │   └── test/ # integration/, fixtures/, architecture/ (*.architecture.spec.ts guards + *.analyzer.ts source readers,
│   │ # ModuleEdges.constants.ts, LayerRules.constants.ts (LAYER_RULES, §2), SourcePaths.constants.ts (SRC_ROOT);
│   │ # run by the jest `unit` project, not compiled into dist/)
│   ├── cms-admin/ # @abyss/cms-admin, React 19 + Vite SPA
│   │   └── src/
│   │       ├── main.tsx # entry
│   │       ├── app/ # composition root: store.ts, query-client.ts, app-services.ts, AppProviders.tsx, App.tsx (routes), AppShell.tsx
│   │       ├── features/ # auth/, security/, content-types/, access/, media/, content/, reviewer/, status/: pages, *.api.ts, auth.slice.ts, *-queries.ts, <feature>.constants.ts
│   │       ├── components/ # app UI shared by features, no feature knowledge (Modal.tsx)
│   │       ├── lib/ # api-client.ts and other feature-free helpers
│   │       ├── config/ # env.ts, endpoints.ts, routes.ts, http.constants.ts, auth.constants.ts, copy.constants.ts
│   │       └── styles/ # app.css
│   ├── web/ # @abyss/web, Next.js 16 App Router, standalone Node server
│   │   ├── next.config.ts · postcss.config.mjs · vitest.config.ts · Dockerfile · public/
│   │   └── src/
│   │       ├── proxy.ts # per-request nonce + CSP header (D17)
│   │       ├── instrumentation.ts · instrumentation-node.ts
│   │       ├── app/ # routes and shell: layout.tsx, page.tsx, not-found.tsx, providers.tsx, query-client.ts, CspNonce.tsx, AccountMenu.tsx
│   │       ├── config/ # env.server.ts (server-only), env.client.ts (NEXT_PUBLIC_* only), require-env.ts, endpoints.ts, shared *.constants.ts
│   │       ├── lib/ # api-client.ts (browser Axios), content-security-policy.ts, api-failure.ts; Graphql.server.ts, Graphql.client.ts, SafeRichtext.rules.ts
│   │       ├── app/bff/v1/ # BFF Route Handlers (D21); their pipeline and cms-api clients in apis/server/ (ADR 0017 §6, §8)
│   │       └── features/ # session/ (who is signed in; sealed BFF session cookie server-side), auth/ (sign-in UI, Turnstile), status/, cv/ (reviewer/ removed, D21):
│   │ # *.api.ts, *.graphql.ts (GraphQL documents), *.server.ts, client components
│   └── e2e/ # @abyss/e2e Playwright
└── docs/{adr, modules, deployment}
```

Tree names are the names on disk today and predate the naming rule (ADR 0008); the code is the authority for exact names. Phase FN tasks rename them to the rule below; the planner updates the tree when phase FN closes.

Naming rules (ADR 0008, user decisions 2026-10-25/26, revision 3 accepted 2026-10-26 with Q-FN12..Q-FN16): one format in every TypeScript package (cms-api, cms-admin, web, form-commons, e2e, base-config), for `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` only; other file types (CSS, JSON, Markdown, shell scripts, images) keep their conventions (Q-FN13). The general rule is `code-standards` §4.5 "File and folder names" (agent layer, project-agnostic; each project has its own copy, naming nothing from this repo, Q-FN15): folders `kebab-case`; files `<use><PascalCase>.<feature>.<ext>`, `<use>` only when the main export is one React hook, `<feature>` one optional word only when needed, never by habit. Repo specifics:

- Framework folder syntax kept (Next.js `[param]`, `(group)`, `_private`); e.g. `content-engine/`, `bulk-action-bar/`.
- Files `<PascalName>.<feature>.<ext>` when a word is needed (`Health.controller.ts`, `TransactionRunner.port.ts`, `ApiTokenExpiry.rules.ts`), else `<PascalName>.<ext>`. `<PascalName>` never repeats its word (`Security.errors.ts`, not `SecurityError.errors.ts`); error files `<Feature>.errors.ts`, or `<Flow>.errors.ts` when a feature has several (`Login.errors.ts`). Hooks: `use<PascalName>.<ext>`, no hook word (`useSetupStatus.ts`, `useCurrentUser.ts`, `useHumanCheck.tsx`; Q-FN12); a word only if the general rule needs one (tool/config selects by it, or it separates same-named files in a folder), none today. Hook words `query`, `mutation`, `state` are retired; task FN-hook-rename drops them from the 16 hook files still carrying them.
- Word test (first match decides): one hook → `use<PascalName>.<ext>`; several TanStack hooks of one feature → `<Feature>.queries.ts`, no `use`; one React component (pages included) → no word, file = component name (`LoginPage.tsx`, `Button.tsx`); cms-api and apps/e2e files always carry a word (Nest roles, layer rules, Playwright / Jest globs select by it); otherwise only when a tool/config selects by it or it separates same-named files in a folder.
- Open word set (revision 3): the table below is the vocabulary in use, not an allow-list; one meaning, one word. If no row fits, the builder picks one plain lower-case word, never vague (`helper`, `util`, `utils`, `misc`, `common`, `types`, `component`), lists it in the unit record, and the planner adds the row. No guard or constants file lists the words.
- Tests: package suffix on the full name, `.spec.ts` in cms-api and e2e (e2e `tests/`), `.test.ts(x)` elsewhere and for the e2e `node:test` checks in `apps/e2e/src/` (`AccessPolicy.service.spec.ts`, `useSetupStatus.test.ts`, `LoginPage.test.tsx`); scenario splits add one lower-case variant before the suffix (`AccountMenu.login.test.tsx`).
- Kept as is: framework-fixed names (`index.ts`, `main.ts(x)`, `.d.ts`, Next.js `page.tsx` / `layout.tsx` / `not-found.tsx`, `proxy.ts`, `instrumentation.ts`), package-root tool configs (`vite.config.ts`, `eslint.config.mjs`, ...), generated code. Types-only and re-export-only files merge into their nearest neighbour (`code-standards` §4.4).
- Check: ESLint rule `abyss/file-names` (owner `@abyss/base-config/eslint`), on via `baseEslint({ fileNames })` for `src/`, `test/`, `tests/` of each package passing `fileNames` (all six after FN-lint-*; ADR 0008 revision 3). It checks `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` (Q-FN13): shape (no word list), kebab-case folders, `use` prefix <-> one exported React hook, a word repeating its name, the required word (cms-api, e2e), test suffix per folder. Each package passes only its options (framework file names, route-segment folders, test suffixes, word required). Whether a word was needed is a review check, not lint. Until FN-lint-api / -ui / -e2e land, the per-package `FileNames.architecture.spec.ts` / `.test.ts` guards stay.
- A `.port.ts` sits in a cms-api module's `application/`, in `src/infrastructure/` (role `port`: `application/` may import it), or in a `src/common/` pipeline folder as a seam the app binds (its folder's role, e.g. `pipeline`: only `http/` may import it; `ThrottleSubject.port.ts`). One endpoint map per frontend in `src/config/` (`Api.endpoints.ts`), one for e2e in `apps/e2e/src/Api.endpoints.ts` (FN-e2e-2).

Words in use (open vocabulary; at most one per file; the planner adds a row when a builder reports a new word; React components have no row on purpose; "Where" = used today):

| Word | Where | Holds | Example |
|---|---|---|---|
| `setup` | all | app wiring and bootstrap; app config loading; a test-runner hook (global setup/teardown, setup file) | `App.setup.ts`, `AppConfig.setup.ts`, `Jest.setup.ts` |
| `module` | cms-api | a Nest module (wiring only) | `Identity.module.ts` |
| `controller`, `requests` | cms-api `http/` | a Nest controller; the Zod request schemas and parsers of one controller | `Accounts.controller.ts`, `Accounts.requests.ts` |
| `routes` | cms-api; frontends | one module's route group (`common` keeps only the API prefix); frontend UI routes | `Identity.routes.ts`, `App.routes.ts` |
| `guard`, `decorator`, `middleware`, `filter` | cms-api `http/`, `common/` | Nest pipeline roles | `ApiToken.guard.ts` |
| `resolver`, `executor` | cms-api `http/`, `common/` | a Nest or GraphQL resolver; a transport executor (GraphQL) | `Document.resolver.ts`, `Graphql.executor.ts` |
| `service` | cms-api `application/`; `common/`, `infrastructure/` | use cases of one aggregate; outside `modules/`, one shared injectable provider | `Invitations.service.ts`, `Clock.service.ts`, `Prisma.service.ts` |
| `port` | cms-api `application/`, `infrastructure/`, `common/` | an interface plus its injection token | `Account.port.ts`, `ThrottleSubject.port.ts` |
| `entity` | cms-api `domain/` | domain types | `Account.entity.ts` |
| `rules`, `errors` | cms-api `domain/`; frontends | pure rules; errors and error mapping | `RankRules.rules.ts`, `Access.errors.ts` |
| `repository`, `adapter` | cms-api `adapters/` | a repository port implementation; any other port implementation | `PrismaAccount.repository.ts`, `Cloudinary.adapter.ts` |
| `client` | all | a client of an outside system (HTTP, SDK) | `Turnstile.client.ts` |
| `command`, `job`, `store`, `strategy` | cms-api (`store` also cms-admin) | CLI entry point, scheduled job, in-memory or Redux store, passport strategy | `OwnerBootstrap.command.ts`, `MediaPurge.job.ts` |
| `constants` | all | named constants (placement below) | `Access.constants.ts` |
| `schema` | cms-api `config/` | a Zod schema that is not a request schema | `Env.schema.ts` |
| `architecture` | all | a structure guard | `ImportGraph.architecture.spec.ts` |
| `analyzer` | cms-api `test/architecture/` | a source-tree reader used by the guards | `ImportGraph.analyzer.ts` |
| `integration` | cms-api `test/integration/` | an integration suite | `Auth.integration.spec.ts` |
| `e2e` | e2e `tests/` | a Playwright suite | `SideMenu.e2e.spec.ts` |
| `contract` | all | values pinned across packages, or the test pinning them | `PublicConstants.contract.ts` |
| `snapshot` | cms-admin, form-commons | a checked-in snapshot a test compares against | `PublicApi.snapshot.ts` |
| `fixture` | tests | test data and test helpers | `Merge.fixture.ts`, `RenderApp.fixture.tsx` |
| `api` | frontends | one feature's HTTP calls | `Access.api.ts` |
| `queries` | frontends | one feature's TanStack Query keys and hooks, reads and writes (Q-FN11) | `Access.queries.ts` |
| `context` | frontends | a React context and its provider | `AccessApi.context.tsx` |
| `env`, `endpoints` | frontends `config/`; e2e `src/` | reads and checks env values; the API endpoint map | `Server.env.ts`, `E2e.env.ts`, `Api.endpoints.ts` |
| `registry`, `feature` | cms-admin | a lookup table of variants; a feature's `Feature` contract | `Features.registry.ts`, `Media.feature.ts` |
| `form`, `columns`, `interceptor`, `reducer` | frontends | form schema and defaults; table columns; Axios interceptor; pure reducer | `Password.form.ts`, `Account.columns.tsx` |
| `styles` | form-commons | class-name maps for one component | `Richtext.styles.ts` |
| `slice` | cms-admin | a Redux Toolkit slice | `Auth.slice.ts` |
| `copy` | frontends | one copy section | `Access.copy.ts` |
| `graphql`, `server` | web | a GraphQL document; server-only code | `CvPage.graphql.ts`, `Content.server.ts` |

Constants placement (Q-A1): a constant lives next to its one owning module or feature, in `<Module>.constants.ts` (cms-api) or `features/<feature>/<Feature>.constants.ts` (frontends; lower-case names until phase FN renames them); others read it through the owner's `index.ts`. cms-api `common/constants/` and frontend `config/` hold only values shared by several modules or the app shell (env, endpoints, routes, HTTP, auth, copy).

Web rules: Server Components by default; `'use client'` only for state, effects, handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import. Files that read server env or call `API_INTERNAL_URL` import `server-only`. The browser never holds a user token and never calls cms-api: every browser call goes to the BFF Route Handlers under `/bff/v1` on the web origin, which keep the cms-api tokens in a sealed HttpOnly cookie (D21, amended 2026-10-31, ADR 0017; replaces the earlier "the Next server never holds a token" rule). No Server Actions. No `store/` on web.

---

## 6. Canonical Values (resolves every contradiction in the old docs)

| Item | Value |
|---|---|
| API base path / port | `/api/v1` · container port `3000` |
| Health | `GET /api/v1/health/live`, `GET /api/v1/health/ready` → `{ "status": "ok" }` only (no internals) |
| Trailing slash | Express `strict routing` off; clients strip trailing `/`; Traefik never uses StripPrefix |
| Role slugs / ranks | `public` 0 · `guest` 10 · `reviewer` 20 · `editor` 30 · `admin` 40 · `owner` 100 (lowercase everywhere) |
| Custom role rank range | 11–39 |
| Permission actions | `read` `create` `update` `delete` `publish` `unpublish` |
| Mask sentinel / key | `"***"` for string/text/richtext · `null` for other types and components · `_maskedFields: string[]` |
| Access / refresh TTL | 15 min / 7 days when "Keep me signed in" is ticked, else 12 hours with a session cookie (rotated on every refresh, §16) |
| OTP | 6 digits, TTL 300 s, 5 attempts per code, max 5 issued per account per hour, single-use |
| 2FA temp token | TTL 300 s, 5 attempts |
| Presence | heartbeat every 20 s, entry TTL 45 s |
| Component depth | max 3 |
| Bulk | max 50 records per request, max 200 component rows per record, body limit 1 MB |
| Upload limits | image 10 MB · pdf 20 MB · video 100 MB |
| Upload request timeout | client `MEDIA_UPLOAD_TIMEOUT_MS` 4 min (upload and replace only; every other admin call 10 s) · Traefik entrypoint `respondingTimeouts.readTimeout` 5 min (every route; bounds slow headers and bodies) · `api-upload` router (upload and replace) with `api-inflight` and `upload-close` (`Connection: close`) · cms-api Node `requestTimeout` 5 min · Traefik stays v3.6 (ADR 0014, user 2026-11-03, Q-UT3 option 2) |
| Reviewer session | 24 h, 1 session per IP per 10 min, global cap 200 active |
| Identifier rule | `^[a-z][a-z0-9_]*$`, max **63 bytes after composition** |
| Core tables | `accounts`, `roles`, `permissions`, `refresh_tokens`, `otp_codes`, `api_tokens`, `reviewer_sessions`, `file_library`, `audit_logs`, `app_settings` (content registry in `content._content_types` + `content._migrations`, owned by the content engine, not Prisma) |
| Refresh cookie | `__Secure-abyss_rt`, host-only on the host serving cms-api to browsers (`admin.domain.com` after Q-BFF1, else `domain.com`), `Path=/api/v1/auth`, `HttpOnly; Secure; SameSite=Strict`; persistent (`Max-Age` 7 days) only for a remembered session, else a session cookie (§16). Never reaches the web browser: the BFF holds the web visitor's refresh token inside `__Host-abyss_web_session` (D21) |
| Origins | web: `https://domain.com` (pages + BFF `/bff/v1`, no cms-api route; D21) · admin + API: `https://admin.domain.com` (cms-api under `/api`, same-origin for cms-admin; pending Q-BFF1; before it: API on `https://domain.com/api`, admin the only CORS origin, credentials on) · cms-api in-cluster: `API_INTERNAL_URL` (Service URL, used only by the web server) |

---

## 7. Security Decisions (fixes for review findings C1–C8 and related)

**D1 Owner bootstrap (C1).** No "first verified user becomes owner". The owner is created exactly once, by two paths sharing `bootstrapOwner`: one transaction with `pg_advisory_xact_lock`; refuses if an owner exists or the email is taken; never promotes an existing account. A partial unique index `ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL` enforces one owner. No self-registration endpoints in v1. Amended 2026-10-22 (user decision, ADR 0005, design `docs/modules/owner-setup.md`):

- **Setup route (primary on k3s):** `POST /setup/owner` `{ setupToken, email, displayName?, password }`, open only while `OWNER_SETUP_TOKEN` is configured **and** no live owner exists, else `404`. Token checked first (SHA-256 digests, `timingSafeEqual`), before body validation or password hashing; wrong → `401 SETUP_TOKEN_INVALID`. Success → `201 { email }`, no session (sign in via `/auth/login`). Throttled per IP. The admin console shows the setup page only while `GET /setup/status` says `open`, and never takes the token from the URL.
- **CLI (fallback):** `owner:bootstrap`: `OWNER_EMAIL` + interactive password (or `--password-stdin`); works with or without a setup token.
- **Closing:** the route closes once an owner exists; the operator then removes `OWNER_SETUP_TOKEN` from the Secret. While the token is set and an owner exists, cms-api logs a warning (no value).
- **Smoke seed CLI (test stacks only; amended 2026-10-23, user decision, audit AUD-AU5-03):** `seed:account`, an identity CLI (not an HTTP route), creates active smoke / e2e test accounts. Role allowlist `admin`, `guest`; `owner`, `reviewer` and custom roles always refused. Refuses a taken email; never updates or promotes an account. Password from stdin only. Under `NODE_ENV=production` it refuses unless `ALLOW_ACCOUNT_SEED=smoke` is passed on that one invocation (never in deployed config, D17). Each created account writes `account.seeded` (D15).

**D2 Reviewer isolation (C2, C3).** Reviewers are **read-only**: published content only, through the `reviewer` role's field profile, which the Owner edits like any role and which starts with every sensitive field masked. Mechanism (amended 2026-10-27, user, ADR 0011 Q-RV7; `guest` added 2026-10-27, user decision): a field with `sensitive: true` in its definition is not covered by a wildcard `*` content grant of `public`, `guest` or `reviewer`, so it stays masked for anonymous visitors, signed-in guests and reviewers until the Owner adds a type-specific row granting it. Never drafts. No reviewer data in content tables (no `reviewerSessionId` column). Reviewer write sandboxes are v2 and must use a separate PG schema.

**D2a Reviewer feature switch (added 2026-10-28, user request, ADR 0014).** All reviewer features are off until the user turns them back on. cms-api reads `REVIEWER_FEATURE_ENABLED` at start (runtime env, default `false`, only `true` enables). While off: `GET /reviewer/status`, `POST /reviewer/sessions`, `GET /reviewer/sessions`, `PUT /reviewer/settings` answer `404 REVIEWER_FEATURE_OFF` before any Turnstile call or DB read; `AccessSessionService` answers 401 for any reviewer-role account (no reviewer token works on REST, GraphQL or cms-admin); the reviewer cleanup job does not start. The web `/status` page answers 404 unless `WEB_STATUS_PAGE_ENABLED=true` (runtime env, default `false`). Reviewer access is open only when the switch is on, the owner toggle `reviewer.enabled` is on, and Turnstile plus `OTP_PEPPER` are configured; the toggle keeps its value while the switch is off. Off: owner turns the toggle off first (revokes live sessions), then keys set to `false` and pods restart; on is the reverse (`docs/deployment/devops-runbook.md`). Dev, demo and smoke stacks set both keys to `true` (Q-RVOFF1). *Amended 2026-10-31 (user Q7, ADR 0017, D21):* reviewer mode is removed from apps/web (no "Reviewer access" entry, no reviewer session in the web session); `/status` and `WEB_STATUS_PAGE_ENABLED` are removed (health card moves to the homepage, pending Q-BFF2); the switch now covers cms-api and cms-admin only, the scope feature reviewer-toggle (paused) keeps.

**D3 Field-level reads (C4).** Applied **when the query is built**: no `read` on a subject → `403` (not a masked row) · unreadable columns are never selected; the serializer emits the sentinel and `_maskedFields` · filter, sort or search on an unreadable field → `400 FIELD_NOT_READABLE` · every payload carrying record data uses the same serializer (list, detail, 409 conflict, bulk conflicts, audit metadata view, error details).

**D4 Write allowlist (C5).** Writable fields come from policy, per request. A masked field sent back with the sentinel is dropped silently; any other non-writable or unknown key → `400`. Client-sent `_maskedFields` is ignored.

**D5 API tokens (C6).** Effective permissions = token scope ∩ creator's **current** permissions, per request. A deactivated or deleted creator stops the token. Create, update and revoke only from a JWT session (never with a token); the subset check runs on create **and** update. Admins manage only tokens they created; the Owner manages all. Format `ak_live_` + 32 random bytes base64url, stored as SHA-256, raw value shown once. Expired once `expires_at <= now` (same rule at request authentication and in the list status). Expired = revoked: no update (`PATCH /api-tokens/:id` → `409`, so an expiry can never be moved forward to revive it); only a new token restores access (user decision 2026-10-25, CA1b security).

**D6 Role hierarchy (C7).** Manage an account, assign a role or edit a role's permissions only when target rank < actor rank. No "created by me" exception. System roles' slug and rank are immutable. Only one account can hold `owner`.

**D7 Client IP (C8).** `TRUST_PROXY_HOPS` (default `1`), not `true`. Deploy docs require `externalTrafficPolicy: Local` on the Traefik service, and `CF-Connecting-IP` when Cloudflare is in front (`CLIENT_IP_HEADER`). Rate limits keyed by real IP **and** account/email. *Amended 2026-10-31 (D21):* the web BFF derives the visitor IP by the same keys and rules (`CLIENT_IP_HEADER`, else `TRUST_PROXY_HOPS` from the right of `X-Forwarded-For`) and sends cms-api exactly one `X-Forwarded-For: <ip>` (plus `<CLIENT_IP_HEADER>: <ip>` when set), so cms-api limits stay per visitor, never per web pod.

**D8 Credentials and OTP.** Passwords: Argon2id, min 12 characters. OTPs stored as HMAC-SHA256 with `OTP_PEPPER`, bound to `(account, purpose)`; purposes `INVITE_SET_PASSWORD`, `RESET_PASSWORD`, `LOGIN_2FA_EMAIL`. Unknown-email responses look like known ones (no enumeration). Password reset also needs a TOTP code when TOTP is on. Turning on 2FA needs the current password plus a valid first code. TOTP remembers the last used time step (no replay); its secret is encrypted with AES-256-GCM using `TOTP_ENC_KEY` and a key id for rotation.

**D9 Sessions and revocation.** JWT HS256, algorithm pinned; claims `sub`, `tv` (`accounts.token_version`), `pv` (`roles.policy_version`), `kid`. The guard compares claims with DB values through an in-process cache invalidated on every write in that process: immediate at one replica, bounded by a 5 s cache TTL at more. Refresh tokens rotate with `family_id`; reusing a rotated token revokes the family and bumps `token_version`. A password change or reset bumps `token_version`.

**D10 Content engine.** One engine for all content types: JSON schema → validated definition → generated SQL migration in PG schema `content`, applied by a migration command/Job, never at request time. Prisma owns only `public`, so Prisma migrate never sees content tables or proposes a drift reset. Adding a schema = generate → review the migration → deploy; nothing happens "automatically on file drop". Destructive changes (drop or rename a field) need an explicit `--allow-destructive` flag and a written data-migration note.

**D11 Draft/publish integrity.** Partial unique indexes allow at most one draft and one published row per `document_id`. Publish takes the draft's `expectedVersion`. Components carry a stable `component_uid` (UUID) for diff/merge matching.

**D12 Media.** Type detected from magic bytes against an allowlist (`jpeg png webp gif avif pdf mp4`); SVG and HTML always rejected. Images re-encoded with sharp (strips EXIF/GPS). Storage keys UUIDv7; full SHA-256 stored for dedupe. Soft delete, blocked (`409 MEDIA_IN_USE`) while any document references the file; a job purges cloud objects afterwards. The stored `fileName` is `<stem>_<hash8>.<ext>` (§15 MU-3); existing rows are renamed by one SQL migration; storage keys stay UUIDv7.

**D13 Richtext/XSS.** Sanitized on the server when written (allowlist via `sanitize-html`) and again by the web when rendering (DOMPurify). No global "XSS pipe" rewriting all input.

**D14 Topology and CSRF.** The API accepts the refresh cookie only on `/api/v1/auth/refresh` and `/logout`, which also require `Origin` ∈ the allowlist. The access token lives in memory and travels as a Bearer header. Admin has its own subdomain so XSS in public content can't run in the admin origin. *Amended 2026-10-31 (D21, ADR 0017):* this browser-token model now covers cms-admin only. On web the browser holds no token: the BFF keeps the cms-api access and refresh tokens in the sealed `__Host-abyss_web_session` cookie, calls cms-api server-to-server and sends `Origin: <WEB_ORIGIN>` on refresh and logout (cms-api's `cookieOrigins` keep `WEB_ORIGIN` for that). The BFF's CSRF defense: `SameSite=Strict`, an exact `Origin` check, JSON-only bodies (D21).

**D15 Audit.** `SecurityAuditService` is always on and writes in the same transaction for: login success and failure, 2FA changes, password changes, role, permission and account changes, token create and revoke, reviewer toggle, media delete, owner creation (`owner.created`, channel `setup_page` or `cli`), rejected owner-setup attempts (`owner.setup_rejected`, no token, password or email stored), smoke-seed accounts (`account.seeded`, channel `cli_seed`, metadata = role slug and channel only; D1). Activity tracking (content edits) stays pluggable (`none | database`). Audit metadata stores field names only, never values.

**D16 Presence.** Needs `update` on the document. Returns only `{ accountId, displayName, state, lastSeenAt }`. In-memory store (single replica, documented).

**D17 Production guards (config fail-fast).**

- With `NODE_ENV=production`, Zod rejects `MAIL_PROVIDER=console`, any missing secret, and secrets under 32 bytes. The boot config summary redacts secrets.
- `OWNER_SETUP_TOKEN` is optional; set with `NODE_ENV=production`, it must be ≥ 32 bytes (D1).
- `ALLOW_ACCOUNT_SEED` is not an app setting: the server schema does not accept it, and it never appears in `.env.example`, the smoke env file, compose or k3s manifests. Only `seed:account` reads it, passed on one invocation, and it must equal exactly `smoke` (D1).
- Headers on every app: HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, no `X-Powered-By`.
  - **API**: `default-src 'none'` on every route, `/graphql` included.
  - **cms-admin**: CSP from its nginx config (unchanged): `script-src 'self'`, `connect-src` from env, `img-src` includes Cloudinary. No `'unsafe-eval'`: the bundle must not call `eval` or `new Function`, so Zod runs `jitless` (its eval probe is reported as a CSP violation even when caught; ADR 0015, 2026-10-28).
  - **web (Next.js)**: CSP from `src/proxy.ts` with a fresh per-request nonce: `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ the Turnstile origin, named constant), `connect-src` from env, `img-src` includes Cloudinary, `frame-ancestors 'none'`, `style-src` per Q-W4 (open: recommended `'self' 'nonce-<n>'` + `style-src-attr 'unsafe-inline'`). HSTS, nosniff, Referrer-Policy and `poweredByHeader: false` from `next.config.ts`. Nonce pages render per request; the data cache still bounds cms-api calls. `/_next/static` is outside the proxy matcher. Approved by the user 2026-10-21 (Q-W4). *Amended 2026-10-31 (D21):* `connect-src 'self'` only (plus `ws:` in dev; no API origin, `NEXT_PUBLIC_API_BASE_URL` retired); the matcher also skips `bff/`; added `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `X-Frame-Options: DENY`; BFF responses carry `Cache-Control: no-store`.

**D18 GraphQL read API.** Details and schema contract: `docs/modules/graphql.md`, ADR 0003. In v1 by user decision; Q-G1..Q-G7 answered by the user 2026-10-21 as recommended (§14).

- `POST /api/v1/graphql`, queries and document reads only (no mutations, subscriptions, batching, GET or persisted queries). cms-admin stays on REST.
- Schema generated by a pure function from the content definitions: object type per content type and component, offset paging `page`/`pageSize` + `meta { page, pageSize, total }`, typed filter inputs with the REST operator sets and limits, sort ≤ 3 keys. Fails on any name clash; the printed SDL is committed (`content/schema.graphql`) and checked.
- **Authz is the REST read path, not a copy:** `DocumentAuthGuard` (anonymous, JWT, API token per D5), then root resolvers call `DocumentsQueryService` unchanged (read + draft rule, row conditions, projection, `QueryGuard` → `FIELD_NOT_READABLE`, `RecordSerializer`, media embed). Nested fields only read the serialized record; no other data path (architecture test). An unreadable content type fails validation exactly like an unknown field (hidden = unknown).
- **Limits** (named constants): body 32 KiB, 2 000 parser tokens, depth 8, 5 root fields per operation (aliases count), 500 field nodes; the anonymous document read throttle counts each request once. No weighted cost (DB work per root field is fixed).
- **Production:** introspection off, "Did you mean" suggestions stripped; no playground in any environment. Responses `Cache-Control: no-store`.
- **Errors:** `{ data?, errors: [{ message, path?, locations?, extensions: { code, details?, requestId } }] }`; `code` reuses REST codes plus `GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `GRAPHQL_LIMIT_EXCEEDED`; HTTP 400 for parse/validation/limit errors, 200 once executed; failures before GraphQL (401, 413, 415, 429) keep the REST error shape. Never echo submitted values or log variables.

**D19 Database roles (added 2026-10-27, user decision; ADR 0012).** Production uses separate PostgreSQL roles:

- `abyss_migrator` owns the database and runs DDL, only in the init container (`deploy:migrate` = `db:migrate` + `content:migrate`) and the restore drill. `abyss_api` (cms-api runtime): `SELECT, INSERT, UPDATE, DELETE` on app tables of `public` and `content` (plus `USAGE` on schemas and sequences), only `SELECT` on `_prisma_migrations`, `content._migrations`, `content._content_types`; no DDL, no `TRUNCATE`, no temporary tables. `abyss_backup` only reads (`pg_read_all_data`). The superuser stays in the Postgres pod.
- One idempotent, self-checking script, `scripts/db/database-roles.sql`, sets roles and grants; default privileges cover later objects. Each workload gets only its own credential Secret; migration commands load only `DB_*` keys (`loadDatabaseConfig`), so the init container holds no app secret. The tier 3 smoke stack uses the same split.
- In production cms-api logs one boot warning (names only, no values) when its role is superuser, can `CREATE` in the database or the `public` / `content` schemas, or owns objects there, and still starts. Until the split is applied on an environment, its shared DDL-capable DB account is a user-accepted risk (ADR 0012 §8). Every environment starts from a fresh database (user answers Q-DB1, Q-DB2 "warn only", 2026-10-27).
- Production on a Supabase free project (amended 2026-10-27, user decision, ADR 0012 §9): `postgres` = migrator and operator, `abyss_api` = API role, `abyss_backup` reads with explicit `SELECT`. Every Supabase connection (API, init container, backup, roles script) goes through the session pooler on 5432 (user names `<role>.<project-ref>`), never the transaction pooler on 6543 or a direct connection. Roles script in `hosting=supabase` mode (no ownership change, no `PUBLIC` revoke, all grants removed from the Data API roles); Data API off. TLS via `DB_SSL_MODE` / `DB_SSL_ROOT_CERT_PATH` (default `disable` for local stacks; Supabase production: `verify-full` with the project CA, "Enforce SSL" on). The free-plan pause is accepted for launch. Postgres 17 is the target major for production, tests, smoke, dev and backup images (user answers Q-DB3..Q-DB7, 2026-10-27).

**D20 Backup download (added 2026-10-27, user request; ADR 0013, tasks BK-*; user answers Q-BK1 to Q-BK7 on 2026-10-27).** Dumps never sit on the VPS or in Supabase.

- Nightly job (deploy repo; documented in `docs/deployment/k3s-traefik.md` §7): streams `pg_dump -Fc` as `abyss_backup`, encrypts with `age` (Q-BK6: only the public recipient on the VPS; the owner keeps the private key offline in two copies), uploads to a Cloudflare R2 bucket (Q-BK5) under `daily/` and `monthly/`. Retention by bucket lifecycle rules (14 days daily, 92 days monthly). Size check before the dump and after the upload; over the limit → keep the dump and fail loudly.
- Two separate keys (Q-BK2): the job's write-only key cannot delete; cms-api holds only its own read-only R2 token, list and get (`BACKUP_STORAGE_*`, all set or none; none = feature off), and no backup database credential. cms-api never dumps on demand or streams the bytes itself.
- `GET /backups` lists dumps; `POST /backups/download-links` returns a presigned GET URL valid 60 s on the R2 S3 API host (R2 presigned URLs fail on a custom domain). Both owner only as a hard rule (`requireOwnerActor`) no role grant can open; `no-store`; throttled per actor (links also per IP). A link needs the current password plus a code of the active 2FA method (`ReauthenticationService`, identity); 2FA off → refused. Failures write `auth.reauth_failed`; each link writes `backup.download_link_created`. The URL is never logged or audited. The admin page warns when no daily dump is newer than 26 hours.

**D21 Web BFF and web hardening (added 2026-10-31, user request Q7; ADR 0017 holds design, module map, file map; feature `web-bff-hardening`).** Pending Q-BFF1..Q-BFF5 (ADR 0017 "Questions"); follows the recommended answers.

- **Topology.** The BFF is part of apps/web: Next.js Route Handlers under `/bff/v1`, same Node server and origin. The browser calls only the web origin; no browser code knows a cms-api URL (`NEXT_PUBLIC_API_BASE_URL`, `DEV_API_PROXY_TARGET` retired). The BFF reaches cms-api only on `API_INTERNAL_URL` (cluster-local Service URL), never following redirects. Q-BFF1 (recommended yes): Traefik serves no cms-api route on `domain.com`; cms-api's public route moves to `admin.domain.com/api` for cms-admin (same-origin, no cms-api code change); a NetworkPolicy lets only Traefik and web pods reach cms-api.
- **Endpoints** (§9 "Web BFF"): `GET /health`, `GET /session`, `POST /auth/login`, `POST /auth/two-factor/email-code`, `POST /auth/two-factor/verify`, `POST /auth/logout`, `GET /cv`; each one fixed cms-api call; no generic proxy, no GraphQL passthrough.
- **Session.** No token in the browser. `__Host-abyss_web_session` holds the sealed `{ refreshToken, accessToken, accessExpiresAt, rememberMe }`; `__Host-abyss_web_2fa` the sealed 2FA challenge for 300 s, which also carries `rememberMe` from `POST /bff/v1/auth/login` (`rememberMe?`) to verify. Both `HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`. `__Host-abyss_web_session` is a browser-session cookie (no `Max-Age`, no `Expires`) unless remembered, then `Max-Age` 7 days, set again on each refresh (amended 2026-11-03, Q-RM7, §16 RM-6). Sealed with AES-256-GCM, key derived from `WEB_SESSION_SECRET` (required, ≥ 32 bytes in production, else start fails), cookie name as additional data; a cookie that does not open counts as absent and is cleared. Refresh when the access token has < 30 s left; concurrent refreshes of one token share one in-process call and its result for 10 s (D9 family revocation never fires on a race; single replica, like D16). Accounts with any permission other than `read` are signed out at cms-api and refused (`403 BFF_PRIVILEGED_ACCOUNT`) after login, after 2FA and on every session read. Sign-out calls cms-api logout and always clears both cookies.
- **Pipeline on every BFF route, in order:** allowed method only · state-changing routes need `Origin` exactly `WEB_ORIGIN` and `Sec-Fetch-Site` (when sent) `same-origin` · POST bodies `application/json` only, never CORS headers · body ≤ 8 KiB · per-IP fixed-window rate limit (`auth` 20 / 60 s, `read` 120 / 60 s, at most 10 000 keys) · Zod schema per body, unknown keys refused, lengths capped · Turnstile check where needed · upstream call with `API_TIMEOUT_MS`, forwarded client IP (D7), only the headers that call needs · answer with allowlisted fields, errors `{ statusCode, errorCode, message }` from the ADR 0017 §3 list, `Cache-Control: no-store` · log route and error code of refused requests, never bodies, tokens, codes, cookies, emails or passwords.
- **Human check.** Cloudflare Turnstile on the login form (`login`) and in the 2FA popup (`two-factor`: sending the email code and verifying, a fresh token each, Q-BFF3). The BFF verifies server-side (`siteverify` with `TURNSTILE_SECRET_KEY` in the web server env, `remoteip`, expected `action`, `hostname` = `TURNSTILE_EXPECTED_HOSTNAME` when set) before any cms-api call; failure `400 BFF_HUMAN_CHECK_FAILED`, siteverify unreachable `503 BFF_HUMAN_CHECK_UNAVAILABLE` (fail closed). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` required at build. Dev, demo and smoke use Cloudflare's published always-pass test keys. The widget script loads only while the login dialog is open.
- **Reviewer mode on web is removed**, not paused (ADR 0017 §5); Turnstile widget and hook move to `features/auth`. cms-api's reviewer module, cms-admin's Reviewer page and `REVIEWER_FEATURE_ENABLED` are unchanged (D2a).
- **Homepage.** `/` shows the CV and a "Service status" card like cms-admin's home, polling `GET /bff/v1/health` and showing only that path; it renders even when the CV fails to load. Always on; `/status` and `WEB_STATUS_PAGE_ENABLED` removed (Q-BFF2).
- **Web env** (server, runtime): adds `WEB_ORIGIN`, `WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME` (optional), `TRUST_PROXY_HOPS` (default 1), `CLIENT_IP_HEADER` (optional); removes `WEB_STATUS_PAGE_ENABLED`, `NEXT_PUBLIC_API_BASE_URL`, `DEV_API_PROXY_TARGET`. Invalid values fail start (instrumentation), as today.
- **Note (2026-11-03, Q-RM7):** ADR 0017 is to be rewritten when web-bff-hardening is re-planned (the file is missing from `docs/adr/`); the rewrite includes §16 RM-6.

**D22 Remember me (added 2026-11-03, user request, approved 2026-11-03; §16, feature `remember-me`).** "Keep me signed in" is a choice per sign-in, stored on the refresh token family (`refresh_tokens.remember_me`) and copied on every rotation; on two-factor sign-ins it travels in the signed 2FA temp token (claim `rm`). Remembered: persistent cookie (`Max-Age` 7 days) and 7-day sliding server lifetime; not remembered (default): session cookie and 12-hour sliding server lifetime. cms-api alone enforces the lifetime (`expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes. Cookie names, flags and paths, rotation and reuse detection (D9) and every other session rule are unchanged.

---

## 8. Data Model

### 8.1 Core (`public`, Prisma)

Every table has `id` (int identity PK), `created_at`, `updated_at`. User-facing tables also have `document_id` (UUIDv7, unique). `created_by`/`updated_by` reference `accounts(id)` **ON DELETE SET NULL**.

| Table | Key columns |
|---|---|
| `accounts` | email UK (citext), password_hash, display_name, role_id FK, role_slug (composite FK (role_id, role_slug) → roles(id, slug), ADR 0002), status (`invited\|active\|disabled`), token_version int, is_2fa_enabled, two_fa_method (`totp\|email`), totp_secret_enc, totp_last_step, deleted_at |
| `roles` | slug UK, name, rank, is_system, policy_version int |
| `permissions` | role_id FK, subject (content type slug or system subject), action, readable_fields jsonb (null = all), writable_fields jsonb (null = all), conditions jsonb (DSL §8.3) |
| `refresh_tokens` | account_id FK, family_id uuid, token_hash UK, replaced_by_id, user_agent, ip, expires_at, revoked_at, remember_me (boolean, NOT NULL, default `true` for rows before §16) |
| `otp_codes` | account_id FK, purpose, code_hmac, attempts, expires_at, used_at |
| `api_tokens` | name, token_prefix, token_hash UK, created_by_id FK (not null, ON DELETE CASCADE), scope jsonb, expires_at, revoked_at, last_used_at |
| `reviewer_sessions` | account_id FK (ephemeral `reviewer` account), visitor_role, purpose_tags jsonb, notes (≤ 500 chars, plain text), ip_hmac, user_agent, expires_at, last_active_at |
| `file_library` | file_name, mime_type, size, width, height, alt, storage_key UK, sha256, url, thumbnail_url, provider (`cloudinary\|preset`), is_reviewer_preset, deleted_at |
| `content._content_types` (content engine, not Prisma) | slug UK, kind (`single\|collection`), draft_and_publish bool, definition jsonb, definition_hash |
| `audit_logs` | bigint PK, actor_id (SET NULL), actor_type (`account\|api_token\|system`), action, subject, target_id, metadata jsonb (no field values), ip, created_at |
| `app_settings` | key UK, value jsonb (e.g. `reviewer.enabled`) |

### 8.2 Content (`content` schema, generated)

- **Root table** `<slug>`: system columns + `document_id`, `version int`, `published_at timestamptz null`, `locale` (reserved, nullable).
  - `UNIQUE (document_id) WHERE published_at IS NULL`
  - `UNIQUE (document_id) WHERE published_at IS NOT NULL`
  - `INDEX (published_at, created_at DESC)`
- **Component table** `<slug>__<path>`, e.g. `cv_page__experience__role`:
  - columns: `id`, `component_uid uuid`, `parent_id int NOT NULL REFERENCES <parent>(id) ON DELETE CASCADE`, `order_index int`, then the fields
  - `INDEX (parent_id, order_index)`
  - **No `_lnk` tables**: components are owned exclusively, so cascade delete removes orphans by construction.
- The generator **fails** (never truncates) when a composed name exceeds 63 bytes or two names collide after normalisation.
- `cv-page.json` produces **8 tables**: root + skill, experience, experience__role, project, education, language, reference.

### 8.3 Conditions DSL (ABAC)

JSON, whitelisted and compiled to parameterized SQL only:
`{ "all": [ { "field": "createdBy", "op": "eq", "value": "$actor.id" }, { "field": "<readable field>", "op": "in", "value": [..] } ] }`.
Operators: `eq`, `ne`, `in`. The only variables are `$actor.id` and `$actor.roleRank`. Anything else is rejected when the permission is saved.

---

## 9. API Contract (v1 outline)

All routes sit under `/api/v1`. One error shape: `{ statusCode, errorCode, message, details?, requestId }`.

| Area | Endpoints |
|---|---|
| Health | `GET /health/live`, `GET /health/ready` |
| Auth | `POST /auth/login` (`{ email, password, rememberMe? }`, §16) → `{ accessToken }` or `{ requires2FA, tempToken, methods }` · `POST /auth/2fa/verify` · `POST /auth/2fa/email-challenge` · `POST /auth/refresh` (cookie) · `POST /auth/logout` (cookie) · `GET /auth/me` |
| 2FA setup | `POST /auth/2fa/totp/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable` (password + code) |
| Password | `POST /auth/password/request-otp` (always 202) · `POST /auth/password/reset` · `POST /auth/password/set` (invite) · `POST /auth/password/change` |
| Accounts | `GET /accounts?page=&pageSize=` (`{ data, meta { page, pageSize, total } }`) · `POST /accounts` (invite) · `PATCH /accounts/:id` · `POST /accounts/:id/disable` · `POST /accounts/:id/enable` · `POST /accounts/:id/invite/resend` · `POST /accounts/:id/sessions/revoke` |
| Roles | `GET/POST /roles` · `PATCH/DELETE /roles/:id` · `PUT /roles/:id/permissions` |
| API tokens | `GET/POST /api-tokens` · `PATCH /api-tokens/:id` · `POST /api-tokens/:id/revoke` |
| Content types | `GET /content-types` (filtered to subjects the actor can read) · `GET /content-types/:slug` |
| Documents | `GET /documents/:slug` (`status=draft\|published`, filter/sort/page) · `GET /documents/:slug/:documentId` · `POST /documents/:slug` · `PUT /documents/:slug/:documentId` (`version`) → `409 DOCUMENT_VERSION_CONFLICT { currentVersion, server, submitted, diff }` (masked) · `POST …/:documentId/publish` (`expectedVersion`) · `POST …/:documentId/unpublish` · `DELETE …/:documentId` |
| Bulk (collection only) | `POST /documents/:slug/bulk/create` · `/bulk/publish` · `/bulk/unpublish` · `/bulk/delete`, each `{ atomic, items }` → per-item results |
| Presence | `POST /documents/:slug/:documentId/presence` → active editors |
| Media | `POST /media` (multipart) · `GET /media` · `PATCH /media/:id` (alt) · `DELETE /media/:id` |
| Reviewer | `GET /reviewer/status` · `POST /reviewer/sessions` (Turnstile) · `GET /reviewer/sessions` (owner) · `PUT /reviewer/settings` (owner) · all four answer `404 REVIEWER_FEATURE_OFF` while `REVIEWER_FEATURE_ENABLED` is not `true` (D2a) |
| Audit | `GET /audit-logs` (owner) |
| Backups (D20) | `GET /backups` (owner) → `{ data: [{ key, kind, fileName, createdAt, sizeBytes }], meta: { count, totalBytes, latestAt, isStale } }` · `POST /backups/download-links` (owner, `{ key, password, code }`) → `201 { url, fileName, expiresAt }`; `404 BACKUPS_NOT_CONFIGURED` while the storage keys are unset |
| Owner setup (D1) | `GET /setup/status` → `{ open }` · `POST /setup/owner` (setup token in body) → `201 { email }`; `404` once an owner exists or when no token is configured |
| GraphQL (D18) | `POST /graphql` (queries only): per content type `<type>(documentId, status)` and, for collections, `<type>List(status, page, pageSize, sort, filter)` → `{ data, meta }`; same auth, masking and error codes as the document reads |

`:slug` is always checked against the `content_types` registry before any SQL is built; never interpolated directly.

**Web BFF (D21, ADR 0017 §3).** Served by apps/web on the web origin under `/bff/v1`; the only API the public site's browser calls. JSON only, `Cache-Control: no-store`, errors `{ statusCode, errorCode, message }`.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /bff/v1/health` | - | `200 { status: "ok" }` · `503 { status: "unavailable" }` |
| `GET /bff/v1/session` | - | `200 { user: { id, email, displayName, role } \| null }` |
| `POST /bff/v1/auth/login` | `{ email, password, humanCheckToken, rememberMe? }` (§16 RM-6) | `200 { status: "signed-in", user }` · `200 { status: "two-factor-required", methods }` |
| `POST /bff/v1/auth/two-factor/email-code` | `{ humanCheckToken }` | `202` |
| `POST /bff/v1/auth/two-factor/verify` | `{ code, humanCheckToken }` | `200 { user }` |
| `POST /bff/v1/auth/logout` | - | `204` |
| `GET /bff/v1/cv` | - | `200 <CV page data>` for the signed-in visitor (`401 BFF_SESSION_REQUIRED` without a session) |

---

## 10. Code Style

```ts
// apps/cms-api/src/modules/documents/documents.controller.ts
@Controller(API_ROUTES.DOCUMENTS.ROOT)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Put(API_ROUTES.DOCUMENTS.BY_ID)
  @RequirePermission(PERMISSION_ACTIONS.UPDATE)
  async update(
    @Param() { slug, documentId }: DocumentParamsDto,
    @Body() body: UpdateDocumentDto,
    @Actor() actor: ActorContext,
  ): Promise<SerializedDocument> {
    return this.documents.update({ slug, documentId, ...body }, actor);
  }
}
```

- No literals for routes, limits, headers, cookie names or URLs: they live in the owning module's `*.constants.ts`, in `common/constants/*.constants.ts` when shared, or in config (§5 constants placement; project `code-standards` skill).
- Services take an explicit `ActorContext`. Policy checks live in `access`, never inline `role === 'x'`.
- DTOs validated with Zod (`nestjs-zod`), one schema per DTO; shared schema types are exported for the frontends.
- Prettier, ESLint and Oxlint from `@abyss/base-config` (`/prettier`, `/eslint`, `/oxlint`): the base holds the shared rules; each project extends it locally with its own plugins and rules (React, Next, Nest, Playwright). Built with `tsc` to `dist/` (ESM + `.d.ts`), exports point at `dist/`; turbo builds it before any consumer task (D3).

---

## 11. Testing Strategy

| Level | Tool | Where | Required for |
|---|---|---|---|
| Unit | Jest (API), Vitest (UI) | next to source, `*.spec.ts(x)` | pure logic: policy evaluator, DSL compiler, generator, serializers, parsers |
| Integration | Jest + Supertest + Testcontainers PG16 | `apps/cms-api/test/integration` | every endpoint: happy path, 401, 403, validation, plus the §12 security cases |
| Component | Vitest + Testing Library | `packages/form-commons` | every exported component: props, a11y attributes, RHF integration |
| E2E | Playwright | `apps/e2e` | critical flows in §12 (login+2FA, edit+conflict, publish, reviewer, masking) |

Coverage target: ≥ 80 % lines on `access`, `identity`, `documents` and `content-engine`. Every task in `tasks/todo.md` lands with its own tests; no "test phase" at the end.

---

## 12. Success Criteria (each one is an automated test)

1. The owner can be created once: by `owner:bootstrap` or by `POST /setup/owner` with the valid setup token. A second attempt by either path fails; concurrent attempts (route + CLI) give exactly one owner. The setup route answers 401 for a wrong token, 404 when no token is configured or an owner exists. No other HTTP route can create an owner.
2. No self-registration route (`POST /auth/register` → 404).
3. A reviewer session reads published content only; masked fields stay `***`; `status=draft` → 403; any write → 403.
4. A role without read on a field gets `***`/`null` plus `_maskedFields`. Filter or sort on that field → 400. A 409 conflict body for that role has no raw value of that field.
5. A PUT resending `"***"` for a masked field leaves the DB value unchanged. A PUT with a non-writable, non-masked field → 400.
6. After a token's creator loses `delete` permission, the token gets 403 on delete. Disabled creator → token gets 401.
7. An admin cannot change their own role's permissions, cannot assign `admin`/`owner`, and cannot manage another admin or that admin's tokens.
8. A spoofed `X-Forwarded-For` doesn't change the rate-limit key (with the documented hop count).
9. The 6th wrong OTP for a code fails even when correct. A 6th OTP issue within the hour → 429. Responses for unknown emails can't be told apart from known ones.
10. Reusing a rotated refresh token revokes the family. After a password reset, old access tokens → 401 on the next request.
11. A role/permission change takes effect on the next request (single replica).
12. Two concurrent publishes never produce two published rows (partial unique index). Publish with a stale `expectedVersion` → 409.
13. A file whose bytes don't match an allowlisted type → 415. SVG → 415. Stored images have no EXIF. Deleting a referenced file → 409.
14. Richtext `<img onerror>` / `<script>` is stripped when stored and not executed on web.
15. With `NODE_ENV=production`, startup fails when `MAIL_PROVIDER=console` or a secret is missing.
16. `cv-page.json` generates exactly the 8 tables in §8.2. A schema whose composed name exceeds 63 bytes fails generation with a clear error.
17. `POST /api/v1/auth/login/` (trailing slash) through the Traefik-like proxy test returns 200/401, never 3xx.
18. Every security event in D15 writes an `audit_logs` row, even when activity tracking is `none`.
19. GraphQL returns the same masked values and `_maskedFields` as REST for each role; filter/sort on an unreadable field → `FIELD_NOT_READABLE`; a hidden content type gives the same error as an unknown one; `status: DRAFT` as anonymous/reviewer → `FORBIDDEN`; introspection refused with `NODE_ENV=production`; each D18 limit rejects an over-limit query before any SQL runs.
20. With `REVIEWER_FEATURE_ENABLED` unset or `false`: each reviewer route → `404 REVIEWER_FEATURE_OFF`; a reviewer token issued while it was on → 401; the cleanup job is not started (D2a). *(Amended 2026-10-31: the web `/status` clause is retired with `WEB_STATUS_PAGE_ENABLED`, D21.)*
21. The public site's browser sends no request to a cms-api path: on the web origin every XHR/fetch goes to `/bff/v1/*` (e2e network log); the web bundle and HTML contain no cms-api URL; with Q-BFF1, `GET https://domain.com/api/v1/health/live` through the proxy is answered by web (404), not cms-api.
22. Web sign-in: the browser receives no access or refresh token (response bodies, `document.cookie`, storage); the only auth cookies are `__Host-abyss_web_session` / `__Host-abyss_web_2fa` with `HttpOnly; Secure; SameSite=Strict; Path=/` and no `Domain`; a tampered or swapped cookie counts as signed out; two parallel session reads with a due refresh keep the visitor signed in (no family revocation); a privileged account gets `403 BFF_PRIVILEGED_ACCOUNT` and no cookie; sign-out clears both cookies and the refresh token no longer works at cms-api.
23. Every state-changing BFF route refuses a foreign or missing `Origin` (403), a non-JSON body (415), a body over 8 KiB (413), unknown keys (400) and the 21st `auth` request from one IP within 60 s (429 with `Retry-After`); a spoofed `X-Forwarded-For` changes neither the BFF's rate-limit key nor the IP cms-api sees (with the documented hop count); no BFF response carries an upstream body, header, stack or URL.
24. Login, email code and 2FA verify refuse a missing, failed, reused or wrong-action Turnstile token before any cms-api call (`400 BFF_HUMAN_CHECK_FAILED`), and fail closed when siteverify is unreachable (503).
25. The web serves no reviewer entry and no `/status` route (404); the homepage shows the service status card, which reads `GET /bff/v1/health` and stays visible when the CV cannot load; web responses carry the D17 headers including `Cross-Origin-Opener-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY` and a CSP whose `connect-src` is `'self'` (plus `ws:` in dev only).
26. cms-admin sign-in (§16 acceptance 4, 5): `POST /auth/login` with `rememberMe: true` sets `__Secure-abyss_rt` with `Max-Age=604800`; with `false` or absent it is a session cookie (no `Max-Age`, no `Expires`); refresh and both 2FA paths keep the family's mode; a not-remembered refresh token presented 12 hours plus 1 s after its last rotation → 401 and the cookie is cleared, while a remembered one still rotates.
27. Web sign-in (§16 acceptance 10): unticked, with and without 2FA, `__Host-abyss_web_session` is a session cookie; ticked, it expires about 7 days from now; a BFF refresh keeps each mode; the browser still holds no access or refresh token (criterion 22).

---

## 13. Boundaries

**Launch gate (added 2026-10-27, user decision).** The project goes live for real, so security must hold for any public visitor, not only recruiters. Before any public launch, phase LG (tasks/plan.md) must pass:

1. A whole-project security review by security-qc (opus): static over every app, package, script, CI workflow and deploy guide; dynamic on the full tier 3 stack.
2. A live check of the deployed site: response headers (CSP with nonce, HSTS, nosniff, Referrer-Policy, frame-ancestors, no `X-Powered-By`), TLS and HTTP->HTTPS redirect, auth (no self-registration, login/refresh/logout and the refresh cookie flags, 2FA, rate limits, setup route closed), masking (anonymous and reviewer responses and the server-rendered HTML carry no raw sensitive value), injection (richtext XSS, GraphQL limits and introspection off, filter and path input, CORS).
3. Every launch blocker on the LG list decided by the user.

The live check runs on the production config before the site is public (a staging host with the production config is allowed), with a throwaway admin account (2FA on) the user disables afterwards; write probes run only before the site is public and their test data is deleted; an OWASP ZAP passive baseline scan is allowed after the user is asked again right before it runs; the multer advisory is closed by a pnpm override kept only if unit, integration and tier 3 tests pass (user answers Q-LG1..Q-LG5, 2026-10-27). Exit: no open critical or high finding; each medium finding fixed or accepted by the user in writing. The manager asks the user before any launch.

- **Always:** write tests with each task · run Prettier, lint and typecheck before committing · use constants/config, not literals · route every record payload through the serializer · use parameterized SQL · keep `.env.example` in step with config.
- **Ask first:** adding any dependency not listed in §3 · DB schema changes outside the current task · changing a canonical value in §6 · changing a decision in §7 · CI/deploy changes · deleting files.
- **Never:** make the site public (public DNS record, public ingress or announced URL) before the launch gate (phase LG, above) has passed and the user has approved the launch in writing · read or edit `.env*` (except `.env.example`) · commit secrets · interpolate identifiers or slugs into SQL · build v2 backlog items · trust client-supplied permissions/`_maskedFields` · log OTPs, tokens or passwords in production · add AI attribution to commits.

---

## 14. Decided questions (all answered; kept as the decision record)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Use Kysely for content queries (new dependency) instead of Prisma for content tables? | Yes: Prisma can't model runtime-defined tables safely; Kysely keeps parameterized, typed-ish SQL |
| Q2 | Confirm self-registration is removed in v1 (invite-only)? | Yes |
| Q3 | Allow email-OTP 2FA, or TOTP only? Email-as-2FA means email compromise = account takeover. | Allow it, show a warning, recommend TOTP |
| Q4 | Real domain names, and is Cloudflare in front (affects `CLIENT_IP_HEADER` and Turnstile keys)? | — |
| Q5 | Which fields in `cv-page.json` are sensitive (masked for `public`/`reviewer` by default)? Candidates: `reference.phone`, any salary fields. | — |
| Q6 | Should reviewers see anything beyond published content in v1 (e.g. read-only admin UI tour)? | Read-only admin UI with masked data, no drafts |
| Q7 | Re-enabling a disabled account: which status does it get? | `active` if it has a password, else `invited` (an invitee disabled before setting a password can still use the invite flow) |
| Q8 | Which permission may resend an invite? | `accounts:create` (it issues an invitation, like invite); D6 rank rule applies |
| Q9 | Invite throttle values (invite + resend share one counter)? | 10 / hour per actor and 20 / hour per IP, in-memory like the other limits |
| Q10 | List pagination style (convention for documents, media, audit logs)? | Offset: `page` (default 1), `pageSize` (default 20, max 100), response `meta { page, pageSize, total }` |
| Q11 | Paginate `GET /roles` too? The invite role picker, the matrix and the caller-access hint need the full list. | No: full list, custom roles capped at 50 (`409 ROLE_LIMIT_REACHED`) |
| Q12 | Filters or search on the accounts list now? | None in v1 (few accounts); add `status` filter later if needed |
| Q13 | Confirm dialogs for Enable and Resend invite in the admin UI? | None (both reversible, no data loss); keep the confirm on Disable |
| Q-W4 | Web CSP `style-src` (D17) | `'self' 'nonce-<n>'` plus `style-src-attr 'unsafe-inline'` (React/Radix inline style attributes; attributes cannot run script) |
| Q-G1 | GraphQL dependency | `graphql` (graphql-js, current stable, exact pin) in cms-api only, in-house handler; no Apollo/Yoga/`@nestjs/graphql` |
| Q-G2 | GraphQL scope | Document reads only, queries only; admin stays on REST |
| Q-G3 | GraphQL pagination | Offset, same as REST (Q10); cursors later if needed |
| Q-G4 | GraphQL limits | Body 32 KiB, 2 000 tokens, depth 8, 5 root fields, 500 field nodes |
| Q-G5 | Introspection in production | Off for everyone; tooling uses the committed SDL |
| Q-G6 | Web GraphQL client | No client library (fetch on server, Axios in browser); `graphql` as a web devDependency for the SDL contract test |
| Q-G7 | Which cv-page the web shows (it is a collection) | The published one with `isMain = true`, newest `updatedAt` if several; none → empty state |
| Q-OS1 | After a successful setup, sign the owner in at once or send them to the login page? | Login page with the email prefilled and a "turn on two-factor" notice: one path issues sessions (throttles, login audit); costs one extra step |
| Q-OS2 | Should `GET /setup/status` need no token? It tells anyone a fresh instance awaits setup. | Yes, no token: the console must know whether to show the page; the window is short and the submit still needs the token |
| Q-OS3 | Persist a "setup completed" marker so setup never reopens, even if the owner row is deleted in SQL with a token still configured? | No marker (no schema change); rely on the owner row, the boot warning and removing the token after setup |
| Q-OS4 | How does the smoke stack create its owner? | Through the setup route (curl, test token in `scripts/stack/cms-api.env`), then assert `owner:bootstrap` refuses; the CLI's create path stays covered by integration tests |
| Q-MU1 | Is `<origin>_<hash8>.<ext>` only shown, or stored? | Stored: `file_library.file_name` holds it (API `fileName` too); storage keys stay UUIDv7 |
| Q-MU2 | Upload timeouts | Client 10 min (upload and replace only); Traefik readTimeout 15 min; Node requestTimeout 15 min. Amended 2026-11-03 (user, SQ-1, Q-UT3 option 2, ADR 0014): entrypoint readTimeout N = 5 min for every route; client 4 min (below N); Node requestTimeout 5 min; a separate `api-upload` router for the two upload routes with `api-inflight` and `upload-close` (`Connection: close`); cms-admin refreshes an access token that is about to expire (JWT `exp`) before each upload or replace; Traefik stays v3.6. Trade-off accepted: a 100 MB file needs about 3.5 Mbit/s upload to finish within 4 min |
| Q-MU3 | Extension-safe names in the upload dialog rows too? | Yes, same `FileName` component |
| Q-MU4 | Safari check | Manual by the user; no WebKit e2e project |
| Q-MU5 | Batch bar weight of sent bytes | 90 %; processing fills the last 10 % |
| Q-MU6 | Rename existing files to the new rule? | Yes: one Prisma SQL migration, idempotent, `file_name` only; checked at tier 3 through `deploy:migrate` |

---

## 15. Media upload fixes (amended 2026-11-03, user report)

Scope: the cms-admin upload dialog, the File Card (`MediaGrid` card) and `MediaInput` (form-commons), the stored file name in cms-api media (new uploads and a rename migration for existing rows), and the proxy and server timeouts the upload path crosses. The media API keeps its routes and response shape; only the value of `fileName` changes (MU-3). Storage keys stay UUIDv7 (D12), so stored object names and URLs do not change.

### 15.1 Findings (from the code, 2026-11-03)

| # | Report | Cause |
|---|---|---|
| F1 | Progress bar jumps to 100 % on Safari (macOS), then the user still waits | The bar measures only bytes handed to the browser. Safari reports upload progress coarsely (often one event at the end), and after the last byte the server still spools, re-encodes (sharp) and uploads to Cloudinary inside the same request. The `processing` state exists in `UploadQueue.rules.ts`, but the dialog draws it as a full determinate bar and the batch bar counts it as complete. |
| F2 | Uploads often fail with "Could not reach the server..." (`canceled` in the network tab) | Every cms-admin request, uploads included, uses the 10 s client timeout (`API_TIMEOUT_MS`, `apis/client/Api.client.ts`). An upload whose sending plus server processing passes 10 s is aborted by axios (the browser shows `canceled`), and `toMediaError` maps every response-less failure, timeouts and user cancels included, to the network message. Behind it: Traefik v3 stops reading a request body after 60 s by default (`respondingTimeouts.readTimeout`), and Node's HTTP server ends a request after 300 s (`requestTimeout`). |
| F3 | File name format | The stored `fileName` is the sanitized original name; `MediaDetails` shows `<fileName> · <hash8>`. |
| F4 | Extension hidden on long names | The name is one `truncate` line, so its end (the extension) is cut first. |
| F5 | `MediaInput` footer has no frame | Preview and details sit loose in the field; the File Card has a bordered frame, `MediaInput` does not. |

### 15.2 Requirements

**MU-1 Honest progress (F1).** Owner: cms-admin `features/media` (`UploadQueue.rules.ts`, `useUploadQueue.ts`, `UploadDialog.tsx`).
- A file row shows a determinate bar with `Uploading <n> %` only while bytes are being sent and the browser reports a known total. When the total is unknown, or once every byte is sent, the row shows an indeterminate bar (native `<progress>` without `value`) with the existing `Processing...` label until the server answers.
- No bar, per file or batch, shows 100 % before the server has answered for every file it covers.
- Batch bar: each accepted file is weighed by its size. While sending, its sent bytes count for `UPLOAD_SENT_SHARE` = `0.9` of the file (named constant in `UploadQueue.rules.ts`); a `processing` file counts 90 %; a `done` or `failed` file counts 100 % (settled; a failed one is still listed as failed). Processing fills the last 10 % only when the server answers. The bar never moves backwards.
- Screen readers: the indeterminate bar keeps its accessible name; the row's status text changes from the percentage to `Processing...`.

**MU-2 Uploads are not cut off by a timeout (F2), and slow requests are bounded (SQ-1).** Owners: cms-admin `features/media` (`Media.api.ts`, `Media.constants.ts`, `Media.errors.ts`), `features/auth` (`Auth.interceptor.ts`, fresh token before an upload) and `apis/client/ApiFailure.errors.ts`; cms-api `Bootstrap.setup.ts` (where the app listens; `main.ts` only calls `bootstrap()`); `docker-compose.smoke.yml`; `docs/deployment/k3s-traefik.md`. Amended 2026-11-03 (user, Q-UT3 option 2, ADR 0014): N = 5 min.
- `upload` and `replaceFile` pass `timeout: MEDIA_UPLOAD_TIMEOUT_MS` = 4 min (constant in `Media.constants.ts`, below the proxy's N so the browser reports "took too long" before the proxy cuts) instead of the 10 s default; every other call keeps `API_TIMEOUT_MS`.
- `ApiFailure.errors.ts` gains two additive exports, `isRequestTimeout(error)` and `isRequestCanceled(error)`; the `ApiFailure` union is unchanged, so no other caller changes. `toMediaError` checks them first: a timeout shows the new copy `COPY.media.errors.timeout` ("The upload took too long. Try again, or try a smaller file."); a cancel the user started (remove, stop, close) shows no error (the row is already gone). The network message stays for real connection failures.
- **Fresh token before an upload (S).** cms-api checks the access token when the request headers arrive, and an early 401 to a half-sent upload can reach the browser as a network error (the proxy closes the connection). So `upload` and `replaceFile` opt in, per request, to a check in the auth interceptor: when the in-memory access token's JWT `exp` is less than `ACCESS_TOKEN_REFRESH_MARGIN_MS` (60 s) away, or `exp` cannot be read, the interceptor runs the existing single-flight, cross-tab refresh first and sends the new token. A refused refresh ends the session as the 401 path does, and the upload is not sent. Other calls are unchanged (refresh on 401 and retry once).
- **Proxy (smoke and the deploy repo).** The Traefik entrypoint `readTimeout` is N = 5 min for every route (it also bounds slow request headers). A separate router `api-upload` matches only `POST /api/v1/media` and `PUT /api/v1/media/:id/file`, in every path form cms-api accepts (case-insensitive, optional trailing slash; MUF-8-security#1) (explicit priority above `api`, same service) with the middlewares `api-inflight` (`inFlightReq`, 100 per client IP) and `upload-close` (`headers.customResponseHeaders`, `Connection: close`). The `api` router keeps `api-inflight` too, because the 5 min entrypoint value applies to every `/api` route, login and the other anonymous routes included (each router counts its own 100). `Connection: close` makes Traefik skip draining up to 256 KB of an unread body before it answers, so an early 401/403 to a slow anonymous upload ends at once; keep-alive stays on for every other route. Traefik stays `v3.6` (no router-level timeouts). The first task confirms on smoke that the header reaches the client on v3.6 and that slow headers are bounded by the entrypoint value.
- cms-api sets the Node server `requestTimeout` = N (5 min) from a named constant in `Bootstrap.setup.ts` (no new env key; `headersTimeout` stays at the Node default) and keeps the error-filter change that closes the socket after a 401/403 to an unfinished multipart request (defence in depth when Node is reached directly). `docs/deployment/k3s-traefik.md` states the values, the `api-upload` route and its two `Middleware` objects for the deploy repo, and the real cause of the slow-body hold.
- Accepted limits: an upload slower than 4 min fails with the timeout copy (100 MB needs about 3.5 Mbit/s); slow requests on any route are held at most 5 min (was 60 s by Traefik's default before this section); every upload response closes its connection; HTTP/2 and TLS behaviour cannot be shown on smoke (plain HTTP/1.1).
- Rate limits, size limits (§6) and the D12 checks are unchanged.

**MU-3 Stored file name `<stem>_<hash8>.<ext>` (F3).** Owner: cms-api `modules/media` (high-risk path, security gate). The rule `storedFileNameOf(originalName, sha256, mimeType)` lives in `domain/MediaUpload.rules.ts` and is applied once, in the step that produces the prepared upload (where the hash of the stored bytes is known), so `POST /media` and `PUT /media/:id/file` both store it without their own copy of the rule.
- `<stem>`: the sanitized original name (existing `sanitizeFileName`) without its extension. `<hash8>`: the first 8 hex characters of the `sha256` of the stored bytes (after re-encoding). `<ext>`: the original extension, lower-cased, when it belongs to the detected type; otherwise the detected type's canonical extension (`jpeg` -> `jpg`, `png`, `webp`, `gif`, `avif`, `pdf`, `mp4`). A name with no extension gets the canonical one.
- Examples: `Photo.JPG` -> `Photo_a1b2c3d4.jpg`; `scan` (a pdf) -> `scan_9f8e7d6c.pdf`; `fake.png` holding JPEG bytes -> `fake_a1b2c3d4.jpg`.
- Uploading a file whose stem already ends with `_<hash8>` of the same bytes keeps the name (no `x_a1b2c3d4_a1b2c3d4.jpg`).
- The stem is cut so the whole name stays within `FILE_NAME_MAX_LENGTH` (255 characters); the suffix `_<hash8>.<ext>` is never cut.
- A replace stores the new file's name with the new hash. The tombstone row keeps the previous name (unchanged behaviour).
- Search by name keeps working on the original stem (`search` matches `file_name`).
- **Existing rows (Q-MU6):** one Prisma migration (`apps/cms-api/prisma/migrations/<timestamp>_media_stored_file_name/migration.sql`, plain SQL, no app code) renames every `file_library` row, live and tombstoned, to the same rule: `<stem>_<left(sha256, 8)>.<ext>`, using the row's `mime_type` for the extension check and the canonical extension, and cutting the stem so the name fits 255 characters. A row that already ends with `_<left(sha256, 8)>.<ext>` is left as is, so running the SQL twice changes nothing. It runs with the other migrations through `db:migrate` / `deploy:migrate`; no new CLI and no new env key. It changes only `file_name` (no key, URL, hash or timestamp). Document references read the name from the row, so they show the new name without a rewrite.
- The SQL and `storedFileNameOf` must give the same name for the same row; an integration test checks this on a shared fixture set (acceptance 4a).

**MU-4 The extension stays visible (F4, Q-MU3).** Owner: form-commons `media-input/` (new exported component `FileName`; an additive public API change, `PublicApi.snapshot.ts` updated).
- `FileName` splits a name into a shrinking head and a fixed tail: the tail is `_<hash8>.<ext>` when the name ends that way, else `.<ext>`, else empty. The head truncates with an ellipsis; the tail never shrinks: `a-very-long-holiday-ph..._a1b2c3d4.jpg`. The full name stays in `title` and in the accessible text (no ellipsis read out).
- `MediaDetails` shows the stored `fileName` through `FileName` and drops the ` · <hash8>` addition (the hash is now in the name). The `sha256` prop stays accepted (public API unchanged).
- The cms-admin upload dialog file rows show the local file name through `FileName` while the file waits or is sent, and the stored name from the server's answer once it is done.
- Works at the narrowest File Card width, in `MediaInput` at the editor's narrowest column, and in the upload dialog rows.

**MU-5 `MediaInput` frame (F5).** Owner: form-commons `media-input/MediaInput.tsx`.
- With a file attached, the preview and the details footer (with the Delete button) sit inside one frame with the File Card's look: `rounded-md border border-border bg-card p-3`, theme tokens only. The empty drop area keeps its dashed border. When the field has an error, the frame border uses the field's error token, like other inputs.

### 15.3 Acceptance

1. Unit (cms-admin): progress events `0 -> total` move the item `uploading -> processing`; the batch percent stays at or below 90 % of the file until `markDone`, then reaches 100 %; with an unknown total the row renders `<progress>` without `value`; the batch percent never decreases across a sequence of events.
2. Unit (cms-admin): `upload` and `replaceFile` send `timeout = MEDIA_UPLOAD_TIMEOUT_MS` (4 min), other media calls keep the default; an axios timeout maps to the timeout copy, a cancel to no visible error, a response-less failure to the network copy.
2a. Unit (cms-admin): a request that opts in to the fresh-token check, with an access token whose `exp` is under 60 s away or unreadable, is sent only after one shared refresh and carries the new token; a token with more time left is sent as is without a refresh; a refused refresh ends the session and the request is not sent; requests that do not opt in behave as before; `upload` and `replaceFile` opt in, other media calls do not.
3. Unit (cms-api): `storedFileNameOf` gives the examples of MU-3, keeps an already-suffixed name, uses the canonical extension on a mismatch, and cuts a 300-character stem so the name is 255 characters with the suffix whole.
4. Integration (cms-api): `POST /media` and `PUT /media/:id/file` answer and store `fileName` = `<stem>_<first 8 of sha256>.<ext>`; `GET /media?search=<original stem>` finds the file.
4a. Integration (cms-api, Testcontainers): rows seeded with old names (with and without extension, upper-case extension, mismatched extension, a 255-character name, a tombstone, one already in the new format) are renamed by the migration SQL exactly as `storedFileNameOf` names them; running the SQL a second time changes no row; `storage_key`, `url`, `sha256` and `updated_at` are unchanged.
5. Unit (form-commons): `FileName` keeps `_a1b2c3d4.jpg`, `.pdf` or nothing as the fixed tail, `title` holds the full name; `MediaDetails` renders the stored name without ` · `; `MediaInput` with a value renders one bordered frame containing the preview and `media-details`; the empty state is unchanged.
6. Tier 3: through the smoke proxy, an upload whose request lasts longer than 60 s and less than 4 min (a throttled upload of a large allowed file) succeeds.
6b. Tier 3 (smoke proxy, Traefik v3.6): an anonymous 200 KB multipart `POST /api/v1/media` sent at 2 KB/s gets its 401 within 5 s with `Connection: close` and the connection closes; an anonymous `PUT /api/v1/media/<id>/file` also answers with `Connection: close`; other `/api` answers carry no `Connection: close` and keep the connection; a request whose headers arrive slowly, to `/api/v1/media` or any other route, is closed by the proxy after about 5 min, not 15.
6a. Tier 3: on the smoke stack, `deploy:migrate` applies the new migration on a database that already holds media rows with old names (seeded before the migration), the API then lists them in the new format, and a second `deploy:migrate` run reports nothing to apply.
7. Tier 2 browser (Chromium): the upload dialog shows the indeterminate bar after sending and no 100 % before the row is done; dialog rows, File Card and `MediaInput` show long names with the extension visible; the `MediaInput` frame is visible.
8. Manual (user, Safari on macOS; no WebKit e2e project, Q-MU4): the bar no longer sits at 100 % while waiting; a 50 MB video upload completes.

### 15.4 Out of scope

Resumable or chunked uploads, direct browser-to-Cloudinary uploads, changing storage keys, object names or URLs (D12), a WebKit e2e project.

## 16. Remember me (2026-11-03, user request; Q-RM1..Q-RM8 answered 2026-11-03; approved by the user 2026-11-03)

Status: **approved 2026-11-03** (user). The one-line updates of §16.6 are applied to §6, §7 (D21, new D22), §8.1, §9 and §12 (criteria 26, 27). Planned as feature `remember-me` in `tasks/plan.md`.

Scope (Q-RM1, user): both sign-ins, cms-admin and apps/web, with the cms-api identity module behind them. Today every cms-admin sign-in sets the refresh cookie `__Secure-abyss_rt` with `Max-Age` = 7 days (`setRefreshCookie`, `http/Auth.controller.ts`) and every refresh token row lives 7 days, sliding on each rotation: every user is always remembered. This section makes that a choice on each sign-in form.

**Dependency on web-bff-hardening.** The web part (RM-6) is written against the web BFF of D21 (`/bff/v1/auth/login`, the sealed `__Host-abyss_web_session` cookie), which is not built yet (feature `web-bff-hardening`, `todo`). It cannot be built before that feature, and building it on the web's current login would be thrown away by D21. The cms-api part (RM-1..RM-4) and the cms-admin part (RM-5) do not depend on it. Delivery (Q-RM6, user): one feature `remember-me` with two phases: phase 1 cms-api + cms-admin (RM-1..RM-5), phase 2 apps/web (RM-6), built only after web-bff-hardening is done. The feature enters `.claude/state/features.md` as `todo` (approved 2026-11-03).

### 16.1 Behaviour

| Choice on the sign-in form | Browser cookie (cms-admin: `__Secure-abyss_rt`; web: `__Host-abyss_web_session`) | Server-side refresh token lifetime (cms-api) | After the browser closes |
|---|---|---|---|
| "Keep me signed in" ticked | persistent: `Max-Age` = `REFRESH_TOKEN_TTL_MS` (7 days, §6, unchanged), set again on every refresh | 7 days, sliding on every rotation (unchanged) | still signed in, until 7 days without use |
| not ticked (default, Q-RM3) | session cookie: no `Max-Age`, no `Expires` | `SESSION_REFRESH_TOKEN_TTL_MS` = 12 hours, sliding on every rotation (Q-RM2) | signed out; a browser that restores session cookies still loses the session 12 hours after the last use |

- The choice belongs to the session (the refresh token family), not to the account or the device: each sign-in decides again, and the form never pre-ticks the box from an earlier choice.
- Every rotation keeps the family's choice: the successor row copies it, and the new cookie is set in the same mode with the lifetime of that mode. The reuse grace path sets no cookie (unchanged).
- cms-api is the one place that enforces the lifetime (the refresh token row's `expires_at`); the cookie mode only decides whether the browser keeps the cookie after it closes.
- Unchanged by this section: access token TTL (15 min), cookie names, flags and paths (`__Secure-abyss_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, host-only; `__Host-abyss_web_session` and `__Host-abyss_web_2fa` as in D21), the 300 s web 2FA cookie, rotation and reuse detection (D9), logout, `POST /accounts/:id/sessions/revoke`, the `token_version` bump on password change or reset, rate limits, the Origin allowlist (D14), the BFF pipeline and Turnstile checks (D21).
- Neither app stores the email or the choice anywhere in the browser (Q-RM4); cms-admin keeps the access token in memory only (unchanged).

### 16.2 Requirements

**RM-1 Login request (cms-api, identity, high-risk path, security gate).** Owner: `modules/identity`.
- `POST /auth/login` body gains the optional `rememberMe: boolean` (additive; absent = `false`). Any other type → `400 INVALID_REQUEST` (existing code and message).
- Password-only login: the session starts with that choice.
- Two-factor login: the choice travels inside the signed 2FA temp token as the claim `rm` (boolean), set by `AccessTokenService.signTwoFactorTempToken`; `POST /auth/2fa/verify` starts the session with the claim's value and never reads a choice from its own body. A temp token without `rm` (issued before the deploy) counts as `false`.
- The only places that start a session stay `AuthService.startSession` (login and `TwoFactorLoginService`); `startSession` takes the choice as one added parameter.

**RM-2 Refresh token lifetime (cms-api, identity).** Owner: `modules/identity` (`domain/Authentication.rules.ts`, `domain/Identity.constants.ts`, `application/RefreshToken.service.ts`, `adapters/PrismaRefreshToken.repository.ts`).
- `refresh_tokens` gains `remember_me boolean NOT NULL DEFAULT true` (Q-RM5) through one Prisma migration; existing rows keep `true`, which matches the 7-day persistent cookie they were issued with. New rows always write the value explicitly.
- One rule, `refreshTokenTtlMsOf(rememberMe)` in `domain/Authentication.rules.ts`, gives `REFRESH_TOKEN_TTL_MS` or `SESSION_REFRESH_TOKEN_TTL_MS` (named constants in `domain/Identity.constants.ts`). `issue` and `rotate` both use it; `rotate` takes the choice from the presented row.
- The session result of login, 2FA verify and refresh carries `rememberMe`, so the controllers set the cookie without a second read.

**RM-3 Refresh cookie (cms-api, identity; tier 3 area).** Owner: `http/Auth.controller.ts` (`setRefreshCookie`, also used by `http/TwoFactor.controller.ts`).
- `setRefreshCookie(res, token, rememberMe)`: `true` → today's options plus `maxAge: REFRESH_TOKEN_TTL_MS`; `false` → the same options without `maxAge` or `expires`. `clearRefreshCookie` is unchanged.
- cms-api's JSON responses are unchanged: the web BFF learns the mode from its own sealed state (RM-6), never by parsing cms-api's `Set-Cookie` attributes.

**RM-4 Audit (cms-api, security-audit through identity).** `auth.login_succeeded` metadata gains `rememberMe` next to `twoFactorMethod` (D15). No new audit action.

**RM-5 Sign-in form (cms-admin).** Owners: `views/login/LoginPage.tsx`, `features/auth/Auth.api.ts` (`LoginCredentials` gains `rememberMe`), `configs/copy/Login.copy.ts` (and `copy.snapshot.json`).
- A checkbox under the password field, using form-commons `CheckboxInput` (the react-hook-form-bound checkbox, whose `description` is linked by `aria-describedby`; no new component): label `COPY.login.rememberMe` = "Keep me signed in", hint `COPY.login.rememberMeHint` = "Use this only on a device you trust." Unticked on every visit to the page.
- The value is sent as `rememberMe` with the email and password; the 2FA modal is unchanged (the choice is already in the temp token).
- Keyboard and screen reader: the label is the checkbox's accessible name, the hint is linked with `aria-describedby`; Space toggles; the tab order is email, password, checkbox, submit.

**RM-6 Web sign-in (apps/web; after web-bff-hardening; high-risk path `apps/web/src/features/auth`, security gate; tier 3 area).** Owners: the BFF login, 2FA verify and session code that D21 creates (`app/bff/v1/auth/**/route.ts`, `apis/server/`, `features/session`) and `features/auth/WebLoginDialog.tsx` with the web copy module (`configs/Copy.constants.ts`).
- `POST /bff/v1/auth/login` body gains the optional `rememberMe: boolean` (absent = `false`), added to its Zod schema (unknown keys still refused); the BFF passes it to cms-api `POST /auth/login`.
- The BFF keeps the choice in its sealed state: in `__Host-abyss_web_2fa` while the 2FA step is open, and in `__Host-abyss_web_session` as `{ refreshToken, accessToken, accessExpiresAt, rememberMe }`. `POST /bff/v1/auth/two-factor/verify` takes it from the sealed 2FA cookie, never from its body.
- `__Host-abyss_web_session` is set with `Max-Age` = `REFRESH_TOKEN_TTL_MS` (7 days) when `rememberMe` is true, and as a session cookie otherwise; every BFF refresh that rewrites the cookie keeps the mode and, when remembered, sets `Max-Age` again (sliding). The 7-day value comes from one named web constant; the 12-hour limit is enforced by cms-api only.
- A sealed session without `rememberMe` (written before the deploy) counts as `false` and is rewritten as a session cookie on its next refresh.
- `WebLoginDialog`: the same checkbox and the same text as RM-5 (Q-RM8, user): label "Keep me signed in", hint "Use this only on a device you trust.", held in the web copy module, unticked every time the dialog opens, sent with the login request; the 2FA step is unchanged. It uses the web app's existing checkbox, or a native `<input type="checkbox">` styled with the web theme tokens when the web has none (no new dependency).
- `GET /bff/v1/session`, sign-out, the privileged-account refusal and every other D21 rule are unchanged.

### 16.3 Acceptance

1. Unit (cms-api): the login schema accepts `rememberMe` `true`, `false` and absent (`false`) and refuses `"true"`, `1` and `null` with `400 INVALID_REQUEST`.
2. Unit (cms-api): `refreshTokenTtlMsOf(true)` = 7 days, `refreshTokenTtlMsOf(false)` = 12 hours; `issue` writes `expires_at` and `remember_me` from the choice; `rotate` copies `remember_me` and slides `expires_at` by that mode's TTL.
3. Unit (cms-api): the 2FA temp token carries `rm` from the login request; a temp token without `rm` verifies and starts a session with `rememberMe = false`.
4. Integration (cms-api): `POST /auth/login` with `rememberMe: true` sets `__Secure-abyss_rt` with `Max-Age=604800`; with `false` or absent the cookie has neither `Max-Age` nor `Expires`; `POST /auth/refresh` keeps the mode of the family; the TOTP and email 2FA paths behave the same; `auth.login_succeeded` metadata holds `rememberMe`.
5. Integration (cms-api): a not-remembered refresh token presented 12 hours plus 1 s after its last rotation → `401` and the cookie is cleared; a remembered one at the same time still rotates.
6. Integration (cms-api, Testcontainers): the migration gives every existing `refresh_tokens` row `remember_me = true` and changes no other column.
7. Unit (cms-admin): the checkbox renders unticked with its label and hint; submitting sends `rememberMe` `false` or `true` as ticked; the copy snapshot holds the two new strings.
8. Tier 2 browser (Chromium, cms-admin): sign in unticked → `__Secure-abyss_rt` is a session cookie (Playwright `expires === -1`); sign in ticked → it expires about 7 days from now; after a page reload both stay signed in.
9. Unit (apps/web): the BFF login schema accepts `rememberMe` `true`, `false`, absent and refuses other types; the sealed session round-trips `rememberMe`; a sealed session without it reads as `false`; the cookie writer sets `Max-Age` only when remembered; the 2FA verify route takes the choice from the sealed 2FA cookie and ignores a `rememberMe` in its body; `WebLoginDialog` renders the box unticked and sends its value.
10. Tier 2 browser (Chromium, apps/web, after web-bff-hardening): sign in unticked, with and without 2FA → `__Host-abyss_web_session` has `expires === -1`; ticked → about 7 days; a BFF refresh keeps each mode; the browser still holds no access or refresh token (§12 criterion 22).
11. Tier 3: through the smoke proxy, both modes' `Set-Cookie` for `__Secure-abyss_rt` keep `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` and no `Domain`, and for `__Host-abyss_web_session` keep the D21 flags (`HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`); only `Max-Age` differs.

### 16.4 Out of scope

Remembering the email, a trusted device that skips 2FA, a "signed-in devices" list, an absolute session cap, changing the 7-day remembered lifetime, building the web part before web-bff-hardening.

### 16.5 Decisions and open points

Answered by the user (2026-11-03): Q-RM1 both cms-admin and apps/web (web part after web-bff-hardening) · Q-RM2 ticked 7 days sliding, unticked a session cookie with a 12-hour sliding server lifetime · Q-RM3 unticked by default · Q-RM4 the email is not remembered; label "Keep me signed in", hint "Use this only on a device you trust." · Q-RM5 names `rememberMe`, `refresh_tokens.remember_me` (default `true` for existing rows), claim `rm`, `SESSION_REFRESH_TOKEN_TTL_MS`, `refreshTokenTtlMsOf`.

Answered by the user (2026-11-03, second round): Q-RM6 one feature `remember-me`, phase 1 cms-api + cms-admin, phase 2 apps/web after web-bff-hardening is done; added to `features.md` as `todo` only after this section is approved · Q-RM7 D21 is amended as in §16.6; ADR 0017 (cited by D21, missing from `docs/adr/`) is rewritten when web-bff-hardening is re-planned, and includes RM-6 · Q-RM8 the web dialog uses the cms-admin label and hint.

No open questions remain in this section; approved by the user 2026-11-03.

### 16.6 Spec updates on approval (applied 2026-11-03)

- §6 `Access / refresh TTL`: "15 min / 7 days when 'Keep me signed in' is ticked, else 12 hours with a session cookie (rotated on every refresh, §16)". `Refresh cookie`: add "persistent (`Max-Age` 7 days) only for a remembered session, else a session cookie (§16)".
- §7: new **D22 Remember me** pointing to §16 (choice per session family, carried in the 2FA temp token, cookie mode per family, lifetime enforced by cms-api).
- §7 D21 "Session" (Q-RM7, user): the sealed session also holds `rememberMe`; `__Host-abyss_web_session` is a browser-session cookie (no `Max-Age`, no `Expires`) unless remembered, then `Max-Age` 7 days, set again on each refresh; `POST /bff/v1/auth/login` takes `rememberMe?` and the sealed 2FA cookie carries it to verify (§16 RM-6). D21 also gains the note: "ADR 0017 is to be rewritten when web-bff-hardening is re-planned (the file is missing from `docs/adr/`); the rewrite includes §16 RM-6."
- §8.1 `refresh_tokens`: add `remember_me`.
- §9 Auth: `POST /auth/login` body `{ email, password, rememberMe? }`; Web BFF: `POST /bff/v1/auth/login` body gains `rememberMe?`.
- §12: one criterion for acceptance 4 and 5, one for acceptance 10.
